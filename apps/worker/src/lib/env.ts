import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function stripQuotes(value: string): string {
  const trimmed = value.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function loadEnvFile(filePath: string, override = false): void {
  if (!existsSync(filePath)) {
    return
  }

  const fileContent = readFileSync(filePath, 'utf8')
  const lines = fileContent.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const equalsIndex = line.indexOf('=')

    if (equalsIndex <= 0) {
      continue
    }

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1))

    if (override || process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function parsePositiveInt(value: string | undefined, defaultValue: number, label: string): number {
  if (!value) {
    return defaultValue
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }

  return parsed
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const rootCandidates = [
  resolve(currentDir, '../../../../'),
  resolve(currentDir, '../../../'),
  process.cwd(),
]

for (const rootPath of rootCandidates) {
  loadEnvFile(resolve(rootPath, '.env'))
  loadEnvFile(resolve(rootPath, '.env.local'), true)
}

const nodeEnv = process.env.NODE_ENV
if (nodeEnv && nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
  throw new Error('NODE_ENV must be one of development, test, production')
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

export const env = {
  NODE_ENV: (nodeEnv || 'development') as 'development' | 'test' | 'production',
  DATABASE_URL: databaseUrl,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  WEBHOOK_TIMEOUT_MS: parsePositiveInt(
    process.env.WEBHOOK_TIMEOUT_MS,
    10_000,
    'WEBHOOK_TIMEOUT_MS',
  ),
  NOTIFICATION_TTL_DAYS: parsePositiveInt(
    process.env.NOTIFICATION_TTL_DAYS,
    90,
    'NOTIFICATION_TTL_DAYS',
  ),
}
