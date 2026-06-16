import { describe, expect, it } from "vitest";
import {
  buildAnnotationDescription,
  collectPreviews,
  escapeRegExp,
  getJavaTypeFqn,
  toPascalCase,
  toRevapiEntries,
  toTspAstInputEntries,
} from "../../dist/src/transform.js";
import type { CollectedBeta } from "../../dist/src/types.js";

const JAVA_NAMES = {
  modelsSubpackage: "models",
  internalSubpackage: "implementation.models",
};

describe("escapeRegExp", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegExp("com.azure.M$1")).toBe("com\\.azure\\.M\\$1");
  });
});

describe("toPascalCase", () => {
  it("converts snake_case to PascalCase", () => {
    expect(toPascalCase("blob_url")).toBe("BlobUrl");
  });

  it("preserves an already-camelCase name's word, only capitalizing the first", () => {
    expect(toPascalCase("blobUrl")).toBe("BlobUrl");
  });

  it("handles kebab-case and drops empty segments", () => {
    expect(toPascalCase("a--b")).toBe("AB");
  });
});

describe("getJavaTypeFqn", () => {
  it("places public types under the models subpackage", () => {
    const fqn = getJavaTypeFqn(
      { name: "Widget", namespace: "com.azure.ai.agents", access: "public" },
      JAVA_NAMES,
    );
    expect(fqn).toBe("com.azure.ai.agents.models.Widget");
  });

  it("places internal types under the internal subpackage", () => {
    const fqn = getJavaTypeFqn(
      { name: "Secret", namespace: "com.azure.ai.agents", access: "internal" },
      JAVA_NAMES,
    );
    expect(fqn).toBe("com.azure.ai.agents.implementation.models.Secret");
  });

  it("applies a namespace override", () => {
    const fqn = getJavaTypeFqn(
      { name: "Widget", namespace: "ignored", access: "public" },
      { ...JAVA_NAMES, namespaceOverride: "com.contoso" },
    );
    expect(fqn).toBe("com.contoso.models.Widget");
  });
});

describe("collectPreviews", () => {
  it("gathers required and conditional preview keys", () => {
    const target = new Set<string>();
    collectPreviews(target, {
      required_previews: ["A=V1"],
      conditional_previews: ["B=V2"],
    });
    expect([...target].sort()).toEqual(["A=V1", "B=V2"]);
  });

  it("ignores non-object and empty values", () => {
    const target = new Set<string>();
    collectPreviews(target, null);
    collectPreviews(target, "string");
    collectPreviews(target, { required_previews: ["", 5] });
    expect(target.size).toBe(0);
  });
});

describe("buildAnnotationDescription", () => {
  it("returns the base text when there are no previews", () => {
    expect(buildAnnotationDescription("Preview API.", new Set())).toBe(
      "Preview API.",
    );
  });

  it("appends sorted preview keys", () => {
    expect(
      buildAnnotationDescription("Preview API.", new Set(["B", "A"])),
    ).toBe("Preview API. A, B");
  });
});

const COLLECTED: CollectedBeta = {
  types: [
    {
      name: "AgentDefinition",
      namespace: "com.azure.ai.agents",
      access: "public",
      value: { required_previews: ["Hosted=V1"] },
    },
  ],
  properties: [
    {
      containerName: "Tool",
      containerNamespace: "com.azure.ai.agents",
      containerAccess: "public",
      propertyName: "blobUrl",
      value: { required_previews: ["Eval=V1"] },
    },
  ],
};

describe("toRevapiEntries", () => {
  it("builds class- and accessor-level ignore entries", () => {
    const entries = toRevapiEntries(COLLECTED, {});

    expect(entries).toContainEqual({
      ignore: true,
      regex: true,
      code: "java\\..*",
      old: ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.AgentDefinition(?![\\w$]).*",
      justification: "Preview API. Hosted=V1",
    });
    expect(entries).toContainEqual({
      ignore: true,
      regex: true,
      code: "java\\..*",
      old: ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.Tool::(get|set|is|with)?BlobUrl(?![\\w$]).*",
      justification: "Preview API. Eval=V1",
    });
  });

  it("merges duplicate targets and unions their preview keys", () => {
    const collected: CollectedBeta = {
      types: [
        { ...COLLECTED.types[0], value: { required_previews: ["A=V1"] } },
        { ...COLLECTED.types[0], value: { required_previews: ["B=V1"] } },
      ],
      properties: [],
    };
    const entries = toRevapiEntries(collected, {});
    expect(entries).toHaveLength(1);
    expect(entries[0].justification).toBe("Preview API. A=V1, B=V1");
  });

  it("honors a custom justification", () => {
    const entries = toRevapiEntries(COLLECTED, { justification: "Beta." });
    expect(entries.every((e) => e.justification.startsWith("Beta."))).toBe(
      true,
    );
  });
});

describe("toTspAstInputEntries", () => {
  it("builds class and field entries", () => {
    const entries = toTspAstInputEntries(COLLECTED, {});

    expect(entries).toContainEqual({
      type: "class",
      class_name: "com.azure.ai.agents.models.AgentDefinition",
      annotation_description: "Preview API. Hosted=V1",
    });
    expect(entries).toContainEqual({
      type: "field",
      class_name: "com.azure.ai.agents.models.Tool",
      annotation_description: "Preview API. Eval=V1",
      member_name: "blobUrl",
    });
  });
});
