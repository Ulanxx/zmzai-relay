import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 私有 TS 包，需显式转译
  transpilePackages: ["@zmzai/db", "@zmzai/theme"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
