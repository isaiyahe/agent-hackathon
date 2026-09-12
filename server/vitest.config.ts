import { configDefaults, defineConfig } from "vitest/config";

// server/agent and server/demo are the parallel implementation's sub-projects.
// Their tests use node:test via tsx (see their own `npm test`), not vitest, so
// vitest's default glob picks up the files and reports "No test suite found".
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "agent/**", "demo/**"],
  },
});
