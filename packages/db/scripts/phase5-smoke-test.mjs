import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Pool } from 'pg'

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {}
  }

  const content = readFileSync(path, 'utf8')
  const result = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const eqIndex = line.indexOf('=')

    if (eqIndex <= 0) {
      continue
    }

    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

function loadLocalEnv() {
  const cwd = process.cwd()
  const merged = {
    ...parseEnvFile(resolve(cwd, '.env')),
    ...parseEnvFile(resolve(cwd, '.env.local'))
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function requestJson(baseUrl, method, path, token, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  const text = await response.text()
  let data = null

  if (text.trim().length > 0) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  return {
    status: response.status,
    data,
    headers: Object.fromEntries(response.headers.entries())
  }
}

function parseSseBlock(block) {
  const lines = block.split('\n')
  let id
  let event = 'message'
  const dataLines = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('id:')) {
      id = line.slice(3).trim()
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  const rawData = dataLines.join('\n')
  let data = rawData

  if (rawData) {
    try {
      data = JSON.parse(rawData)
    } catch {
      // keep raw string when not JSON
    }
  }

  return { id, event, data }
}

function createSseClient(baseUrl, token, options = {}) {
  const controller = new AbortController()
  const state = {
    events: [],
    waiters: [],
    connected: false,
    closed: false
  }

  const start = async () => {
    try {
      const response = await fetch(`${baseUrl}/v1/stream`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(options.lastEventId ? { 'last-event-id': options.lastEventId } : {})
        },
        signal: controller.signal
      })

      assert(response.status === 200, `SSE connection failed with status ${response.status}`)
      assert(response.body, 'SSE response has no body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          state.closed = true
          break
        }

        buffer += decoder.decode(value, { stream: true })

        while (true) {
          const splitIndex = buffer.indexOf('\n\n')

          if (splitIndex === -1) {
            break
          }

          const block = buffer.slice(0, splitIndex)
          buffer = buffer.slice(splitIndex + 2)

          if (!block.trim()) {
            continue
          }

          const parsed = parseSseBlock(block)
          state.events.push(parsed)

          if (parsed.event === 'connected') {
            state.connected = true
          }

          const pending = [...state.waiters]
          state.waiters = []

          for (const waiter of pending) {
            if (waiter.predicate(parsed)) {
              waiter.resolve(parsed)
            } else {
              state.waiters.push(waiter)
            }
          }
        }
      }
    } catch (error) {
      // Expected when the caller intentionally closes the SSE connection.
      if (state.closed && error && error.name === 'AbortError') {
        return
      }

      throw error
    }
  }

  const waitForEvent = (predicate, timeoutMs = 15000) => {
    const existing = state.events.find(predicate)

    if (existing) {
      return Promise.resolve(existing)
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.waiters = state.waiters.filter((entry) => entry.resolve !== wrappedResolve)
        reject(new Error(`Timed out waiting for SSE event after ${timeoutMs}ms`))
      }, timeoutMs)

      const wrappedResolve = (event) => {
        clearTimeout(timeout)
        resolve(event)
      }

      state.waiters.push({ predicate, resolve: wrappedResolve })
    })
  }

  const close = () => {
    if (!state.closed) {
      controller.abort()
      state.closed = true
    }
  }

  return {
    state,
    start,
    waitForEvent,
    close
  }
}

async function bootstrapTenant(pool) {
  const projectId = randomUUID()
  const envId = randomUUID()
  const apiKeyId = randomUUID()
  const jwtSecret = `phase5-jwt-${randomUUID()}-${randomUUID()}`
  const rawApiKey = `pk_test_${randomUUID().replace(/-/g, '')}`
  const apiKeyPrefix = rawApiKey.slice(0, 16)

  await pool.query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [
    projectId,
    `Phase5 Project ${projectId.slice(0, 6)}`,
    `phase5-${projectId.slice(0, 10)}`
  ])

  await pool.query(
    "INSERT INTO environments (id, project_id, name, jwt_secret) VALUES ($1, $2, 'development', $3)",
    [envId, projectId, jwtSecret]
  )

  await pool.query(
    'INSERT INTO api_keys (id, environment_id, name, key_hash, key_prefix, is_revoked) VALUES ($1, $2, $3, $4, $5, FALSE)',
    [apiKeyId, envId, 'phase5-key', rawApiKey, apiKeyPrefix]
  )

  return { projectId, envId, rawApiKey }
}

async function sendNotification(baseUrl, apiKey, userId, suffix) {
  const idempotencyKey = `phase5-idem-${suffix}-${randomUUID()}`

  const sendRes = await requestJson(baseUrl, 'POST', '/v1/notifications', apiKey, {
    userId,
    type: 'phase5.sse',
    title: `Phase 5 Event ${suffix}`,
    body: `Phase 5 SSE test event ${suffix}`,
    data: { source: 'phase5-smoke', suffix },
    idempotencyKey
  })

  assert(sendRes.status === 201, `Expected 201 when sending notification (${suffix}), got ${sendRes.status}`)
  assert(sendRes.data && sendRes.data.notificationId, `Missing notificationId for send ${suffix}`)

  return sendRes.data.notificationId
}

