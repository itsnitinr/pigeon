import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true
  },
  transpilePackages: ['@pigeon/db', '@pigeon/shared']
}

export default nextConfig
