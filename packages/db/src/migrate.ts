import { config as loadEnv } from 'dotenv'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDbClient } from './client'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '../../..')
const migrationsFolder = resolve(currentDir, '../drizzle')

loadEnv({ path: resolve(repoRoot, '.env') })
loadEnv({ path: resolve(repoRoot, '.env.local'), override: true })

const { db, pool } = createDbClient()

try {
  await migrate(db, {
    migrationsFolder
  })
  console.info('Database migrations applied successfully.')
} finally {
  await pool.end()
}
