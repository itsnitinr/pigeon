import { apiKeys, environments } from '@flypigeon/db'
import { and, eq, inArray } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'

import {
  buildApiKeyLookupPrefixes,
  inferEnvironmentNameFromApiKey,
  verifyApiKeyHash,
} from '../lib/api-key'
import { extractBearerToken } from '../lib/auth'
import { db } from '../lib/db'
import { ApiError } from '../lib/errors'
import type { AppBindings } from '../types/context'

export const apiKeyAuthMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'))
  const expectedEnvironmentName = inferEnvironmentNameFromApiKey(token)

  if (!expectedEnvironmentName) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key format')
  }

  const keyPrefixes = buildApiKeyLookupPrefixes(token)

  const candidates = await db
    .select({
      apiKeyId: apiKeys.id,
      keyHash: apiKeys.keyHash,
      environmentId: environments.id,
      environmentName: environments.name,
      projectId: environments.projectId,
    })
    .from(apiKeys)
    .innerJoin(environments, eq(apiKeys.environmentId, environments.id))
    .where(and(eq(apiKeys.isRevoked, false), inArray(apiKeys.keyPrefix, keyPrefixes)))

  for (const candidate of candidates) {
    if (candidate.environmentName !== expectedEnvironmentName) {
      continue
    }

    const hashMatches = await verifyApiKeyHash(token, candidate.keyHash)

    if (!hashMatches) {
      continue
    }

    c.set('apiKeyAuth', {
      apiKeyId: candidate.apiKeyId,
      projectId: candidate.projectId,
      environmentId: candidate.environmentId,
    })

    await next()
    return
  }

  throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key')
})
