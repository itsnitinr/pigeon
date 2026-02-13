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

  if (text.trim().length > 0) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  return { status: response.status, data }
}

async function main() {
  loadLocalEnv()

  const databaseUrl = process.env.DATABASE_URL
  assert(databaseUrl, 'DATABASE_URL is required (.env at repo root)')

  const apiPort = process.env.API_PORT ?? '3001'
  const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${apiPort}`

  const pool = new Pool({ connectionString: databaseUrl })

  const projectId = randomUUID()
  const envId = randomUUID()
  const apiKeyId = randomUUID()

  const userId = `smoke-user-${randomUUID().slice(0, 8)}`
  const idempotencyKey = `smoke-idem-${randomUUID()}`
  const jwtSecret = `smoke-jwt-${randomUUID()}-${randomUUID()}`

  const rawApiKey = `pk_test_${randomUUID().replace(/-/g, '')}`
  const apiKeyPrefix = rawApiKey.slice(0, 16)

  console.log(`Using API base URL: ${baseUrl}`)
  console.log('Creating test project/environment/api key in DB...')

  await pool.query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [
    projectId,
    `Smoke Project ${projectId.slice(0, 6)}`,
    `smoke-${projectId.slice(0, 10)}`
  ])

  await pool.query(
    "INSERT INTO environments (id, project_id, name, jwt_secret) VALUES ($1, $2, 'development', $3)",
    [envId, projectId, jwtSecret]
  )

  // For smoke tests we store key_hash as plaintext; auth middleware currently supports this fallback.
  await pool.query(
    'INSERT INTO api_keys (id, environment_id, name, key_hash, key_prefix, is_revoked) VALUES ($1, $2, $3, $4, $5, FALSE)',
    [apiKeyId, envId, 'smoke-key', rawApiKey, apiKeyPrefix]
  )

  console.log('1) GET /health')
  const health = await requestJson(baseUrl, 'GET', '/health')
  assert(health.status === 200, `Expected 200 from /health, got ${health.status}`)

  console.log('2) POST /v1/notifications (first send)')
  const sendOne = await requestJson(baseUrl, 'POST', '/v1/notifications', rawApiKey, {
    userId,
    type: 'smoke.test',
    title: 'Smoke Notification',
    body: 'Phase 4 smoke test payload',
    data: { source: 'phase4-smoke', ok: true },
    idempotencyKey
  })
  assert(sendOne.status === 201, `Expected 201 on first send, got ${sendOne.status}`)
  assert(typeof sendOne.data === 'object' && sendOne.data !== null, 'First send response must be JSON object')

  const notificationId = sendOne.data.notificationId
  assert(notificationId, 'First send response missing notificationId')

  console.log('3) POST /v1/notifications (idempotent resend)')
  const sendTwo = await requestJson(baseUrl, 'POST', '/v1/notifications', rawApiKey, {
    userId,
    type: 'smoke.test',
    title: 'Smoke Notification',
    body: 'Phase 4 smoke test payload',
    data: { source: 'phase4-smoke', ok: true },
    idempotencyKey
  })
  assert(sendTwo.status === 200, `Expected 200 on idempotent resend, got ${sendTwo.status}`)
  const resendId = sendTwo.data.notificationId
  assert(resendId === notificationId, 'Idempotent resend returned different notificationId')

  console.log('4) POST /v1/users/:userId/token')
  const tokenRes = await requestJson(
    baseUrl,
    'POST',
    `/v1/users/${encodeURIComponent(userId)}/token`,
    rawApiKey,
    { ttlSeconds: 3600 }
  )
  assert(tokenRes.status === 201, `Expected 201 when minting token, got ${tokenRes.status}`)
  const userToken = tokenRes.data.token
  assert(userToken, 'Token response missing token')

  console.log('5) GET /v1/notifications')
  const listOne = await requestJson(baseUrl, 'GET', '/v1/notifications', userToken)
  assert(listOne.status === 200, `Expected 200 on list, got ${listOne.status}`)
  const listOneItems = listOne.data.items ?? []
  assert(listOneItems.some((item) => item.id === notificationId), 'Created notification not found in list')

  console.log('6) POST /v1/notifications/:id/read')
  const readOne = await requestJson(baseUrl, 'POST', `/v1/notifications/${notificationId}/read`, userToken)
  assert(readOne.status === 200, `Expected 200 on mark read, got ${readOne.status}`)

  console.log('7) GET /v1/notifications?unread=true')
  const unreadList = await requestJson(baseUrl, 'GET', '/v1/notifications?unread=true', userToken)
  assert(unreadList.status === 200, `Expected 200 on unread list, got ${unreadList.status}`)
  const unreadItems = unreadList.data.items ?? []
  assert(!unreadItems.some((item) => item.id === notificationId), 'Read notification still appears in unread list')

  console.log('8) POST /v1/notifications/read-all')
  const readAll = await requestJson(baseUrl, 'POST', '/v1/notifications/read-all', userToken)
  assert(readAll.status === 200, `Expected 200 on read-all, got ${readAll.status}`)

  console.log('9) POST /v1/notifications/:id/archive')
  const archive = await requestJson(baseUrl, 'POST', `/v1/notifications/${notificationId}/archive`, userToken)
  assert(archive.status === 200, `Expected 200 on archive, got ${archive.status}`)

  console.log('10) GET /v1/notifications (after archive)')
  const listAfterArchive = await requestJson(baseUrl, 'GET', '/v1/notifications', userToken)
  assert(listAfterArchive.status === 200, `Expected 200 after archive list, got ${listAfterArchive.status}`)
  const finalItems = listAfterArchive.data.items ?? []
  assert(!finalItems.some((item) => item.id === notificationId), 'Archived notification still appears in list')

  console.log('\nPhase 4 smoke test passed.')
  console.log(`notificationId: ${notificationId}`)
  console.log(`projectId: ${projectId}`)
  console.log(`environmentId: ${envId}`)

  await pool.end()
}

main().catch((error) => {
  console.error('\nPhase 4 smoke test failed:')
  console.error(error)
  process.exitCode = 1
})
