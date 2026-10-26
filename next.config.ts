import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stop `next dev` writing its own AGENTS.md into the repo.
  agentRules: false,
  experimental: {
    // Quote source images are screenshots; allow several per upload.
    serverActions: { bodySizeLimit: "25mb" },
  },
  // Read at runtime by lib/pdf/render.ts (fonts, logo) and @sparticuz/chromium (its compressed browser).
  // Every route: the Quote modal's actions run in whichever page sits under it.
  outputFileTracingIncludes: {
    "/**/*": ["./lib/pdf/fonts/*.woff2", "./lib/pdf/logo.png", "./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
