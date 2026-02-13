import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm'],
  outDir: 'dist',
  skipNodeModulesBundle: false,
  noExternal: ['@flypigeon/db', '@flypigeon/shared'],
  external: ['pg', 'drizzle-orm', 'bullmq', 'ioredis', 'dotenv'],
})
