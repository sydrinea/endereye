import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [{ hostname: 'mc-heads.net' }],
  },
  serverExternalPackages: ['@endereye/core'],
  staticPageGenerationTimeout: 180,
}

export default nextConfig
