import { execSync } from "node:child_process";

/**
 * Vitest global setup: build the emitter once before the suite runs.
 *
 * The TypeSpec test host resolves and imports the emitter from its package
 * `exports` (which point at `dist/src/index.js`), so the compiled output must
 * exist and be up to date before any test compiles a spec.
 */
export default function setup(): void {
  execSync("npm run build", { stdio: "inherit" });
}
