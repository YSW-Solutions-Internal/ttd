import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Quote source images are screenshots; allow several per upload.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
