import { ApiError } from './errors'

export function extractBearerToken(authorizationHeader?: string | null): string {
  if (!authorizationHeader) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing Authorization header')
  }

  const [scheme, token] = authorizationHeader.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid Authorization header format')
  }

  return token
}
