import { createDbClient } from '@flypigeon/db'

import { env } from './env'

const globalDbClient = globalThis as typeof globalThis & {
  __pigeonWorkerDbClient?: ReturnType<typeof createDbClient>
}

export const dbClient =
  globalDbClient.__pigeonWorkerDbClient ?? createDbClient({ databaseUrl: env.DATABASE_URL })

if (env.NODE_ENV !== 'production') {
  globalDbClient.__pigeonWorkerDbClient = dbClient
}

export const { db, pool } = dbClient
