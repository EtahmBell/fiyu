import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Logic tests (schemas, formatting, ranking, geo) run in node, which keeps
    // them fast. Component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
