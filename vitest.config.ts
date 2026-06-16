import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Build the emitter to `dist/` before the suite runs. The TypeSpec test
    // host loads the emitter as a real on-disk module (its package `exports`
    // resolve to `dist/src/index.js`), so the tests exercise the built output.
    globalSetup: ["./test/global-setup.ts"],
    // Compiling specs through the TypeSpec host is slower than a plain unit
    // test, so give each test room before timing out.
    testTimeout: 30_000,
  },
});
