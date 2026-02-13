import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

  return { status: response.status, data }
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
      // keep raw string
    }
  }

  return { id, event, data }
}

function createSseClient(apiBaseUrl, token) {
  const controller = new AbortController()
  const state = {
    events: [],
    waiters: [],
    closed: false
  }

  const start = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/v1/stream`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
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

async function main() {
  loadLocalEnv()

  const demoServerBaseUrl = process.env.VITE_DEMO_SERVER_URL ?? 'http://localhost:3010'

  console.log(`Using demo server URL: ${demoServerBaseUrl}`)
  console.log('0) Checking demo server health...')
  const health = await requestJson(demoServerBaseUrl, 'GET', '/health')
  assert(health.status === 200, `Expected 200 from /health, got ${health.status}`)
  assert(health.data?.ok === true, 'Demo server health response missing ok=true')

  console.log('1) Fetching demo config...')
  const configRes = await requestJson(demoServerBaseUrl, 'GET', '/api/config')
  assert(configRes.status === 200, `Expected 200 from /api/config, got ${configRes.status}`)
  const apiBaseUrl = configRes.data?.apiBaseUrl
  const userId = configRes.data?.defaultUserId

  assert(typeof apiBaseUrl === 'string' && apiBaseUrl.length > 0, 'apiBaseUrl missing in config')
  assert(typeof userId === 'string' && userId.length > 0, 'defaultUserId missing in config')
  console.log(`   API base URL: ${apiBaseUrl}`)
  console.log(`   Default user: ${userId}`)

  console.log('2) Minting user token via demo server...')
  const tokenRes = await requestJson(demoServerBaseUrl, 'POST', '/api/token', null, { userId })
  assert(tokenRes.status === 200, `Expected 200 from /api/token, got ${tokenRes.status}`)
  const userToken = tokenRes.data?.token
  assert(typeof userToken === 'string' && userToken.length > 0, 'token missing in /api/token response')

  console.log('3) Connecting SSE stream...')
  const sse = createSseClient(apiBaseUrl, userToken)
  const sseLoop = sse.start()
  await sse.waitForEvent((event) => event.event === 'connected', 15000)

  const suffix = randomUUID().slice(0, 8)
  const notificationTitle = `Phase 11 demo smoke ${suffix}`

  console.log('4) Sending notification through demo server...')
  const sendRes = await requestJson(demoServerBaseUrl, 'POST', '/api/send', null, {
    userId,
    type: `demo.phase11.${suffix}`,
    title: notificationTitle,
    body: `Smoke test body ${suffix}`
  })

  assert(sendRes.status === 200, `Expected 200 from /api/send, got ${sendRes.status}`)
  const notificationId = sendRes.data?.id
  assert(typeof notificationId === 'string' && notificationId.length > 0, 'send response missing id')

  console.log('5) Waiting for realtime notification.created event...')
  const createdEvent = await sse.waitForEvent(
    (event) => event.event === 'notification.created' && event.data?.id === notificationId,
    20000
  )
  assert(createdEvent.id, 'Realtime event missing id')

  console.log('6) Validating notification appears in API list...')
  const listRes = await requestJson(apiBaseUrl, 'GET', '/v1/notifications?limit=20', userToken)
  assert(listRes.status === 200, `Expected 200 from /v1/notifications, got ${listRes.status}`)

  const items = Array.isArray(listRes.data?.items) ? listRes.data.items : []
  const createdItem = items.find((item) => item.id === notificationId)
  assert(createdItem, 'Created notification is missing from notifications list')
  assert(createdItem.title === notificationTitle, 'Created notification title mismatch')

  console.log('7) Marking notification read and expecting realtime notification.read...')
  const readRes = await requestJson(
    apiBaseUrl,
    'POST',
    `/v1/notifications/${encodeURIComponent(notificationId)}/read`,
    userToken,
  )
  assert(readRes.status === 200, `Expected 200 marking read, got ${readRes.status}`)

  await sse.waitForEvent(
    (event) => event.event === 'notification.read' && event.data?.id === notificationId,
    20000
  )

  sse.close()
  await Promise.race([sseLoop, new Promise((resolve) => setTimeout(resolve, 1000))])

  console.log('\nPhase 11 smoke test passed.')
  console.log(`notificationId: ${notificationId}`)
}

main().catch((error) => {
  console.error('\nPhase 11 smoke test failed:')
  console.error(error)
  process.exitCode = 1
})
