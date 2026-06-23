import { resolvePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";

const repoRoot = resolvePath(import.meta.dirname, "..");

/** The emitter package name, as referenced by `--emit` / `tsp compile`. */
export const EMITTER = "typespec-extension-exporter";

/**
 * Tester for the `raw` output shape. Only `@typespec/openapi` (which defines
 * `@extension`) is needed; the emitter walks the type graph directly.
 */
export const Tester = createTester(repoRoot, {
  libraries: ["@typespec/openapi", EMITTER],
})
  .import("@typespec/openapi")
  .using("OpenAPI");

/**
 * Tester for SDK-derived output shapes (`revapi`, `tsp-ast-input`, `list`).
 * These build a TCGC SDK model, so the client-generator-core library must be
 * loaded for its decorators (`@access`, `@clientName`, ...) and for
 * `createSdkContext`.
 */
export const TcgcTester = createTester(repoRoot, {
  libraries: [
    "@typespec/http",
    "@typespec/openapi",
    "@azure-tools/typespec-client-generator-core",
    EMITTER,
  ],
})
  .import("@typespec/http")
  .import("@typespec/openapi")
  .import("@azure-tools/typespec-client-generator-core")
  .using("TypeSpec.Http")
  .using("OpenAPI")
  .using("Azure.ClientGenerator.Core");

type AnyTester = typeof Tester | typeof TcgcTester;

/**
 * Compile `code` with the emitter enabled and return the files written to the
 * emitter output directory, keyed by their file name. Fails the test if the
 * spec produces any compiler error or warning.
 */
export async function emitOutputs(
  tester: AnyTester,
  code: string | Record<string, string>,
  options: Record<string, unknown> = {},
): Promise<Record<string, string>> {
  const result = await tester.emit(EMITTER, options).compile(code);
  return result.outputs;
}

/**
 * Compile `code` and return the single emitted file parsed as JSON. Asserts
 * exactly one file was written so a test never silently reads the wrong output.
 */
export async function emitJson<T = unknown>(
  tester: AnyTester,
  code: string | Record<string, string>,
  options: Record<string, unknown> = {},
): Promise<T> {
  const outputs = await emitOutputs(tester, code, options);
  return parseSole<T>(outputs);
}

/**
 * Like {@link emitJson} but tolerant of non-error diagnostics. The TCGC-backed
 * shapes (`revapi`, `tsp-ast-input`, `list`) build a full SDK model, which can
 * surface warnings unrelated to the emitter's output; this throws only on
 * `error`-level diagnostics so those warnings don't mask the behavior under
 * test.
 */
export async function emitJsonTcgc<T = unknown>(
  tester: AnyTester,
  code: string | Record<string, string>,
  options: Record<string, unknown> = {},
): Promise<T> {
  const [result, diagnostics] = await tester
    .emit(EMITTER, options)
    .compileAndDiagnose(code);

  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Unexpected error diagnostics:\n${errors
        .map((d) => `  ${d.code}: ${d.message}`)
        .join("\n")}`,
    );
  }
  return parseSole<T>(result.outputs);
}

function parseSole<T>(outputs: Record<string, string>): T {
  const names = Object.keys(outputs);
  if (names.length !== 1) {
    throw new Error(
      `Expected exactly one emitted file, got: ${names.join(", ") || "<none>"}`,
    );
  }
  return JSON.parse(outputs[names[0]]) as T;
}
