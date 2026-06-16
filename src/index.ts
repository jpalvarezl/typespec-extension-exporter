import { resolvePath } from "@typespec/compiler";
import type { EmitContext } from "@typespec/compiler";
import type { ExtensionEmitterOptions } from "./lib.js";
import { collectBetaFromTcgc } from "./collect-beta.js";
import { collectRawOccurrences } from "./collect-raw.js";
import { parseKeyFilter, parseKindFilter } from "./options.js";
import { getDefaultOutputFile, serializePayload } from "./serialize.js";
import { toRevapiEntries, toTspAstInputEntries } from "./transform.js";

export { $lib } from "./lib.js";
export type {
  ExtensionOccurrence,
  RevapiEntry,
  TspAstInputEntry,
} from "./types.js";

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

  const fileName = options["output-file"] ?? getDefaultOutputFile(shape, format);

  const outputFile = resolvePath(context.emitterOutputDir, fileName);
  await program.host.mkdirp(context.emitterOutputDir);
  await program.host.writeFile(
    outputFile,
    serializePayload(payload, shape, format),
  );
}
