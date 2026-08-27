import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next resolves `server-only` through the react-server condition, where
      // the package is empty. Vitest runs plain Node and would hit the throwing
      // client entry, so the marker is stubbed for tests only.
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
});

