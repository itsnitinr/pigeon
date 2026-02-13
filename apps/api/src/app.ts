import { Hono } from 'hono'

import { errorHandlingMiddleware } from './middleware/error-handler'
import { requestIdMiddleware } from './middleware/request-id'
import { healthRoutes } from './routes/health'
import type { AppBindings } from './types/context'

export const app = new Hono<AppBindings>()

app.use('*', requestIdMiddleware)
app.use('*', errorHandlingMiddleware)

app.route('/', healthRoutes)

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
