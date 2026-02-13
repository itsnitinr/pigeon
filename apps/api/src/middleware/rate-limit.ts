import { randomUUID } from 'node:crypto'

import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import { ApiError } from '../lib/errors'
import { redisClient } from '../lib/redis'
import type { AppBindings } from '../types/context'

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local current = redis.call('ZCARD', key)

if current >= limit then
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then
    ttl = window
  end

  return {0, current, ttl}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)

local nextCount = redis.call('ZCARD', key)
local ttl = redis.call('PTTL', key)

if ttl < 0 then
  ttl = window
end

return {1, nextCount, ttl}
`

interface RateLimitConfig {
  keyPrefix: string
  limit: number
  windowMs: number
  resolveIdentifier: (c: Context<AppBindings>) => string | Promise<string>
}

export function createRateLimitMiddleware(config: RateLimitConfig) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const identifier = await config.resolveIdentifier(c)

    if (!identifier) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Rate limit identity missing')
    }

    const now = Date.now()
    const requestId = c.get('requestId') || randomUUID()
    const redisKey = `${config.keyPrefix}:${identifier}`

    let result: unknown

    try {
      result = await redisClient.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        redisKey,
        String(now),
        String(config.windowMs),
        String(config.limit),
        `${now}-${requestId}`,
      )
    } catch (error) {
      console.error('Rate limit Redis error', error)
      throw new ApiError(503, 'RATE_LIMIT_UNAVAILABLE', 'Rate limiter unavailable')
    }

    const [allowedRaw, countRaw, ttlRaw] = Array.isArray(result) ? result : [0, 0, config.windowMs]

    const allowed = Number(allowedRaw) === 1
    const currentCount = Number(countRaw) || 0
    const ttlMs = Number(ttlRaw) > 0 ? Number(ttlRaw) : config.windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000))

    c.header('x-ratelimit-limit', String(config.limit))
    c.header('x-ratelimit-remaining', String(Math.max(config.limit - currentCount, 0)))
    c.header('x-ratelimit-reset', String(retryAfterSeconds))

    if (!allowed) {
      c.header('retry-after', String(retryAfterSeconds))

      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Rate limit exceeded',
            requestId: c.get('requestId'),
          },
        },
        429,
      )
    }

    await next()
  })
}
