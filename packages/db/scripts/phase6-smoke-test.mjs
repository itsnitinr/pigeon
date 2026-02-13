import { createHmac, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Queue } from 'bullmq'
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

async function requestJson(baseUrl, method, path, token, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  const text = await response.text()
  let data = null

  if (text.trim()) {
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

async function waitFor(description, fn, timeoutMs = 20000, intervalMs = 500) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn()

      if (result) {
        return result
      }
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  if (lastError) {
    throw new Error(`${description} timed out: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  }

  throw new Error(`${description} timed out`)
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
      // keep raw
    }
  }

  return { id, event, data }
}

function createSseClient(baseUrl, token) {
  const controller = new AbortController()
  const state = {
    events: [],
    waiters: [],
    closed: false
  }

  const start = async () => {
    try {
      const response = await fetch(`${baseUrl}/v1/stream`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`
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
    state.closed = true
    controller.abort()
  }

  return { start, waitForEvent, close }
}

function createWebhookServer(secret) {
  const received = []

  const server = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('method-not-allowed')
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString('utf8')
    })

    req.on('end', () => {
      const signature = req.headers['x-pigeon-signature']
      const computed = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

      received.push({
        path: req.url || '/',
        body,
        signature,
        computed,
        event: req.headers['x-pigeon-event']
      })

      res.statusCode = signature === computed ? 200 : 400
      res.end('ok')
    })
  })

  const listen = () =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })

  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve())
    })

  return {
    received,
    server,
    listen,
    close,
    getUrl() {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Webhook server not listening')
      }

      return `http://127.0.0.1:${address.port}/webhook`
    }
  }
}

function parseRedisConnection(redisUrl) {
  const parsed = new URL(redisUrl)
  const dbPath = parsed.pathname.replace('/', '')

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    db: dbPath ? Number(dbPath) || 0 : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(parsed.password ? { password: parsed.password } : {})
  }
}

