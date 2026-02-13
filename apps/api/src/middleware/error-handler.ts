import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { ApiError } from '../lib/errors'
import type { AppBindings } from '../types/context'

export const errorHandlingMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  try {
    await next()
  } catch (error) {
    const requestId = c.get('requestId')

    if (error instanceof ApiError) {
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            requestId,
            details: error.details,
          },
        },
        error.status as ContentfulStatusCode,
      )
    }

    if (error instanceof HTTPException) {
      return c.json(
        {
          error: {
            code: 'HTTP_ERROR',
            message: error.message,
            requestId,
          },
        },
        error.status,
      )
    }

    console.error('Unhandled API error:', error)

    return c.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Something went wrong',
          requestId,
        },
      },
      500,
    )
  }
})
