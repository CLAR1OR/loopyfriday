import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Audio/score files are served via our own route handlers; nothing to optimize here.
  images: { unoptimized: true },
};

export default nextConfig;
