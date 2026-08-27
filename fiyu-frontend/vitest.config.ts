import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Logic tests (schemas, formatting, ranking, geo) run in node, which keeps
    // them fast. Component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The map/detail suites are CPU-heavy under jsdom. Running files in parallel
    // made otherwise-fast assertions exceed Vitest's timeout only under the full
    // suite, while every affected file passed in isolation. Serial files keep the
    // release gate deterministic without weakening assertion timeouts.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
