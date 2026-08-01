import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@sora/tokens', '@sora/contracts'],
}

export default nextConfig
