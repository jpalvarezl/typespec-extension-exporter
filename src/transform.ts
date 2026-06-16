import type { ExtensionEmitterOptions } from "./lib.js";
import {
  getBaseAnnotationDescription,
  getJavaNameOptions,
  type JavaNameOptions,
} from "./options.js";
import type {
  CollectedBeta,
  RevapiEntry,
  TspAstInputEntry,
} from "./types.js";

/**
 * revapi difference `code` applied to every generated entry. The `java\..*`
 * regex matches any breaking-change code (class/method/field removal, signature
 * change, ...) so the entry suppresses every kind of change on its target.
 */
const REVAPI_CODE = "java\\..*";

/** Escape a literal string for safe embedding inside a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert a property name (snake_case or camelCase) to PascalCase for a Java accessor. */
export function toPascalCase(name: string): string {
  return name
    .split(/[_\-]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Build the Java fully-qualified name for a generated type. */
export function getJavaTypeFqn(
  entity: { name: string; namespace: string; access: "public" | "internal" },
  options: JavaNameOptions,
): string {
  const base = options.namespaceOverride ?? entity.namespace;
  const subpackage =
    entity.access === "internal"
      ? options.internalSubpackage
      : options.modelsSubpackage;
  return [base, subpackage, entity.name]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(".");
}

/** Collect preview feature keys (e.g. "AgentEndpoints=V1Preview") from a value. */
export function collectPreviews(target: Set<string>, value: unknown): void {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const field of ["required_previews", "conditional_previews"]) {
    const arr = (value as Record<string, unknown>)[field];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === "string" && item.length > 0) {
          target.add(item);
        }
      }
    }
  }
}

/** Build the annotation/justification text, appending the gating preview feature keys. */
export function buildAnnotationDescription(
  base: string,
  previews: Set<string>,
): string {
  if (previews.size === 0) {
    return base;
  }
  const keys = [...previews].sort().join(", ");
  return `${base} ${keys}`;
}

/** Accumulator for an entry whose annotation/justification merges preview keys. */
interface PreviewAccumulator<T> {
  entry: T;
  previews: Set<string>;
}

/**
 * Transform collected beta entities into revapi `differences` ignore entries.
 *
 * Each entry uses `code: "java\\..*"` so that any kind of breaking change
 * (class/method/field removal, signature change, ...) on the matched Java
 * element is ignored. The `old` regex is anchored with a word boundary at the
 * start and a negative look-ahead at the end so it matches the entity and its
 * members but never a longer name that merely shares the same prefix.
 */
export function toRevapiEntries(
  collected: CollectedBeta,
  options: ExtensionEmitterOptions,
): RevapiEntry[] {
  const javaNames = getJavaNameOptions(options);
  const baseJustification = getBaseAnnotationDescription(options);

  const byOld = new Map<string, PreviewAccumulator<{ old: string }>>();
  const accumulate = (old: string, value: unknown): void => {
    let acc = byOld.get(old);
    if (!acc) {
      acc = { entry: { old }, previews: new Set() };
      byOld.set(old, acc);
    }
    collectPreviews(acc.previews, value);
  };

  for (const type of collected.types) {
    const fqn = getJavaTypeFqn(type, javaNames);
    accumulate(`.*\\b${escapeRegExp(fqn)}(?![\\w$]).*`, type.value);
  }

  for (const prop of collected.properties) {
    const containerFqn = getJavaTypeFqn(
      {
        name: prop.containerName,
        namespace: prop.containerNamespace,
        access: prop.containerAccess,
      },
      javaNames,
    );
    const accessor = toPascalCase(prop.propertyName);
    accumulate(
      `.*\\b${escapeRegExp(containerFqn)}::(get|set|is|with)?${escapeRegExp(
        accessor,
      )}(?![\\w$]).*`,
      prop.value,
    );
  }

  return [...byOld.values()]
    .sort((a, b) => a.entry.old.localeCompare(b.entry.old))
    .map((acc) => ({
      ignore: true as const,
      regex: true as const,
      code: REVAPI_CODE,
      old: acc.entry.old,
      justification: buildAnnotationDescription(baseJustification, acc.previews),
    }));
}

/**
 * Transform collected beta entities into tsp-ast-input annotation requests.
 *
 * Class entries target the generated Java type FQN. Field entries target the
 * containing generated Java type FQN plus the generated Java member name from
 * TCGC (camelCase, reflecting Java `@clientName` customizations).
 */
export function toTspAstInputEntries(
  collected: CollectedBeta,
  options: ExtensionEmitterOptions,
): TspAstInputEntry[] {
  const javaNames = getJavaNameOptions(options);
  const baseDescription = getBaseAnnotationDescription(options);

  const byTarget = new Map<string, PreviewAccumulator<TspAstInputEntry>>();
  const accumulate = (entry: TspAstInputEntry, value: unknown): void => {
    const key = `${entry.type}|${entry.class_name}|${entry.member_name ?? ""}`;
    let acc = byTarget.get(key);
    if (!acc) {
      acc = { entry, previews: new Set() };
      byTarget.set(key, acc);
    }
    collectPreviews(acc.previews, value);
  };

  for (const type of collected.types) {
    accumulate(
      {
        type: "class",
        class_name: getJavaTypeFqn(type, javaNames),
        annotation_description: baseDescription,
      },
      type.value,
    );
  }

  for (const prop of collected.properties) {
    const containerFqn = getJavaTypeFqn(
      {
        name: prop.containerName,
        namespace: prop.containerNamespace,
        access: prop.containerAccess,
      },
      javaNames,
    );
    accumulate(
      {
        type: "field",
        class_name: containerFqn,
        annotation_description: baseDescription,
        member_name: prop.propertyName,
      },
      prop.value,
    );
  }

  return [...byTarget.values()]
    .sort((a, b) => {
      const classCompare = a.entry.class_name.localeCompare(b.entry.class_name);
      if (classCompare !== 0) {
        return classCompare;
      }
      return (a.entry.member_name ?? "").localeCompare(
        b.entry.member_name ?? "",
      );
    })
    .map((acc) => ({
      ...acc.entry,
      annotation_description: buildAnnotationDescription(
        baseDescription,
        acc.previews,
      ),
    }));
}
