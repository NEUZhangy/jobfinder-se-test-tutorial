import { defineConfig } from "vitest/config";

// Standalone on purpose: vite.config.ts loads the Cloudflare plugin, which needs remote AI auth and breaks Vitest.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage/backend",
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 85 },
    },
  },
});
