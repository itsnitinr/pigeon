import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { env } from './lib/env'
import { errorHandlingMiddleware } from './middleware/error-handler'
import { requestIdMiddleware } from './middleware/request-id'
import { healthRoutes } from './routes/health'
import { v1Routes } from './routes/v1'
import type { AppBindings } from './types/context'

export const app = new Hono<AppBindings>()

const allowedOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0)

const corsOrigin: string | string[] =
  allowedOrigins.length === 0 || allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.length === 1
      ? allowedOrigins[0] || '*'
      : allowedOrigins

app.use('*', requestIdMiddleware)
app.use(
  '*',
  cors({
    origin: corsOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'Last-Event-ID'],
    exposeHeaders: ['Retry-After'],
    maxAge: 86_400,
  }),
)
app.use('*', errorHandlingMiddleware)

app.route('/', healthRoutes)
app.route('/v1', v1Routes)

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: c.get('requestId'),
      },
    },
    404,
  )
})
