import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

/** Options accepted by the emitter (passed via `--option revapi-ignore-emitter.<name>=<value>`). */
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
   * Output format:
   * - "raw" (default): a JSON array of raw occurrences with source locations.
   * - "revapi": a JSON array of revapi `differences` ignore entries, mapping
   *   each beta entity to its Java fully-qualified name.
   * - "tsp-ast-input": a JSON array of annotation insertion requests for
   *   downstream AST customization.
   */
  "output-format"?: "raw" | "revapi" | "tsp-ast-input";
  /** Name of the JSON file to write into the emitter output directory. */
  "output-file"?: string;

  // --- Java-output options (used when output-format is "revapi" or "tsp-ast-input") ---

  /**
   * Optional override for the Java base package, e.g. "com.azure.ai.agents".
   * When omitted, the client namespace resolved by TCGC (which honours
   * `@@clientNamespace(..., "java")`) is used.
   */
  "java-namespace"?: string;
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
    "output-format": {
      type: "string",
      enum: ["raw", "revapi", "tsp-ast-input"],
      nullable: true,
    },
    "output-file": { type: "string", nullable: true },
    "java-namespace": { type: "string", nullable: true },
    "models-subpackage": { type: "string", nullable: true },
    "internal-subpackage": { type: "string", nullable: true },
    justification: { type: "string", nullable: true },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "revapi-ignore-emitter",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
