import { serve } from '@hono/node-server'

import { app } from './app'
import { env } from './lib/env'

const server = serve({
  fetch: app.fetch,
  port: env.API_PORT
})

console.info(`Pigeon API listening on http://localhost:${env.API_PORT}`)

const shutdown = async () => {
  console.info('Shutting down API server...')
  server.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
