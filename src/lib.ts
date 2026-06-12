import { createTypeSpecLibrary, JSONSchemaType } from "@typespec/compiler";

/** Options accepted by the emitter (passed via `--option extension-emitter.<name>=<value>`). */
export interface ExtensionEmitterOptions {
  /**
   * Restrict the output to occurrences applied to these target kinds.
   * Comma-separated, case-insensitive TypeSpec kinds, e.g.
   * "model,modelProperty,operation,enum,union,scalar". The alias "field" maps
   * to "modelProperty". When omitted, all kinds are included.
   */
  kinds?: string;
  /** Name of the JSON file to write into the emitter output directory. */
  "output-file"?: string;
}

const EmitterOptionsSchema: JSONSchemaType<ExtensionEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    kinds: {
      type: "string",
      nullable: true,
    },
    "output-file": {
      type: "string",
      nullable: true,
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "extension-emitter",
  diagnostics: {},
  emitter: {
    options: EmitterOptionsSchema,
  },
});

export const { reportDiagnostic, createDiagnostic } = $lib;
