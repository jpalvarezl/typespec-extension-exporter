import { NoTarget, resolvePath } from "@typespec/compiler";
import type { EmitContext } from "@typespec/compiler";
import type { ExtensionEmitterOptions } from "./lib.js";
import { reportDiagnostic } from "./lib.js";
import { collectBetaFromTcgc } from "./collect-beta.js";
import { collectRawOccurrences } from "./collect-raw.js";
import {
  findNonExtensionKeys,
  findUnknownKinds,
  parseKeyFilter,
  parseKindFilter,
  parseManualEntries,
  resolveEmitterScope,
  resolvesToJavaScope,
} from "./options.js";
import { getDefaultOutputFile, serializePayload } from "./serialize.js";
import {
  resolveManualEntries,
  toListShape,
  toRevapiEntries,
  toTspAstInputEntries,
} from "./transform.js";

export { $lib } from "./lib.js";
export type {
  ExtensionOccurrence,
  ListShape,
  RevapiEntry,
  TspAstInputEntry,
} from "./types.js";

export async function $onEmit(
  context: EmitContext<ExtensionEmitterOptions>,
): Promise<void> {
  const { program } = context;
  const options = context.options;

  for (const kind of findUnknownKinds(options.kinds)) {
    reportDiagnostic(program, {
      code: "unknown-kind",
      format: { kind },
      target: NoTarget,
    });
  }
  for (const key of findNonExtensionKeys(options.keys)) {
    reportDiagnostic(program, {
      code: "non-extension-key",
      format: { key },
      target: NoTarget,
    });
  }

  const kindFilter = parseKindFilter(options.kinds);
  const keyFilter = parseKeyFilter(options.keys);

  const shape = options["output-shape"] ?? "raw";
  const format = options["output-format"] ?? "json";

  const { entries: manualEntries, invalidEntries } = parseManualEntries(
    options["manual-entries"],
  );
  for (const entry of invalidEntries) {
    reportDiagnostic(program, {
      code: "invalid-manual-entry",
      format: { entry },
      target: NoTarget,
    });
  }
  if (
    shape === "raw" &&
    (manualEntries.length > 0 || invalidEntries.length > 0)
  ) {
    reportDiagnostic(program, {
      code: "manual-entries-for-raw-shape",
      target: NoTarget,
    });
    return;
  }
  const missingNamespaces = new Set(
    manualEntries
      .filter(
        (entry) => !entry.className.includes(".") && !options.namespace?.trim(),
      )
      .map((entry) => entry.className),
  );
  for (const name of missingNamespaces) {
    reportDiagnostic(program, {
      code: "missing-namespace-for-manual-entry",
      format: { name },
      target: NoTarget,
    });
  }
  if (invalidEntries.length > 0 || missingNamespaces.size > 0) {
    return;
  }

  let payload: unknown;
  if (shape === "revapi" || shape === "tsp-ast-input") {
    const scope = resolveEmitterScope(options.language);
    if (!scope) {
      reportDiagnostic(program, {
        code: "missing-language-for-sdk-shape",
        format: { shape },
        target: NoTarget,
      });
      return;
    }
    if (!resolvesToJavaScope(options.language)) {
      reportDiagnostic(program, {
        code: "non-java-language-for-java-shape",
        format: { language: options.language!.trim(), shape },
        target: NoTarget,
      });
      return;
    }
    // These outputs are intentionally Java-specific: revapi uses `java\\..*`
    // codes and tsp-ast-input feeds Java AST customizations. Keep their TCGC
    // scope fixed to Java.
    const collected = await collectBetaFromTcgc(context, keyFilter);
    const manualTargets = resolveManualEntries(manualEntries, options, shape);
    payload =
      shape === "revapi"
        ? toRevapiEntries(collected, options, manualTargets)
        : toTspAstInputEntries(collected, options, manualTargets);
  } else if (shape === "list") {
    const scope = resolveEmitterScope(options.language);
    if (!scope) {
      reportDiagnostic(program, {
        code: "missing-language-for-sdk-shape",
        format: { shape },
        target: NoTarget,
      });
      return;
    }
    const collected = await collectBetaFromTcgc(context, keyFilter, scope);
    payload = toListShape(
      collected,
      options,
      resolveManualEntries(manualEntries, options, shape),
    );
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
