import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

const SCRYPT_KEY_LENGTH = 64

export async function hashApiKey(rawKey: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scrypt(rawKey, salt, SCRYPT_KEY_LENGTH)) as Buffer

  return `scrypt$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyApiKeyHash(rawKey: string, storedHash: string): Promise<boolean> {
  if (!storedHash) {
    return false
  }

  if (storedHash.startsWith('scrypt$')) {
    const [, salt, expectedHex] = storedHash.split('$')

    if (!salt || !expectedHex) {
      return false
    }

    const derivedKey = (await scrypt(rawKey, salt, SCRYPT_KEY_LENGTH)) as Buffer
    const expected = Buffer.from(expectedHex, 'hex')

    if (expected.length !== derivedKey.length) {
      return false
    }

    return timingSafeEqual(derivedKey, expected)
  }

  // Temporary fallback for non-scrypt hashes until key creation flow is implemented.
  const rawBuffer = Buffer.from(rawKey)
  const expectedBuffer = Buffer.from(storedHash)

  if (rawBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(rawBuffer, expectedBuffer)
}

export function buildApiKeyLookupPrefixes(apiKey: string): string[] {
  const minLength = 8
  const maxLength = Math.min(32, apiKey.length)
  const prefixes: string[] = []

  for (let length = maxLength; length >= minLength; length -= 1) {
    prefixes.push(apiKey.slice(0, length))
  }

  return prefixes
}

export function inferEnvironmentNameFromApiKey(apiKey: string): 'development' | 'production' | null {
  if (apiKey.startsWith('pk_test_')) {
    return 'development'
  }

  if (apiKey.startsWith('pk_live_')) {
    return 'production'
  }

  return null
}
