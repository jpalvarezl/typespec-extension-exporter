import type { ExtensionEmitterOptions } from "./lib.js";
import {
  getBaseAnnotationDescription,
  getJavaNameOptions,
  getSdkNameOptions,
  type JavaNameOptions,
  type SdkNameOptions,
} from "./options.js";
import type {
  CollectedBeta,
  ListShape,
  ManualEntry,
  OutputShape,
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
    .split(/[_-]/)
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

/** Build the simple class fully-qualified name (base namespace + type name).
 *
 * Unlike {@link getJavaTypeFqn}, this does not insert a models/internal
 * subpackage: it targets languages (e.g. .NET) where generated types live
 * directly under the client namespace from `@@clientNamespace`. */
export function getClassFqn(
  entity: { name: string; namespace: string },
  options: SdkNameOptions,
): string {
  const base = options.namespaceOverride ?? entity.namespace;
  return [base, entity.name]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(".");
}

/** Qualify manual short names, leaving explicit FQNs untouched. */
export function resolveManualEntries(
  entries: ManualEntry[],
  options: ExtensionEmitterOptions,
  shape: Exclude<OutputShape, "raw">,
): ManualEntry[] {
  return entries.map((entry) => {
    if (entry.className.includes(".")) {
      return entry;
    }
    const namespace = options.namespace?.trim();
    if (!namespace) {
      throw new TypeError(
        `Cannot resolve manual class '${entry.className}' without an explicit namespace.`,
      );
    }
    const entity = {
      name: entry.className,
      namespace,
      access: "public" as const,
    };
    return {
      ...entry,
      className:
        shape === "list"
          ? getClassFqn(entity, getSdkNameOptions(options))
          : getJavaTypeFqn(entity, getJavaNameOptions(options)),
    };
  });
}

/**
 * Transform collected beta entities into the `list` output: the class/field
 * entries (as seen in the csv/tsp-ast-input shapes) collapsed into two sorted,
 * de-duplicated lists. `class` holds beta type-level FQNs; `field` holds beta
 * property references (`<ContainerFqn>::<propertyName>`) on non-beta
 * containers. Properties of a beta container are omitted (covered by the
 * container's class entry). The FQN carries no models/internal subpackage.
 * Manual entries must already be qualified and are included explicitly.
 */
export function toListShape(
  collected: CollectedBeta,
  options: ExtensionEmitterOptions,
  manualEntries: ManualEntry[] = [],
): ListShape {
  const sdkNames = getSdkNameOptions(options);
  const classes = new Set<string>();
  for (const type of collected.types) {
    classes.add(getClassFqn(type, sdkNames));
  }
  const fields = new Set<string>();
  for (const prop of collected.properties) {
    const containerFqn = getClassFqn(
      { name: prop.containerName, namespace: prop.containerNamespace },
      sdkNames,
    );
    fields.add(`${containerFqn}::${prop.propertyName}`);
  }
  for (const entry of manualEntries) {
    if (entry.type === "class") {
      classes.add(entry.className);
    } else {
      fields.add(`${entry.className}::${entry.memberName}`);
    }
  }
  const sorted = (values: Set<string>): string[] =>
    [...values].sort((a, b) => a.localeCompare(b));
  return { class: sorted(classes), field: sorted(fields) };
}

/**
 * Transform collected beta entities into revapi `differences` ignore entries.
 *
 * Each entry uses `code: "java\\..*"` so that any kind of breaking change
 * (class/method/field removal, signature change, ...) on the matched Java
 * element is ignored. The `old` regex is anchored with a word boundary at the
 * start and a negative look-ahead at the end so it matches the entity and its
 * members but never a longer name that merely shares the same prefix.
 * Manual entries must already be qualified and are included explicitly.
 */
export function toRevapiEntries(
  collected: CollectedBeta,
  options: ExtensionEmitterOptions,
  manualEntries: ManualEntry[] = [],
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
  const accumulateClass = (fqn: string, value: unknown): void =>
    accumulate(`.*\\b${escapeRegExp(fqn)}(?![\\w$]).*`, value);
  const accumulateField = (
    fqn: string,
    memberName: string,
    value: unknown,
  ): void =>
    accumulate(
      `.*\\b${escapeRegExp(fqn)}::(get|set|is|with)?${escapeRegExp(
        toPascalCase(memberName),
      )}(?![\\w$]).*`,
      value,
    );

  for (const type of collected.types) {
    const fqn = getJavaTypeFqn(type, javaNames);
    accumulateClass(fqn, type.value);
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
    accumulateField(containerFqn, prop.propertyName, prop.value);
  }

  for (const entry of manualEntries) {
    if (entry.type === "class") {
      accumulateClass(entry.className, undefined);
    } else {
      accumulateField(entry.className, entry.memberName, undefined);
    }
  }

  return [...byOld.values()]
    .sort((a, b) => a.entry.old.localeCompare(b.entry.old))
    .map((acc) => ({
      ignore: true as const,
      regex: true as const,
      code: REVAPI_CODE,
      old: acc.entry.old,
      justification: buildAnnotationDescription(
        baseJustification,
        acc.previews,
      ),
    }));
}

/**
 * Transform collected beta entities into tsp-ast-input annotation requests.
 *
 * Class entries target the generated Java type FQN. Field entries target the
 * containing generated Java type FQN plus the generated Java member name from
 * TCGC (camelCase, reflecting Java `@clientName` customizations).
 * Manual entries must already be qualified and use member names verbatim.
 */
export function toTspAstInputEntries(
  collected: CollectedBeta,
  options: ExtensionEmitterOptions,
  manualEntries: ManualEntry[] = [],
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

  for (const entry of manualEntries) {
    accumulate(
      {
        type: entry.type,
        class_name: entry.className,
        annotation_description: baseDescription,
        ...(entry.type === "field" ? { member_name: entry.memberName } : {}),
      },
      undefined,
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
