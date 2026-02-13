import { randomUUID } from 'node:crypto'

import { createMiddleware } from 'hono/factory'

import type { AppBindings } from '../types/context'

export const requestIdMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const requestId = randomUUID()

  c.set('requestId', requestId)

  await next()

  c.header('x-request-id', requestId)
})
