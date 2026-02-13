import { environments } from '@pigeon/db'
import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'

import { jwtPayloadSchema } from '@pigeon/shared'
import { extractBearerToken } from '../lib/auth'
import { db } from '../lib/db'
import { ApiError } from '../lib/errors'
import { decodeJwtPayloadUnsafe, verifyHs256Jwt } from '../lib/jwt'
import type { AppBindings } from '../types/context'

export const jwtAuthMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'))

  const unverifiedPayload = decodeJwtPayloadUnsafe(token)
  const parsedUnverifiedPayload = jwtPayloadSchema.safeParse(unverifiedPayload)

  if (!parsedUnverifiedPayload.success) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid JWT payload')
  }

  const payload = parsedUnverifiedPayload.data

  const [environment] = await db
    .select({
      id: environments.id,
      projectId: environments.projectId,
      jwtSecret: environments.jwtSecret
    })
    .from(environments)
    .where(eq(environments.id, payload.eid))
    .limit(1)

  if (!environment) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Unknown JWT environment')
  }

  if (environment.projectId !== payload.pid) {
    throw new ApiError(401, 'UNAUTHORIZED', 'JWT project mismatch')
  }

  const verifiedPayload = verifyHs256Jwt(token, environment.jwtSecret)
  const parsedVerifiedPayload = jwtPayloadSchema.safeParse(verifiedPayload)

  if (!parsedVerifiedPayload.success) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid verified JWT payload')
  }

  const verified = parsedVerifiedPayload.data

  if (verified.exp * 1000 <= Date.now()) {
    throw new ApiError(401, 'UNAUTHORIZED', 'JWT expired')
  }

  c.set('jwtAuth', {
    externalUserId: verified.sub,
    projectId: verified.pid,
    environmentId: verified.eid,
    expiresAt: new Date(verified.exp * 1000).toISOString()
  })

  await next()
})
