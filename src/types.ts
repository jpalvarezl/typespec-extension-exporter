import type { ExtensionEmitterOptions } from "./lib.js";

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

/** The `beta-classes` output: beta type FQNs and beta property references.
 *
 * `beta_class_properties` entries are `<ContainerFqn>::<propertyName>` for beta
 * properties declared on a non-beta container (properties of a beta container
 * are covered by the container's own `beta_classes` entry). */
export interface BetaClasses {
  /** Sorted, de-duplicated generated-SDK FQNs of beta type-level entities, e.g. "Azure.AI.Projects.Agents.AgentObject". */
  beta_classes: string[];
  /** Sorted, de-duplicated "ContainerFqn::propertyName" of beta properties on non-beta containers. */
  beta_class_properties: string[];
}

/** A single annotation-insertion request for downstream AST customization. */
export interface TspAstInputEntry {
  type: "field" | "class";
  class_name: string;
  annotation_description: string;
  member_name?: string;
}

/** A beta type-level entity, named as it appears in the generated Java SDK. */
export interface BetaType {
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
export interface BetaProperty {
  containerName: string;
  containerNamespace: string;
  containerAccess: "public" | "internal";
  /** Java property name (camelCase, reflects `@clientName`). */
  propertyName: string;
  value: unknown;
}

/** Beta entities collected from the TCGC SDK package. */
export interface CollectedBeta {
  types: BetaType[];
  properties: BetaProperty[];
}

export type OutputShape = NonNullable<ExtensionEmitterOptions["output-shape"]>;
export type OutputFormat = NonNullable<
  ExtensionEmitterOptions["output-format"]
>;
