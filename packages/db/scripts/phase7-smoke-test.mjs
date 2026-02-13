import { execFileSync } from 'node:child_process'
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

  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  return { status: response.status, data }
}

async function ensureApiReachable(baseUrl) {
  const health = await requestJson(baseUrl, 'GET', '/health')
  assert(health.status === 200, `API is not reachable at ${baseUrl} (GET /health -> ${health.status})`)
}

async function main() {
  loadLocalEnv()

  const databaseUrl = process.env.DATABASE_URL
  assert(databaseUrl, 'DATABASE_URL is required (.env at repo root)')

  const apiPort = process.env.API_PORT ?? '3001'
  const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${apiPort}`

  console.log(`Using API base URL: ${baseUrl}`)
  console.log('0) Building @flypigeon/node SDK...')
  execFileSync('pnpm', ['--filter', '@flypigeon/node', 'build'], {
    cwd: process.cwd(),
    stdio: 'inherit'
  })

  const sdkModule = await import('../../sdk-node/dist/index.js')
  const { Pigeon, PigeonApiError, PigeonValidationError } = sdkModule

  console.log('1) Checking API health...')
  await ensureApiReachable(baseUrl)

  const pool = new Pool({ connectionString: databaseUrl })

  const projectId = randomUUID()
  const envId = randomUUID()
  const apiKeyId = randomUUID()
  const jwtSecret = `phase7-jwt-${randomUUID()}-${randomUUID()}`
  const rawApiKey = `pk_test_${randomUUID().replace(/-/g, '')}`
  const apiKeyPrefix = rawApiKey.slice(0, 16)

  const userId = `phase7-user-${randomUUID().slice(0, 8)}`
  const idempotencyKey = `phase7-idem-${randomUUID()}`

  console.log('2) Bootstrapping tenant records...')
  await pool.query('INSERT INTO projects (id, name, slug) VALUES ($1, $2, $3)', [
    projectId,
    `Phase7 Project ${projectId.slice(0, 6)}`,
    `phase7-${projectId.slice(0, 10)}`
  ])

  await pool.query(
    "INSERT INTO environments (id, project_id, name, jwt_secret) VALUES ($1, $2, 'development', $3)",
    [envId, projectId, jwtSecret]
  )

  // For smoke tests we store key_hash as plaintext; API auth middleware supports this fallback.
  await pool.query(
    'INSERT INTO api_keys (id, environment_id, name, key_hash, key_prefix, is_revoked) VALUES ($1, $2, $3, $4, $5, FALSE)',
    [apiKeyId, envId, 'phase7-key', rawApiKey, apiKeyPrefix]
  )

  const pigeon = new Pigeon({
    apiKey: rawApiKey,
    baseUrl
  })

  console.log('3) send(): create one notification...')
  const sendOne = await pigeon.send({
    userId,
    type: 'phase7.single',
    title: 'Phase 7 Single Send',
    body: 'Created through SDK send()',
    data: { source: 'phase7-smoke', method: 'send' },
    idempotencyKey
  })
  assert(typeof sendOne.id === 'string' && sendOne.id.length > 0, 'send() response missing id')
  assert(sendOne.status === 'queued' || sendOne.status === 'delivered', 'send() returned unexpected status')

  console.log('4) send() idempotent resend: should return same id...')
  const sendTwo = await pigeon.send({
    userId,
    type: 'phase7.single',
    title: 'Phase 7 Single Send',
    body: 'Created through SDK send()',
    data: { source: 'phase7-smoke', method: 'send' },
    idempotencyKey
  })
  assert(sendTwo.id === sendOne.id, 'Idempotent resend returned a different notification id')

  console.log('5) sendBatch(): create multiple notifications...')
  const batchResults = await pigeon.sendBatch([
    {
      userId,
      type: 'phase7.batch',
      title: 'Batch 1',
      body: 'batch message 1',
      data: { index: 1 }
    },
    {
      userId,
      type: 'phase7.batch',
      title: 'Batch 2',
      body: 'batch message 2',
      data: { index: 2 }
    }
  ])
  assert(batchResults.length === 2, `sendBatch() expected 2 results, got ${batchResults.length}`)
  assert(batchResults.every((item) => typeof item.id === 'string' && item.id.length > 0), 'sendBatch() returned invalid ids')

  console.log('6) createUserToken(): mint token and list notifications...')
  const tokenRes = await pigeon.createUserToken({
    userId,
    ttlSeconds: 3600
  })
  assert(typeof tokenRes.token === 'string' && tokenRes.token.length > 0, 'createUserToken() missing token')
  assert(typeof tokenRes.expiresAt === 'string' && tokenRes.expiresAt.length > 0, 'createUserToken() missing expiresAt')

  const list = await requestJson(baseUrl, 'GET', '/v1/notifications?limit=20', tokenRes.token)
  assert(list.status === 200, `Expected 200 from notifications list, got ${list.status}`)
  const ids = Array.isArray(list.data?.items) ? list.data.items.map((item) => item.id) : []
  assert(ids.includes(sendOne.id), 'Single send notification is missing from list')
  assert(batchResults.every((item) => ids.includes(item.id)), 'At least one batch notification is missing from list')

  console.log('7) Typed error check: invalid payload should throw PigeonValidationError...')
  let validationCaught = false
  try {
    await pigeon.send({
      userId,
      type: '',
      title: 'Invalid',
    })
  } catch (error) {
    validationCaught = error instanceof PigeonValidationError
  }
  assert(validationCaught, 'Expected PigeonValidationError for invalid input')

  console.log('8) Typed error check: bad API key should throw PigeonApiError...')
  const badClient = new Pigeon({
    apiKey: 'pk_test_invalid_key',
    baseUrl
  })
  let apiErrorCaught = false
  try {
    await badClient.send({
      userId,
      type: 'phase7.auth',
      title: 'Should fail'
    })
  } catch (error) {
    apiErrorCaught = error instanceof PigeonApiError
  }
  assert(apiErrorCaught, 'Expected PigeonApiError for invalid API key')

  console.log('\nPhase 7 smoke test passed.')
  console.log(`projectId: ${projectId}`)
  console.log(`environmentId: ${envId}`)
  console.log(`notificationId(send): ${sendOne.id}`)
  console.log(`notificationIds(batch): ${batchResults.map((item) => item.id).join(', ')}`)

  await pool.end()
}

main().catch((error) => {
  console.error('\nPhase 7 smoke test failed:')
  console.error(error)
  process.exitCode = 1
})
