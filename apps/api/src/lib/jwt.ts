import { createHmac, timingSafeEqual } from 'node:crypto'

import { ApiError } from './errors'

interface JwtHeader {
  alg?: string
  typ?: string
}

function decodeBase64Url(value: string): string {
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid JWT encoding')
  }
}

function parseToken(token: string): { headerSegment: string; payloadSegment: string; signatureSegment: string } {
  const [headerSegment, payloadSegment, signatureSegment, ...rest] = token.split('.')

  if (!headerSegment || !payloadSegment || !signatureSegment || rest.length > 0) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid JWT format')
  }

  return { headerSegment, payloadSegment, signatureSegment }
}

export function decodeJwtPayloadUnsafe(token: string): unknown {
  const { payloadSegment } = parseToken(token)

  try {
    return JSON.parse(decodeBase64Url(payloadSegment))
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid JWT payload')
  }
}

export function verifyHs256Jwt(token: string, secret: string): unknown {
  const { headerSegment, payloadSegment, signatureSegment } = parseToken(token)

  let header: JwtHeader

  try {
    header = JSON.parse(decodeBase64Url(headerSegment)) as JwtHeader
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid JWT header')
  }

  if (header.alg !== 'HS256') {
    throw new ApiError(401, 'UNAUTHORIZED', 'Unsupported JWT algorithm')
  }

  const signedPart = `${headerSegment}.${payloadSegment}`
  const expectedSignature = createHmac('sha256', secret).update(signedPart).digest('base64url')

  const actualBuffer = Buffer.from(signatureSegment)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (actualBuffer.length !== expectedBuffer.length) {
    throw new ApiError(401, 'UNAUTHORIZED', 'JWT signature mismatch')
  }

  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'JWT signature mismatch')
  }

  try {
    return JSON.parse(decodeBase64Url(payloadSegment))
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid verified JWT payload')
  }
}

export function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const headerSegment = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payloadSegment = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signatureSegment = createHmac('sha256', secret)
    .update(`${headerSegment}.${payloadSegment}`)
    .digest('base64url')

  return `${headerSegment}.${payloadSegment}.${signatureSegment}`
}
