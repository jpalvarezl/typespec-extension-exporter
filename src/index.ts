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
import { $extension } from "@typespec/openapi";
import type { ExtensionEmitterOptions } from "./lib.js";

export { $lib } from "./lib.js";

/** Shape of a single @extension occurrence in the emitted JSON. */
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

export async function $onEmit(
  context: EmitContext<ExtensionEmitterOptions>,
): Promise<void> {
  const { program } = context;
  const options = context.options;

  const kindFilter = parseKindFilter(options.kinds);

  const occurrences: ExtensionOccurrence[] = [];

  const collect = (type: Type): void => {
    if (kindFilter && !kindFilter.has(type.kind.toLowerCase())) {
      return;
    }

    const decorated = type as Type & { decorators?: DecoratorApplication[] };
    const decorators = decorated.decorators ?? [];
    for (const dec of decorators) {
      if (dec.decorator !== $extension) {
        continue;
      }

      const key = dec.args[0]?.jsValue;
      if (typeof key !== "string") {
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

  navigateProgram(program, listener);

  if (program.compilerOptions.noEmit) {
    return;
  }

  const fileName = options["output-file"] ?? "extensions.json";
  const outputFile = resolvePath(context.emitterOutputDir, fileName);
  await program.host.mkdirp(context.emitterOutputDir);
  await program.host.writeFile(outputFile, JSON.stringify(occurrences, null, 2));
}
