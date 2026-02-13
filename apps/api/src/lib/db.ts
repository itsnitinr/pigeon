import { createDbClient } from '@flypigeon/db'

import { env } from './env'

const globalDbClient = globalThis as typeof globalThis & {
  __pigeonApiDbClient?: ReturnType<typeof createDbClient>
}

export const dbClient =
  globalDbClient.__pigeonApiDbClient ?? createDbClient({ databaseUrl: env.DATABASE_URL })

if (env.NODE_ENV !== 'production') {
  globalDbClient.__pigeonApiDbClient = dbClient
}

export const { db, pool } = dbClient
