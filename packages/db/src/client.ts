import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'

import * as schema from './schema/index.js'

export type Database = NodePgDatabase<typeof schema>

export interface CreateDbClientOptions {
  databaseUrl?: string
  pool?: Pool
  poolConfig?: Omit<PoolConfig, 'connectionString'>
}

export interface DbClient {
  db: Database
  pool: Pool
}

export function createDbClient(options: CreateDbClientOptions = {}): DbClient {
  const connectionString = options.databaseUrl ?? process.env.DATABASE_URL

  if (!options.pool && !connectionString) {
    throw new Error('DATABASE_URL is required to create a DB client')
  }

  const pool = options.pool ?? new Pool({ connectionString, ...options.poolConfig })
  const db = drizzle(pool, { schema })

  return {
    db,
    pool,
  }
}

export function createDb(options: CreateDbClientOptions = {}): Database {
  return createDbClient(options).db
}
