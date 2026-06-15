import {
  createSdkContext,
  type SdkEnumType,
  type SdkModelType,
  type SdkType,
} from "@azure-tools/typespec-client-generator-core";
import { stringify as stringifyYaml } from "yaml";
import {
  EmitContext,
  getNamespaceFullName,
  getSourceLocation,
  getTypeName,
  navigateProgram,
  resolvePath,
  type DecoratorApplication,
  type Namespace,
  type SemanticNodeListener,
  type Type,
} from "@typespec/compiler";
import type { ExtensionEmitterOptions } from "./lib.js";

export { $lib } from "./lib.js";

/** Shape of a single @extension occurrence in the emitted JSON (raw format). */
export interface ExtensionOccurrence {
  /** The extension key, e.g. "x-ms-enum". */
  key: string;
  /** The value passed to the extension (marshalled to a JS value). */
  value: unknown;
  /** Kind of the type the decorator is applied to, e.g. "Model", "ModelProperty", "Operation". */
  targetKind: string;
  /** Fully-qualified name of the target the decorator is applied to. */
  targetName: string;
  /** Fully-qualified containing namespace, if any. */
  namespace?: string;
  /** Source file where the decorator appears. */
  file: string;
  /** 1-based line number of the decorator. */
  line: number;
  /** 1-based column number of the decorator. */
  column: number;
}

/** A single revapi `differences` ignore entry. */
export interface RevapiEntry {
  ignore: true;
  regex: true;
  code: string;
  old: string;
  justification: string;
}

/** A single annotation-insertion request for downstream AST customization. */
export interface TspAstInputEntry {
  type: "field" | "class";
  class_name: string;
  annotation_description: string;
  member_name?: string;
}

type OutputShape = NonNullable<ExtensionEmitterOptions["output-shape"]>;
type OutputFormat = NonNullable<ExtensionEmitterOptions["output-format"]>;

/** Listener callback names (uncapitalized type kinds) we attach the collector to. */
const VISITED_KINDS = [
  "model",
  "modelProperty",
  "operation",
  "enum",
  "enumMember",
  "union",
  "unionVariant",
  "scalar",
  "interface",
] as const;

/** Normalize a user-provided kind filter value to a canonical lowercase kind. */
function normalizeKind(kind: string): string {
  const value = kind.trim().toLowerCase();
  return value === "field" ? "modelproperty" : value;
}

/**
 * Identify the `@extension` decorator from `@typespec/openapi`.
 *
 * We match by name (not function identity) so detection works even when the
 * emitter and the compiled spec resolve `@typespec/openapi` from different
 * `node_modules`, which would otherwise yield distinct decorator instances.
 */
function isOpenApiExtension(dec: DecoratorApplication): boolean {
  const def = dec.definition;
  if (def?.name === "@extension") {
    return getNamespaceFullName(def.namespace) === "TypeSpec.OpenAPI";
  }
  return dec.decorator?.name === "$extension";
}