async function createUserToken(baseUrl, apiKey, userId) {
  const tokenRes = await requestJson(
    baseUrl,
    'POST',
    `/v1/users/${encodeURIComponent(userId)}/token`,
    apiKey,
    { ttlSeconds: 3600 }
  )

  assert(tokenRes.status === 201, `Expected 201 for token creation, got ${tokenRes.status}`)
  assert(tokenRes.data && tokenRes.data.token, 'Token response missing token')

  return tokenRes.data.token
}

async function markRead(baseUrl, userToken, notificationId) {
  const response = await requestJson(baseUrl, 'POST', `/v1/notifications/${notificationId}/read`, userToken)
  assert(response.status === 200, `Expected 200 marking read for ${notificationId}, got ${response.status}`)
  return response.data
}

async function assertRateLimit(baseUrl, apiKey, userId) {
  console.log('4) Rate limit burst test on token endpoint (expect at least one 429)')

  const attempts = 130
  const requests = Array.from({ length: attempts }, (_, index) =>
    requestJson(baseUrl, 'POST', `/v1/users/${encodeURIComponent(userId)}/token`, apiKey, {
      ttlSeconds: 60 + index
    })
  )

  const results = await Promise.all(requests)
  const limited = results.filter((result) => result.status === 429)

  assert(limited.length > 0, `Expected at least one 429 from ${attempts} parallel requests, got 0`)

  const retryHeader = limited.find((result) => result.headers['retry-after'])
  assert(Boolean(retryHeader), 'Expected retry-after header on at least one 429 response')

  console.log(`   Rate limiter triggered: ${limited.length}/${attempts} requests returned 429`) 
}

async function main() {
  loadLocalEnv()

  const databaseUrl = process.env.DATABASE_URL
  assert(databaseUrl, 'DATABASE_URL is required in .env/.env.local')

  const apiPort = process.env.API_PORT ?? '3001'
  const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${apiPort}`

  const pool = new Pool({ connectionString: databaseUrl })

  const userId = `phase5-user-${randomUUID().slice(0, 8)}`

  console.log(`Using API base URL: ${baseUrl}`)
  console.log('0) Bootstrapping tenant records...')
  const tenant = await bootstrapTenant(pool)

  console.log('1) Creating notification + token + SSE connection')
  const notificationA = await sendNotification(baseUrl, tenant.rawApiKey, userId, 'A')
  const userToken = await createUserToken(baseUrl, tenant.rawApiKey, userId)

  const sse = createSseClient(baseUrl, userToken)
  const sseLoop = sse.start()

  await sse.waitForEvent((event) => event.event === 'connected', 15000)

  console.log('2) Live SSE: mark notification A as read and expect realtime event')
  await markRead(baseUrl, userToken, notificationA)

  const liveReadEvent = await sse.waitForEvent(
    (event) => event.event === 'notification.read' && event.data && event.data.id === notificationA,
    15000
  )

  assert(liveReadEvent.id, 'Live notification.read SSE event missing id')
  console.log(`   Live SSE event id: ${liveReadEvent.id}`)

  console.log('3) Replay SSE: disconnect, emit event while offline, reconnect with Last-Event-ID')
  sse.close()
  await Promise.race([
    sseLoop,
    new Promise((resolve) => setTimeout(resolve, 1000))
  ])

  const notificationB = await sendNotification(baseUrl, tenant.rawApiKey, userId, 'B')
  await markRead(baseUrl, userToken, notificationB)

  const replaySse = createSseClient(baseUrl, userToken, { lastEventId: liveReadEvent.id })
  const replayLoop = replaySse.start()

  const replayedReadEvent = await replaySse.waitForEvent(
    (event) => event.event === 'notification.read' && event.data && event.data.id === notificationB,
    15000
  )

  assert(replayedReadEvent.id, 'Replayed notification.read SSE event missing id')

  replaySse.close()
  await Promise.race([
    replayLoop,
    new Promise((resolve) => setTimeout(resolve, 1000))
  ])

  await assertRateLimit(baseUrl, tenant.rawApiKey, userId)

  console.log('\nPhase 5 smoke test passed.')
  console.log(`projectId: ${tenant.projectId}`)
  console.log(`environmentId: ${tenant.envId}`)
  console.log(`userId: ${userId}`)

  await pool.end()
}

main().catch((error) => {
  console.error('\nPhase 5 smoke test failed:')
  console.error(error)
  process.exitCode = 1
})
