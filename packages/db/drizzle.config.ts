import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '../..')

loadEnv({ path: resolve(repoRoot, '.env') })
loadEnv({ path: resolve(repoRoot, '.env.local'), override: true })

export default defineConfig({
  out: './drizzle',
  schema: './src/schema/tables.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pigeon'
  },
  strict: true,
  verbose: true
})
