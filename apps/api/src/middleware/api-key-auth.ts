import { createMiddleware } from 'hono/factory'

import { extractBearerToken } from '../lib/auth'
import { buildApiKeyLookupPrefixes, inferEnvironmentNameFromApiKey, verifyApiKeyHash } from '../lib/api-key'
import { pool } from '../lib/db'
import { ApiError } from '../lib/errors'
import type { AppBindings } from '../types/context'

type ApiKeyCandidateRow = {
  api_key_id: string
  key_hash: string
  environment_id: string
  environment_name: 'development' | 'production'
  project_id: string
}

export const apiKeyAuthMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const token = extractBearerToken(c.req.header('authorization'))
  const expectedEnvironmentName = inferEnvironmentNameFromApiKey(token)

  if (!expectedEnvironmentName) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key format')
  }

  const keyPrefixes = buildApiKeyLookupPrefixes(token)

  const { rows } = await pool.query<ApiKeyCandidateRow>(
    `
      SELECT
        ak.id AS api_key_id,
        ak.key_hash,
        e.id AS environment_id,
        e.name AS environment_name,
        e.project_id
      FROM api_keys ak
      INNER JOIN environments e ON e.id = ak.environment_id
      WHERE ak.is_revoked = FALSE
        AND ak.key_prefix = ANY($1::text[])
    `,
    [keyPrefixes]
  )

  for (const candidate of rows) {
    if (candidate.environment_name !== expectedEnvironmentName) {
      continue
    }

    const hashMatches = await verifyApiKeyHash(token, candidate.key_hash)

    if (!hashMatches) {
      continue
    }

    c.set('apiKeyAuth', {
      apiKeyId: candidate.api_key_id,
      projectId: candidate.project_id,
      environmentId: candidate.environment_id
    })

    await next()
    return
  }

  throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API key')
})
