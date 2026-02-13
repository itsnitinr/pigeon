import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import { Pool } from 'pg'

import { Pigeon, PigeonApiError } from '@flypigeon/node'

interface DemoEnvironment {
  apiKey: string
  apiBaseUrl: string
  defaultUserId: string
}

const DEMO_PROJECT_ID = 'f0f78d3c-703b-4d95-a95a-c9affb5b2001'
const DEMO_ENVIRONMENT_ID = '4956f3d6-5802-4694-b9f4-e14c46f8f6d7'
const DEMO_API_KEY_ID = '8a8101bd-a88f-4f27-9732-16858d8dcbfd'

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {}
  }

  const content = readFileSync(path, 'utf8')
  const result: Record<string, string> = {}

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

function loadEnv() {
  const fileDir = dirname(fileURLToPath(import.meta.url))
  const repoRoot = resolve(fileDir, '../../../../')

  const merged = {
    ...parseEnvFile(resolve(repoRoot, '.env')),
    ...parseEnvFile(resolve(repoRoot, '.env.local')),
    ...parseEnvFile(resolve(process.cwd(), '.env')),
    ...parseEnvFile(resolve(process.cwd(), '.env.local')),
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

async function bootstrapDemoEnvironment(pool: Pool, apiBaseUrl: string): Promise<DemoEnvironment> {
  const now = new Date().toISOString()
  const rawApiKey = `pk_test_${randomUUID().replace(/-/g, '')}`
  const apiKeyPrefix = rawApiKey.slice(0, 16)
  const jwtSecret = `demo-jwt-${randomUUID()}-${randomUUID()}`

  await pool.query(
    `
      INSERT INTO projects (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          updated_at = EXCLUDED.updated_at
    `,
    [DEMO_PROJECT_ID, 'Pigeon Demo Project', 'pigeon-demo-project', now, now],
  )

  await pool.query(
    `
      INSERT INTO environments (id, project_id, name, jwt_secret, created_at)
      VALUES ($1, $2, 'development', $3, $4)
      ON CONFLICT (id) DO UPDATE
      SET project_id = EXCLUDED.project_id,
          name = EXCLUDED.name,
          jwt_secret = EXCLUDED.jwt_secret
    `,
    [DEMO_ENVIRONMENT_ID, DEMO_PROJECT_ID, jwtSecret, now],
  )

  await pool.query(
    `
      INSERT INTO api_keys (id, environment_id, name, key_hash, key_prefix, is_revoked, created_at, revoked_at)
      VALUES ($1, $2, $3, $4, $5, FALSE, $6, NULL)
      ON CONFLICT (id) DO UPDATE
      SET environment_id = EXCLUDED.environment_id,
          name = EXCLUDED.name,
          key_hash = EXCLUDED.key_hash,
          key_prefix = EXCLUDED.key_prefix,
          is_revoked = FALSE,
          revoked_at = NULL
    `,
    [DEMO_API_KEY_ID, DEMO_ENVIRONMENT_ID, 'demo-api-key', rawApiKey, apiKeyPrefix, now],
  )

  return {
    apiKey: rawApiKey,
    apiBaseUrl,
    defaultUserId: 'demo-user-001',
  }
}

async function main() {
  loadEnv()

  const databaseUrl = requireEnv('DATABASE_URL')
  const apiBaseUrl = process.env.PIGEON_API_BASE_URL ?? 'http://localhost:3001'
  const port = Number(process.env.DEMO_SERVER_PORT ?? 3010)

  const pool = new Pool({ connectionString: databaseUrl })
  const environment = await bootstrapDemoEnvironment(pool, apiBaseUrl)

  const app = express()
  app.use(express.json())

  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type,authorization')

    if (req.method === 'OPTIONS') {
      res.status(204).send()
      return
    }

    next()
  })

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      mode: 'demo-server',
    })
  })

  app.get('/api/config', (_req, res) => {
    res.status(200).json({
      apiBaseUrl: environment.apiBaseUrl,
      defaultUserId: environment.defaultUserId,
    })
  })

  app.post('/api/token', async (req, res) => {
    try {
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : ''

      if (!userId) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'userId is required' } })
        return
      }

      const pigeon = new Pigeon({
        apiKey: environment.apiKey,
        baseUrl: environment.apiBaseUrl,
      })

      const tokenResult = await pigeon.createUserToken({
        userId,
        ttlSeconds: 3600,
      })

      res.status(200).json(tokenResult)
    } catch (error) {
      if (error instanceof PigeonApiError) {
        res.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            requestId: error.requestId,
          },
        })
        return
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unexpected error',
        },
      })
    }
  })

  app.post('/api/send', async (req, res) => {
    try {
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : ''
      const type = typeof req.body?.type === 'string' ? req.body.type.trim() : ''
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
      const body = typeof req.body?.body === 'string' ? req.body.body : null

      if (!userId || !type || !title) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'userId, type, and title are required',
          },
        })
        return
      }

      const pigeon = new Pigeon({
        apiKey: environment.apiKey,
        baseUrl: environment.apiBaseUrl,
      })

      const sendResult = await pigeon.send({
        userId,
        type,
        title,
        body,
        data: {
          source: 'demo-app',
          createdAt: new Date().toISOString(),
        },
      })

      res.status(200).json(sendResult)
    } catch (error) {
      if (error instanceof PigeonApiError) {
        res.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            requestId: error.requestId,
          },
        })
        return
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unexpected error',
        },
      })
    }
  })

  const server = app.listen(port, () => {
    console.info(`[demo-server] running on http://localhost:${port}`)
    console.info(`[demo-server] using Pigeon API: ${environment.apiBaseUrl}`)
    console.info(`[demo-server] seeded demo user: ${environment.defaultUserId}`)
  })

  const shutdown = async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    await pool.end()
  }

  process.on('SIGINT', () => {
    void shutdown()
  })

  process.on('SIGTERM', () => {
    void shutdown()
  })
}

void main().catch((error) => {
  console.error('[demo-server] fatal error')
  console.error(error)
  process.exitCode = 1
})