/** Parse the comma-separated `kinds` option into a set, or undefined when unset/empty. */
function parseKindFilter(kinds: string | undefined): Set<string> | undefined {
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
function parseKeyFilter(keys: string | undefined): Set<string> | undefined {
  if (!keys) {
    return undefined;
  }
  const values = keys
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length > 0 ? new Set(values) : undefined;
}

/** Find the containing namespace name for a type, if one can be resolved. */
function getContainingNamespace(type: Type): string | undefined {
  const ns: Namespace | undefined =
    (type as { namespace?: Namespace }).namespace ??
    (type as { model?: { namespace?: Namespace } }).model?.namespace ??
    (type as { union?: { namespace?: Namespace } }).union?.namespace ??
    (type as { enum?: { namespace?: Namespace } }).enum?.namespace;
  if (ns === undefined) {
    return undefined;
  }
  const name = getNamespaceFullName(ns);
  return name === "" ? undefined : name;
}

/** Escape a literal string for safe embedding inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert a property name (snake_case or camelCase) to PascalCase for a Java accessor. */
function toPascalCase(name: string): string {
  return name
    .split(/[_\-]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// --- raw mode -------------------------------------------------------------

/** Collect raw `@extension` occurrences with source locations via the type graph. */
function collectRawOccurrences(
  context: EmitContext<ExtensionEmitterOptions>,
  kindFilter: Set<string> | undefined,
  keyFilter: Set<string> | undefined,
): ExtensionOccurrence[] {
  const occurrences: ExtensionOccurrence[] = [];

  const collect = (type: Type): void => {
    if (kindFilter && !kindFilter.has(type.kind.toLowerCase())) {
      return;
    }

    const decorated = type as Type & { decorators?: DecoratorApplication[] };
    for (const dec of decorated.decorators ?? []) {
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
      const value = dec.args[1]?.jsValue ?? null;
      const location = getSourceLocation(dec.node ?? type.node ?? type);
      const { line, character } = location.file.getLineAndCharacterOfPosition(
        location.pos,
      );
      occurrences.push({
        key,
        value,
        targetKind: type.kind,
        targetName: getTypeName(type),
        namespace: getContainingNamespace(type),
        file: location.file.path,
        line: line + 1,
        column: character + 1,
      });
    }
  };

  const listener: SemanticNodeListener = {};
  for (const kind of VISITED_KINDS) {
    (listener as Record<string, (type: Type) => void>)[kind] = collect;
  }
  navigateProgram(context.program, listener);

  return occurrences;
}

// --- Java beta entity modes (via TCGC) ------------------------------------

/**
 * revapi difference `code` applied to every generated entry. The `java\..*`
 * regex matches any breaking-change code (class/method/field removal, signature
 * change, ...) so the entry suppresses every kind of change on its target.
 */
const REVAPI_CODE = "java\\..*";

/** A beta type-level entity, named as it appears in the generated Java SDK. */
interface BetaType {
  /** Java type name (reflects `@clientName` customizations). */
  name: string;
  /** Java client namespace, e.g. "com.azure.ai.agents". */
  namespace: string;
  /** Whether the type is public or relocated to the internal subpackage. */
  access: "public" | "internal";
  /** Value passed to the matched `@extension` decorator. */
  value: unknown;
}

/** A beta property declared on a (non-beta) type. */
interface BetaProperty {
  containerName: string;
  containerNamespace: string;
  containerAccess: "public" | "internal";
  /** Java property name (camelCase, reflects `@clientName`). */
  propertyName: string;
  value: unknown;
}

/** Read a matching `@extension` value off the raw TypeSpec type, if any. */
function readExtension(
  raw: Type | undefined,
  keyFilter: Set<string> | undefined,
): { value: unknown } | undefined {
  const decorators = (
    raw as { decorators?: DecoratorApplication[] } | undefined
  )?.decorators;
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

/** Collect beta types and properties from the TCGC SDK package. */
async function collectBetaFromTcgc(
  context: EmitContext<ExtensionEmitterOptions>,
  keyFilter: Set<string> | undefined,
): Promise<{ types: BetaType[]; properties: BetaProperty[] }> {
  // Use the Java emitter scope so `@clientName(..., "java")` and
  // `@@clientNamespace(..., "java")` customizations are applied. TCGC derives
  // the language ("java") from this emitter name.
  const sdkContext = await createSdkContext(
    context,
    "@azure-tools/typespec-java",
  );
  const pkg = sdkContext.sdkPackage;

  const types: BetaType[] = [];
  const properties: BetaProperty[] = [];
  const betaModelRaws = new Set<Type>();

  const pushNamed = (
    sdkType: SdkModelType | SdkEnumType,
    matched: { value: unknown },
  ): void => {
    // Anonymous models (e.g. request bodies) have no client namespace and do
    // not map to a distinct public Java type; their beta members are covered
    // by the named models they originate from, so skip them.
    if (!sdkType.namespace) {
      return;
    }
    types.push({
      name: sdkType.name,
      namespace: sdkType.namespace,
      access: sdkType.access,
      value: matched.value,
    });
  };

  for (const model of pkg.models) {
    const matched = readExtension(model.__raw, keyFilter);
    if (matched) {
      pushNamed(model, matched);
      if (model.__raw) {
        betaModelRaws.add(model.__raw);
      }
    }
  }

  for (const enumType of pkg.enums) {
    const matched = readExtension(enumType.__raw, keyFilter);
    if (matched) {
      pushNamed(enumType, matched);
    }
  }

  for (const union of pkg.unions) {
    const named = union as SdkType & {
      name?: string;
      namespace?: string;
      access?: "public" | "internal";
      __raw?: Type;
    };
    const matched = readExtension(named.__raw, keyFilter);
    if (matched && named.name && named.namespace) {
      types.push({
        name: named.name,
        namespace: named.namespace,
        access: named.access ?? "public",
        value: matched.value,
      });
    }
  }

  // Properties marked beta on a non-beta container; properties of a beta model
  // are already covered by the model's own entry.
  for (const model of pkg.models) {
    if (!model.namespace) {
      continue; // anonymous model, no distinct public Java type
    }
    if (model.__raw && betaModelRaws.has(model.__raw)) {
      continue;
    }
    for (const prop of model.properties) {
      const matched = readExtension(prop.__raw, keyFilter);
      if (matched) {
        properties.push({
          containerName: model.name,
          containerNamespace: model.namespace,
          containerAccess: model.access,
          propertyName: prop.name,
          value: matched.value,
        });
      }
    }
  }

  return { types, properties };
}

/** Shared Java naming options for outputs based on generated Java symbols. */
interface JavaNameOptions {
  namespaceOverride?: string;
  modelsSubpackage: string;
  internalSubpackage: string;
}

/** Accumulator for an entry whose annotation/justification merges preview keys. */
interface PreviewAccumulator<T> {
  entry: T;
  previews: Set<string>;
}

/** Collect preview feature keys (e.g. "AgentEndpoints=V1Preview") from a value. */
function collectPreviews(target: Set<string>, value: unknown): void {
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

/** Build the default annotation/justification text. */
function getBaseAnnotationDescription(options: ExtensionEmitterOptions): string {
  return (
    options.justification ??
    "Preview API."
  );
}

/** Resolve the Java naming options shared by revapi and tsp-ast-input modes. */
function getJavaNameOptions(options: ExtensionEmitterOptions): JavaNameOptions {
  return {
    namespaceOverride: options["java-namespace"],
    modelsSubpackage: options["models-subpackage"] ?? "models",
    internalSubpackage:
      options["internal-subpackage"] ?? "implementation.models",
  };
}

/** Build the Java fully-qualified name for a generated type. */
function getJavaTypeFqn(
  entity: { name: string; namespace: string; access: "public" | "internal" },
  options: JavaNameOptions,
): string {
  const base = options.namespaceOverride ?? entity.namespace;
  const subpackage =
    entity.access === "internal"
      ? options.internalSubpackage
      : options.modelsSubpackage;
  return `${base}.${subpackage}.${entity.name}`;
}

/** Build the annotation/justification text, appending the gating preview feature keys. */
function buildAnnotationDescription(base: string, previews: Set<string>): string {
  if (previews.size === 0) {
    return base;
  }
  const keys = [...previews].sort().join(", ");
  return `${base} ${keys}`;
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
function toRevapiEntries(
  collected: { types: BetaType[]; properties: BetaProperty[] },
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
function toTspAstInputEntries(
  collected: { types: BetaType[]; properties: BetaProperty[] },
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

// --- serialization ---------------------------------------------------------

function getDefaultOutputFile(shape: OutputShape, format: OutputFormat): string {
  const baseName =
    shape === "raw"
      ? "extensions"
      : shape === "revapi"
        ? "revapi"
        : "tsp-ast-input";
  const extension = format === "yaml" ? "yaml" : format;
  return `${baseName}.${extension}`;
}

function getCsvHeaders(shape: OutputShape): string[] {
  switch (shape) {
    case "raw":
      return [
        "key",
        "value",
        "targetKind",
        "targetName",
        "namespace",
        "file",
        "line",
        "column",
      ];
    case "revapi":
      return ["ignore", "regex", "code", "old", "justification"];
    case "tsp-ast-input":
      return ["type", "class_name", "annotation_description", "member_name"];
  }
}

function stringifyCsvValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[";\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeCsv(payload: unknown, shape: OutputShape): string {
  const headers = getCsvHeaders(shape);
  const rows = Array.isArray(payload) ? payload : [];
  const lines = [headers.join(";")];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(
      headers.map((header) => stringifyCsvValue(record[header])).join(";"),
    );
  }
  return `${lines.join("\n")}\n`;
}

function serializePayload(
  payload: unknown,
  shape: OutputShape,
  format: OutputFormat,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(payload, null, 2);
    case "yaml":
      return stringifyYaml(payload);
    case "csv":
      return serializeCsv(payload, shape);
  }
}

export async function $onEmit(
  context: EmitContext<ExtensionEmitterOptions>,
): Promise<void> {
  const { program } = context;
  const options = context.options;

  const kindFilter = parseKindFilter(options.kinds);
  const keyFilter = parseKeyFilter(options.keys);

  const shape = options["output-shape"] ?? "raw";
  const format = options["output-format"] ?? "json";

  let payload: unknown;
  if (shape === "revapi" || shape === "tsp-ast-input") {
    const collected = await collectBetaFromTcgc(context, keyFilter);
    payload =
      shape === "revapi"
        ? toRevapiEntries(collected, options)
        : toTspAstInputEntries(collected, options);
  } else {
    payload = collectRawOccurrences(context, kindFilter, keyFilter);
  }

  if (program.compilerOptions.noEmit) {
    return;
  }

  const fileName =
    options["output-file"] ?? getDefaultOutputFile(shape, format);

  const outputFile = resolvePath(context.emitterOutputDir, fileName);
  await program.host.mkdirp(context.emitterOutputDir);
  await program.host.writeFile(
    outputFile,
    serializePayload(payload, shape, format),
  );
}
