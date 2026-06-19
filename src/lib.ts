import {
  createTypeSpecLibrary,
  JSONSchemaType,
  paramMessage,
} from "@typespec/compiler";

/** Options accepted by the emitter (passed via `--option typespec-extension-exporter.<name>=<value>`). */
export interface ExtensionEmitterOptions {
  /**
   * Restrict the output to occurrences whose extension key matches one of these
   * values. Comma-separated and case-sensitive, e.g. "x-ms-foundry-meta".
   * When omitted, occurrences for any extension key are included.
   */
  keys?: string;
  /**
   * Restrict the output to occurrences applied to these target kinds.
   * Comma-separated, case-insensitive TypeSpec kinds, e.g.
   * "model,modelProperty,operation,enum,union,scalar". The alias "field" maps
   * to "modelProperty". When omitted, all kinds are included.
   */
  kinds?: string;
  /**
   * Output shape:
   * - "raw" (default): raw @extension occurrences with source locations.
   * - "revapi": revapi `differences` ignore entries, mapping each beta entity
   *   to its Java fully-qualified name.
   * - "tsp-ast-input": annotation insertion requests for downstream AST
   *   customization.
   * - "list": the class/field entries collapsed into two lists (`class` FQNs
   *   and `field` references), named by their generated SDK fully-qualified
   *   name (language-neutral; pair with `language`).
   */
  "output-shape"?: "raw" | "revapi" | "tsp-ast-input" | "list";
  /** Output serialization format. Defaults to "json". */
  "output-format"?: "json" | "yaml" | "csv";
  /** Name of the output file to write into the emitter output directory. */
  "output-file"?: string;

  // --- SDK-output options (used when output-shape is "revapi", "tsp-ast-input", or "list") ---

  /**
   * Target SDK language for the language-neutral `list` shape. Known values:
   * "java" (default), "csharp". Any other value is treated as a raw TCGC
   * emitter name. `revapi` and `tsp-ast-input` are Java-specific; non-Java
   * values for those shapes are an error.
   */
  language?: string;
  /**
   * Optional override for the generated SDK base namespace/package, e.g.
   * "com.azure.ai.agents" (Java) or "Azure.AI.Projects.Agents" (.NET). When
   * omitted, the client namespace resolved by TCGC (which honours
   * `@@clientNamespace`) is used.
   */
  namespace?: string;
  /** Subpackage where public models/enums live. Defaults to "models". */
  "models-subpackage"?: string;
  /** Subpackage where internal (non-public) types live. Defaults to "implementation.models". */
  "internal-subpackage"?: string;
  /** Base annotation/justification text attached to each generated Java output entry. */
  justification?: string;
}

const EmitterOptionsSchema: JSONSchemaType<ExtensionEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    keys: { type: "string", nullable: true },
    kinds: { type: "string", nullable: true },
    "output-shape": {
      type: "string",
      enum: ["raw", "revapi", "tsp-ast-input", "list"],
      nullable: true,
    },
    "output-format": {
      type: "string",
      enum: ["json", "yaml", "csv"],
      nullable: true,
    },
    "output-file": { type: "string", nullable: true },
    language: { type: "string", nullable: true },
    namespace: { type: "string", nullable: true },
    "models-subpackage": { type: "string", nullable: true },
    "internal-subpackage": { type: "string", nullable: true },
    justification: { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "typespec-extension-exporter",
  diagnostics: {
    "unknown-kind": {
      severity: "warning",
      messages: {
        default: paramMessage`Unknown kind '${"kind"}' in the 'kinds' option; it will never match. Valid kinds: model, modelProperty (alias 'field'), operation, enum, enumMember, union, unionVariant, scalar, interface.`,
      },
    },
    "non-extension-key": {
      severity: "warning",
      messages: {
        default: paramMessage`Key '${"key"}' in the 'keys' option does not start with 'x-'; OpenAPI @extension keys always do, so it will never match.`,
      },
    },
    "non-java-language-for-java-shape": {
      severity: "error",
      messages: {
        default: paramMessage`The 'language' option value '${"language"}' is not supported for output-shape '${"shape"}'; that shape is Java-specific. Use output-shape 'list' for language-neutral output.`,
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
