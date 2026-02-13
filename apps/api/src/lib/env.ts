import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

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

const currentDir = dirname(fileURLToPath(import.meta.url))
const rootCandidates = [resolve(currentDir, '../../../../'), resolve(currentDir, '../../../'), process.cwd()]

for (const rootPath of rootCandidates) {
  loadEnvFile(resolve(rootPath, '.env'))
  loadEnvFile(resolve(rootPath, '.env.local'), true)
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z.string().default('*'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600)
})

export const env = envSchema.parse(process.env)
