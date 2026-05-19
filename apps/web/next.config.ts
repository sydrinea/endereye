import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ hostname: 'mc-heads.net' }],
  },
};

export default nextConfig;
