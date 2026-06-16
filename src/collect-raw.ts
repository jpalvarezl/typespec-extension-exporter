import {
  getNamespaceFullName,
  getSourceLocation,
  getTypeName,
  navigateProgram,
} from "@typespec/compiler";
import type {
  EmitContext,
  Namespace,
  SemanticNodeListener,
  Type,
} from "@typespec/compiler";
import type { ExtensionEmitterOptions } from "./lib.js";
import { getDecorators, isOpenApiExtension } from "./extension.js";
import type { ExtensionOccurrence } from "./types.js";

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

/** Find the containing namespace name for a type, if one can be resolved. */
function getContainingNamespace(type: Type): string | undefined {
  let ns: Namespace | undefined;
  switch (type.kind) {
    case "Model":
    case "Enum":
    case "Union":
    case "Operation":
    case "Interface":
    case "Scalar":
      ns = type.namespace;
      break;
    case "ModelProperty":
      ns = type.model?.namespace;
      break;
    case "EnumMember":
      ns = type.enum.namespace;
      break;
    case "UnionVariant":
      ns = type.union.namespace;
      break;
  }
  if (ns === undefined) {
    return undefined;
  }
  const name = getNamespaceFullName(ns);
  return name === "" ? undefined : name;
}

/** Collect raw `@extension` occurrences with source locations via the type graph. */
export function collectRawOccurrences(
  context: EmitContext<ExtensionEmitterOptions>,
  kindFilter: Set<string> | undefined,
  keyFilter: Set<string> | undefined,
): ExtensionOccurrence[] {
  const occurrences: ExtensionOccurrence[] = [];

  const collect = (type: Type): void => {
    if (kindFilter && !kindFilter.has(type.kind.toLowerCase())) {
      return;
    }

    for (const dec of getDecorators(type) ?? []) {
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
