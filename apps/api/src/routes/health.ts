import { Hono } from 'hono'

import type { AppBindings } from '../types/context'

export const healthRoutes = new Hono<AppBindings>()

healthRoutes.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'pigeon-api',
    timestamp: new Date().toISOString()
  })
})
