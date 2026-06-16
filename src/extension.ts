import { getNamespaceFullName } from "@typespec/compiler";
import type { DecoratorApplication, Type } from "@typespec/compiler";

/** Safely read the decorator applications off any TypeSpec type. */
export function getDecorators(
  type: Type | undefined,
): readonly DecoratorApplication[] | undefined {
  return (type as { decorators?: DecoratorApplication[] } | undefined)
    ?.decorators;
}

/**
 * Identify the `@extension` decorator from `@typespec/openapi`.
 *
 * We match by name (not function identity) so detection works even when the
 * emitter and the compiled spec resolve `@typespec/openapi` from different
 * `node_modules`, which would otherwise yield distinct decorator instances.
 */
export function isOpenApiExtension(dec: DecoratorApplication): boolean {
  const def = dec.definition;
  if (def?.name === "@extension") {
    return getNamespaceFullName(def.namespace) === "TypeSpec.OpenAPI";
  }
  return dec.decorator?.name === "$extension";
}

/** Read the matching `@extension` key/value off a list of decorators, if any. */
export function readExtension(
  decorators: readonly DecoratorApplication[] | undefined,
  keyFilter: Set<string> | undefined,
): { value: unknown } | undefined {
  if (!decorators) {
    return undefined;
  }
  for (const dec of decorators) {
    if (!isOpenApiExtension(dec)) {
      continue;
    }
    const key = dec.args[0]?.jsValue;
    if (typeof key !== "string") {
      continue;
    }
    if (keyFilter && !keyFilter.has(key)) {
      continue;
    }
    return { value: dec.args[1]?.jsValue ?? null };
  }
  return undefined;
}
