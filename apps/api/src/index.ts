import { serve } from '@hono/node-server'

import { app } from './app'
import { pool } from './lib/db'
import { env } from './lib/env'
import { closeQueueConnections } from './lib/queue'
import { closeRedisClient } from './lib/redis'

const server = serve({
  fetch: app.fetch,
  port: env.API_PORT
})

console.info(`Pigeon API listening on http://localhost:${env.API_PORT}`)

let isShuttingDown = false

const shutdown = async () => {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true

  console.info('Shutting down API server...')
  server.close()

  await Promise.allSettled([closeQueueConnections(), closeRedisClient(), pool.end()])
}

process.on('SIGINT', () => {
  void shutdown()
})

process.on('SIGTERM', () => {
  void shutdown()
})
