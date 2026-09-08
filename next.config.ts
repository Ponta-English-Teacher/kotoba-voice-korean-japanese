import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingRoot: process.cwd(),
  trailingSlash: true,
  async rewrites() {
    return [
      { source: "/manual", destination: "/manual/index.html" },
      { source: "/manual/", destination: "/manual/index.html" },
    ];
  },
};

export default nextConfig;
