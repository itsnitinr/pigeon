import { createDbClient } from '@flypigeon/db'

import { env } from './env'

const globalForDb = globalThis as unknown as {
  dashboardDbClient?: ReturnType<typeof createDbClient>
}

export const dbClient =
  globalForDb.dashboardDbClient ?? createDbClient({ databaseUrl: env.DATABASE_URL })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.dashboardDbClient = dbClient
}

export const db = dbClient.db
