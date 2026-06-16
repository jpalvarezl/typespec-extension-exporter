import type { ExtensionEmitterOptions } from "./lib.js";

/** Normalize a user-provided kind filter value to a canonical lowercase kind. */
export function normalizeKind(kind: string): string {
  const value = kind.trim().toLowerCase();
  return value === "field" ? "modelproperty" : value;
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

/** Shared Java naming options for outputs based on generated Java symbols. */
export interface JavaNameOptions {
  namespaceOverride?: string;
  modelsSubpackage: string;
  internalSubpackage: string;
}

/** Resolve the Java naming options shared by revapi and tsp-ast-input modes. */
export function getJavaNameOptions(
  options: ExtensionEmitterOptions,
): JavaNameOptions {
  return {
    namespaceOverride: options["java-namespace"],
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
