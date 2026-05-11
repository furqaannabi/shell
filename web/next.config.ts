import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shell-finance/sdk"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