async function main() {
  loadLocalEnv()

  const databaseUrl = process.env.DATABASE_URL
  assert(databaseUrl, 'DATABASE_URL is required')

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  const apiPort = process.env.API_PORT ?? '3001'
  const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${apiPort}`

  const pool = new Pool({ connectionString: databaseUrl })
  const cleanupQueue = new Queue('maintenance', {
    connection: parseRedisConnection(redisUrl)
  })

  const userId = `phase6-user-${randomUUID().slice(0, 8)}`
  const projectId = randomUUID()
  const environmentId = randomUUID()
  const apiKeyId = randomUUID()
  const successWebhookId = randomUUID()
  const failingWebhookId = randomUUID()
  const templateType = `phase6.template.${randomUUID().slice(0, 6)}`

  const jwtSecret = `phase6-jwt-${randomUUID()}-${randomUUID()}`
  const rawApiKey = `pk_test_${randomUUID().replace(/-/g, '')}`
  const apiKeyPrefix = rawApiKey.slice(0, 16)

  const webhookSecret = `whsec_${randomUUID().replace(/-/g, '')}`
  const webhookServer = createWebhookServer(webhookSecret)

  await webhookServer.listen()
  const webhookUrl = webhookServer.getUrl()

  console.log(`Using API base URL: ${baseUrl}`)
  console.log('0) Bootstrapping tenant, template, and webhook endpoints...')

  await pool.query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [
    projectId,
    `Phase6 Project ${projectId.slice(0, 6)}`,
    `phase6-${projectId.slice(0, 10)}`
  ])

  await pool.query(
    "INSERT INTO environments (id, project_id, name, jwt_secret) VALUES ($1, $2, 'development', $3)",
    [environmentId, projectId, jwtSecret]
  )

  await pool.query(
    'INSERT INTO api_keys (id, environment_id, name, key_hash, key_prefix, is_revoked) VALUES ($1, $2, $3, $4, $5, FALSE)',
    [apiKeyId, environmentId, 'phase6-key', rawApiKey, apiKeyPrefix]
  )

  await pool.query(
    `INSERT INTO templates (id, environment_id, type, title_template, body_template)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      randomUUID(),
      environmentId,
      templateType,
      'Hello {{user.name}}',
      'Invoice {{invoice.id}} is {{invoice.status}}'
    ]
  )

  await pool.query(
    `INSERT INTO webhook_endpoints (id, environment_id, url, secret, events, is_active)
     VALUES ($1, $2, $3, $4, $5::text[], TRUE)`,
    [successWebhookId, environmentId, webhookUrl, webhookSecret, ['notification.created']]
  )

  await pool.query(
    `INSERT INTO webhook_endpoints (id, environment_id, url, secret, events, is_active)
     VALUES ($1, $2, $3, $4, $5::text[], TRUE)`,
    [failingWebhookId, environmentId, 'http://127.0.0.1:1/unreachable', `whsec_fail_${randomUUID()}`, ['notification.created']]
  )

  console.log('1) Mint user token and connect SSE stream')

  const tokenRes = await requestJson(
    baseUrl,
    'POST',
    `/v1/users/${encodeURIComponent(userId)}/token`,
    rawApiKey,
    { ttlSeconds: 3600 }
  )

  assert(tokenRes.status === 201, `Expected 201 creating user token, got ${tokenRes.status}`)
  const userToken = tokenRes.data?.token
  assert(userToken, 'User token missing')

  const sse = createSseClient(baseUrl, userToken)
  const sseLoop = sse.start()

  await sse.waitForEvent((event) => event.event === 'connected', 15000)

  console.log('2) Send templated notification (worker should deliver + publish SSE)')

  const sendRes = await requestJson(baseUrl, 'POST', '/v1/notifications', rawApiKey, {
    userId,
    type: templateType,
    title: 'Fallback title',
    body: 'Fallback body',
    data: {
      user: { name: 'Nitin' },
      invoice: { id: 'INV-42', status: 'paid' }
    },
    idempotencyKey: `phase6-send-${randomUUID()}`
  })

  assert(sendRes.status === 201, `Expected 201 sending notification, got ${sendRes.status}`)
  const notificationId = sendRes.data?.notificationId
  assert(notificationId, 'notificationId missing from send response')

  const sseEvent = await sse.waitForEvent(
    (event) => event.event === 'notification.created' && event.data?.id === notificationId,
    20000
  )

  assert(sseEvent.id, 'Expected SSE notification.created event id')

  const delivered = await waitFor('notification delivery', async () => {
    const list = await requestJson(baseUrl, 'GET', '/v1/notifications?limit=10', userToken)

    if (list.status !== 200 || !Array.isArray(list.data?.items)) {
      return null
    }

    return list.data.items.find((item) => item.id === notificationId && item.status === 'delivered') || null
  })

  assert(delivered.title === 'Hello Nitin', `Expected templated title, got ${delivered.title}`)
  assert(
    delivered.body === 'Invoice INV-42 is paid',
    `Expected templated body, got ${delivered.body}`
  )

  console.log('3) Verify webhook success + failed attempt logging')

  await waitFor('successful webhook delivery', async () => {
    const success = webhookServer.received.find((entry) => entry.event === 'notification.created')

    if (!success) {
      return null
    }

    if (success.signature !== success.computed) {
      throw new Error('Webhook signature mismatch')
    }

    return success
  })

  const attempts = await waitFor('webhook attempt rows', async () => {
    const result = await pool.query(
      `SELECT webhook_endpoint_id, status, attempt_number, next_retry_at
       FROM webhook_delivery_attempts
       WHERE notification_id = $1`,
      [notificationId]
    )

    if (result.rows.length < 2) {
      return null
    }

    return result.rows
  })

  const successAttempt = attempts.find(
    (row) => row.webhook_endpoint_id === successWebhookId && row.status === 'success'
  )
  assert(successAttempt, 'Missing successful webhook attempt row')

  const failedAttempt = attempts.find(
    (row) => row.webhook_endpoint_id === failingWebhookId && row.status === 'failed'
  )
  assert(failedAttempt, 'Missing failed webhook attempt row')
  assert(Number(failedAttempt.attempt_number) === 1, 'Expected failed attempt_number=1')
  assert(failedAttempt.next_retry_at, 'Expected next_retry_at on failed attempt')

  console.log('4) Trigger cleanup maintenance job and verify old notifications are removed')

  const cleanupNotificationRes = await requestJson(baseUrl, 'POST', '/v1/notifications', rawApiKey, {
    userId,
    type: templateType,
    title: 'Cleanup candidate',
    body: 'to be deleted',
    data: { user: { name: 'Cleanup' }, invoice: { id: 'INV-C', status: 'open' } },
    idempotencyKey: `phase6-cleanup-${randomUUID()}`
  })

  assert(
    cleanupNotificationRes.status === 201,
    `Expected 201 sending cleanup notification, got ${cleanupNotificationRes.status}`
  )
  const cleanupNotificationId = cleanupNotificationRes.data?.notificationId
  assert(cleanupNotificationId, 'cleanup notificationId missing')

  await waitFor('cleanup notification delivered', async () => {
    const list = await requestJson(baseUrl, 'GET', '/v1/notifications?limit=20', userToken)
    if (list.status !== 200 || !Array.isArray(list.data?.items)) {
      return null
    }

    return list.data.items.find((item) => item.id === cleanupNotificationId && item.status === 'delivered') || null
  })

  await cleanupQueue.add(
    'cleanup-now',
    { ttlDays: 0 },
    {
      jobId: `cleanup-now-${randomUUID()}`,
      removeOnComplete: 100,
      removeOnFail: 100
    }
  )

  await waitFor('cleanup deletion', async () => {
    const list = await requestJson(baseUrl, 'GET', '/v1/notifications?limit=20', userToken)

    if (list.status !== 200 || !Array.isArray(list.data?.items)) {
      return null
    }

    const ids = new Set(list.data.items.map((item) => item.id))

    if (ids.has(notificationId) || ids.has(cleanupNotificationId)) {
      return null
    }

    return true
  }, 20000)

  sse.close()
  await Promise.race([sseLoop, new Promise((resolve) => setTimeout(resolve, 1000))])

  await webhookServer.close()
  await cleanupQueue.close()
  await pool.end()

  console.log('\nPhase 6 smoke test passed.')
  console.log(`projectId: ${projectId}`)
  console.log(`environmentId: ${environmentId}`)
  console.log(`userId: ${userId}`)
}

main().catch(async (error) => {
  console.error('\nPhase 6 smoke test failed:')
  console.error(error)
  process.exitCode = 1
})
