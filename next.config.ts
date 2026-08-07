import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 私有 TS 包，需显式转译
  transpilePackages: ["@zmzai/db"],
};
export default nextConfig;
