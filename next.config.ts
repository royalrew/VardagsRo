import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Railway gives every build/deploy a unique ID. Exposing it to Next lets
  // clients detect that their RSC/Server Action references belong to an older
  // deploy and hard-reload before sending an incompatible request.
  deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
  // Tesseract resolves its own worker script from disk at runtime. Bundled, it
  // looks for that file under a rewritten path that does not exist and the
  // request dies with MODULE_NOT_FOUND. Required natively, it finds itself.
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*",
      // The standalone build only copies what it can see being imported, and
      // the language data is read from disk, not imported.
      "vendor/tessdata/**/*",
    ],
  },
  poweredByHeader: false,
};

export default nextConfig;
