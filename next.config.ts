import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      new URL(
        "https://mild-chipmunk-830.eu-west-1.convex.cloud/api/storage/**",
      ),
    ],
  },
};

export default nextConfig;
