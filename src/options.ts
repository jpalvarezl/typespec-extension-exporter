import type { ExtensionEmitterOptions } from "./lib.js";

/** Normalize a user-provided kind filter value to a canonical lowercase kind. */
export function normalizeKind(kind: string): string {
  const value = kind.trim().toLowerCase();
  return value === "field" ? "modelproperty" : value;
}

/** Canonical lowercase TypeSpec kinds the emitter can filter on. */
export const VALID_KINDS: ReadonlySet<string> = new Set([
  "model",
  "modelproperty",
  "operation",
  "enum",
  "enummember",
  "union",
  "unionvariant",
  "scalar",
  "interface",
]);

/** Split a comma-separated option into trimmed, non-empty segments. */
function splitOption(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Return the `kinds` values that aren't recognized TypeSpec kinds. */
export function findUnknownKinds(kinds: string | undefined): string[] {
  return splitOption(kinds).filter(
    (kind) => !VALID_KINDS.has(normalizeKind(kind)),
  );
}

/**
 * Return the `keys` values that cannot match an OpenAPI `@extension` because
 * they do not start with `x-` (OpenAPI extension keys always do).
 */
export function findNonExtensionKeys(keys: string | undefined): string[] {
  return splitOption(keys).filter((key) => !key.startsWith("x-"));
}

/** Parse the comma-separated `kinds` option into a set, or undefined when unset/empty. */
export function parseKindFilter(
  kinds: string | undefined,
): Set<string> | undefined {
  if (!kinds) {
    return undefined;
  }
  const values = kinds
    .split(",")
    .map(normalizeKind)
    .filter((value) => value.length > 0);
  return values.length > 0 ? new Set(values) : undefined;
}

/** Parse the comma-separated `keys` option into a set, or undefined when unset/empty. */
export function parseKeyFilter(
  keys: string | undefined,
): Set<string> | undefined {
  if (!keys) {
    return undefined;
  }
  const values = keys
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length > 0 ? new Set(values) : undefined;
}

/** Known SDK language → TCGC emitter scope. */
export const EMITTER_SCOPES: Readonly<Record<string, string>> = {
  java: "@azure-tools/typespec-java",
  csharp: "@typespec/http-client-csharp",
};

/**
 * Resolve the TCGC emitter scope from the `language` option. Known languages
 * map to their emitter package name; any other value is passed through verbatim
 * (so a full emitter name can be supplied). Defaults to Java.
 */
export function resolveEmitterScope(language: string | undefined): string {
  const trimmed = language?.trim();
  if (!trimmed) {
    return EMITTER_SCOPES.java;
  }
  const key = trimmed.toLowerCase();
  return EMITTER_SCOPES[key] ?? trimmed;
}

/** True when the language option is unset/blank or resolves to the Java scope. */
export function resolvesToJavaScope(language: string | undefined): boolean {
  return resolveEmitterScope(language) === EMITTER_SCOPES.java;
}

/** Shared naming options for generated SDK symbols. */
export interface SdkNameOptions {
  namespaceOverride?: string;
}

/** Resolve the base SDK namespace/package override shared by SDK outputs. */
export function getSdkNameOptions(
  options: ExtensionEmitterOptions,
): SdkNameOptions {
  return {
    namespaceOverride: options["namespace"],
  };
}

/** Java naming options for outputs based on generated Java symbols. */
export interface JavaNameOptions extends SdkNameOptions {
  modelsSubpackage: string;
  internalSubpackage: string;
}

/** Resolve the Java naming options shared by revapi and tsp-ast-input modes. */
export function getJavaNameOptions(
  options: ExtensionEmitterOptions,
): JavaNameOptions {
  return {
    ...getSdkNameOptions(options),
    modelsSubpackage: options["models-subpackage"] ?? "models",
    internalSubpackage:
      options["internal-subpackage"] ?? "implementation.models",
  };
}

/** Build the default annotation/justification text. */
export function getBaseAnnotationDescription(
  options: ExtensionEmitterOptions,
): string {
  return options.justification ?? "Preview API.";
}
