import { createSdkContext } from "@azure-tools/typespec-client-generator-core";
import type {
  SdkEnumType,
  SdkModelType,
} from "@azure-tools/typespec-client-generator-core";
import type { EmitContext, Type } from "@typespec/compiler";
import type { ExtensionEmitterOptions } from "./lib.js";
import { getDecorators, readExtension } from "./extension.js";
import { EMITTER_SCOPES } from "./options.js";
import type { BetaProperty, BetaType, CollectedBeta } from "./types.js";

/** Default TCGC emitter scope (Java, preserving existing Java outputs). */
export const DEFAULT_EMITTER_SCOPE = EMITTER_SCOPES.java;

/** Collect beta types and properties from the TCGC SDK package. */
export async function collectBetaFromTcgc(
  context: EmitContext<ExtensionEmitterOptions>,
  keyFilter: Set<string> | undefined,
  emitterScope: string = DEFAULT_EMITTER_SCOPE,
): Promise<CollectedBeta> {
  // Use a language emitter scope so language-scoped customizations
  // (`@clientName(..., "<lang>")`, `@@clientNamespace(..., "<lang>")`) are
  // applied. TCGC derives the language from this emitter name, e.g.
  // `@azure-tools/typespec-java` -> java, `@typespec/http-client-csharp` ->
  // csharp.
  const sdkContext = await createSdkContext(context, emitterScope);
  const pkg = sdkContext.sdkPackage;

  const types: BetaType[] = [];
  const properties: BetaProperty[] = [];
  const betaModelRaws = new Set<Type>();

  const pushNamed = (
    sdkType: SdkModelType | SdkEnumType,
    matched: { value: unknown },
  ): void => {
    // Skip namespace-less SDK types, such as synthetic request bodies.
    // Some inline TypeSpec models do become named, namespaced SDK types.
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
    const matched = readExtension(getDecorators(model.__raw), keyFilter);
    if (matched) {
      pushNamed(model, matched);
      if (model.__raw) {
        betaModelRaws.add(model.__raw);
      }
    }
  }

  for (const enumType of pkg.enums) {
    const matched = readExtension(getDecorators(enumType.__raw), keyFilter);
    if (matched) {
      pushNamed(enumType, matched);
    }
  }

  for (const union of pkg.unions) {
    if (union.kind !== "union") {
      continue; // SdkNullableType has no distinct named Java type
    }
    const matched = readExtension(getDecorators(union.__raw), keyFilter);
    if (matched && union.name && union.namespace) {
      types.push({
        name: union.name,
        namespace: union.namespace,
        access: union.access,
        value: matched.value,
      });
    }
  }

  // Properties marked beta on a non-beta container; properties of a beta model
  // are already covered by the model's own entry.
  for (const model of pkg.models) {
    if (!model.namespace) {
      continue; // no namespace for a generated SDK target
    }
    if (model.__raw && betaModelRaws.has(model.__raw)) {
      continue;
    }
    for (const prop of model.properties) {
      const matched = readExtension(getDecorators(prop.__raw), keyFilter);
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
