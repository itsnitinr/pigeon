import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@pigeon/react': fileURLToPath(new URL('../../../packages/sdk-react/src/index.ts', import.meta.url)),
      '@pigeon/shared': fileURLToPath(new URL('../../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
})
