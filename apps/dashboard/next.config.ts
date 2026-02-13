import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    externalDir: true
  },
  transpilePackages: ['@flypigeon/db', '@flypigeon/shared']
}

export default nextConfig
