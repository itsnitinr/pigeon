import { Hono } from 'hono'

import { errorHandlingMiddleware } from './middleware/error-handler'
import { requestIdMiddleware } from './middleware/request-id'
import { healthRoutes } from './routes/health'
import { v1Routes } from './routes/v1'
import type { AppBindings } from './types/context'

export const app = new Hono<AppBindings>()

app.use('*', requestIdMiddleware)
app.use('*', errorHandlingMiddleware)

app.route('/', healthRoutes)
app.route('/v1', v1Routes)

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: c.get('requestId')
      }
    },
    404
  )
})
