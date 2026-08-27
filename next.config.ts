import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },
  poweredByHeader: false,
};

export default nextConfig;
