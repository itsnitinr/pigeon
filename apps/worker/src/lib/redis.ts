import IORedis from 'ioredis'

import { env } from './env'

interface ParsedRedisConfig {
  host: string
  port: number
  username?: string
  password?: string
  db: number
}

function parseRedisConfig(redisUrl: string): ParsedRedisConfig {
  const parsed = new URL(redisUrl)
  const dbPath = parsed.pathname.replace('/', '')

  const baseConfig: ParsedRedisConfig = {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    db: dbPath ? Number(dbPath) || 0 : 0
  }

  return {
    ...baseConfig,
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(parsed.password ? { password: parsed.password } : {})
  }
}

export const redisConnectionConfig = parseRedisConfig(env.REDIS_URL)

export const bullmqConnectionOptions = {
  ...redisConnectionConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: false
}

const globalRedisState = globalThis as typeof globalThis & {
  __pigeonWorkerRedisClient?: IORedis
}

export const redisClient =
  globalRedisState.__pigeonWorkerRedisClient ??
  new IORedis({
    ...redisConnectionConfig,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  })

if (env.NODE_ENV !== 'production') {
  globalRedisState.__pigeonWorkerRedisClient = redisClient
}

export async function closeRedisClient(): Promise<void> {
  await redisClient.quit()
}
