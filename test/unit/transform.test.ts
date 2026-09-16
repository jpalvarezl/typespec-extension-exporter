import { describe, expect, it } from "vitest";
import {
  buildAnnotationDescription,
  collectPreviews,
  escapeRegExp,
  getClassFqn,
  getJavaTypeFqn,
  resolveManualEntries,
  toListShape,
  toPascalCase,
  toRevapiEntries,
  toTspAstInputEntries,
} from "../../dist/src/transform.js";
import { parseManualEntries } from "../../dist/src/options.js";
import type { ExtensionEmitterOptions } from "../../dist/src/lib.js";
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

describe("getClassFqn", () => {
  it("joins namespace and name without inserting a subpackage", () => {
    expect(
      getClassFqn({ name: "Widget", namespace: "Azure.AI.Agents" }, JAVA_NAMES),
    ).toBe("Azure.AI.Agents.Widget");
  });

  it("applies a namespace override", () => {
    expect(
      getClassFqn(
        { name: "Widget", namespace: "ignored" },
        { ...JAVA_NAMES, namespaceOverride: "Contoso.Ai" },
      ),
    ).toBe("Contoso.Ai.Widget");
  });

  it("drops an empty namespace, leaving the bare type name", () => {
    expect(getClassFqn({ name: "Widget", namespace: "" }, JAVA_NAMES)).toBe(
      "Widget",
    );
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

const MANUAL_OPTIONS = { namespace: "com.azure.ai.agents" };

function manualTargets(
  value: string,
  shape: "revapi" | "tsp-ast-input" | "list",
  options: ExtensionEmitterOptions = MANUAL_OPTIONS,
) {
  const parsed = parseManualEntries(value);
  expect(parsed.invalidEntries).toEqual([]);
  return resolveManualEntries(parsed.entries, options, shape);
}

describe("resolveManualEntries", () => {
  it.each(["revapi", "tsp-ast-input"] as const)(
    "qualifies short names using the public models package for %s",
    (shape) => {
      expect(
        manualTargets("FooBar,FooBar::snake_case", shape, {
          namespace: " com.example ",
          "models-subpackage": "custom",
          "internal-subpackage": "hidden",
        }),
      ).toEqual([
        { type: "class", className: "com.example.custom.FooBar" },
        {
          type: "field",
          className: "com.example.custom.FooBar",
          memberName: "snake_case",
        },
      ]);
    },
  );

  it("supports an empty Java models subpackage", () => {
    expect(
      manualTargets("FooBar", "tsp-ast-input", {
        ...MANUAL_OPTIONS,
        "models-subpackage": "",
      }),
    ).toEqual([{ type: "class", className: "com.azure.ai.agents.FooBar" }]);
  });

  it("does not add a subpackage for list output", () => {
    expect(
      manualTargets("FooBar::baz", "list", {
        namespace: "Example.Models",
        "models-subpackage": "ignored",
      }),
    ).toEqual([
      { type: "field", className: "Example.Models.FooBar", memberName: "baz" },
    ]);
  });

  it.each(["revapi", "tsp-ast-input", "list"] as const)(
    "preserves explicit FQNs regardless of namespace/subpackage options for %s",
    (shape) => {
      const input =
        "com.example.implementation.models.FooBar,com.example.FooBar::baz";
      const expected = parseManualEntries(input).entries;
      expect(manualTargets(input, shape, {})).toEqual(expected);
      expect(
        manualTargets(input, shape, {
          namespace: "ignored",
          "models-subpackage": "ignored",
          "internal-subpackage": "ignored",
        }),
      ).toEqual(expected);
    },
  );

  it("fails explicitly if a caller tries to resolve short names without a namespace", () => {
    expect(() => manualTargets("FooBar", "list", {})).toThrow(
      /without an explicit namespace/,
    );
  });
});

describe("toRevapiEntries", () => {
  it("deduplicates manual targets against discovered targets without losing previews", () => {
    const entries = toRevapiEntries(
      COLLECTED,
      { ...MANUAL_OPTIONS, justification: "Beta." },
      manualTargets(
        "AgentDefinition,com.azure.ai.agents.models.AgentDefinition,Tool::blobUrl,Tool,AgentDefinition::betaProp",
        "revapi",
      ),
    );
    expect(entries).toHaveLength(4);
    expect(entries.filter((e) => e.old.includes("AgentDefinition("))).toEqual([
      {
        ignore: true,
        regex: true,
        code: "java\\..*",
        old: ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.AgentDefinition(?![\\w$]).*",
        justification: "Beta. Hosted=V1",
      },
    ]);
    expect(entries.find((e) => e.old.includes("BlobUrl"))?.justification).toBe(
      "Beta. Eval=V1",
    );
    expect(entries.find((e) => e.old.includes("BetaProp"))?.justification).toBe(
      "Beta.",
    );
    expect(entries.map((e) => e.old)).toEqual(
      entries.map((e) => e.old).sort((a, b) => a.localeCompare(b)),
    );
  });

  it("escapes manual names and uses the existing accessor convention", () => {
    const entries = toRevapiEntries(
      { types: [], properties: [] },
      MANUAL_OPTIONS,
      manualTargets("Foo$Bar,Foo$Bar::snake_case", "revapi"),
    );
    expect(entries).toHaveLength(2);
    const classPattern = entries.find((e) => !e.old.includes("::"))!.old;
    const fieldPattern = entries.find((e) => e.old.includes("::"))!.old;
    expect(
      new RegExp(classPattern).test("com.azure.ai.agents.models.Foo$Bar"),
    ).toBe(true);
    expect(
      new RegExp(classPattern).test("com.azure.ai.agents.models.Foo$BarExtra"),
    ).toBe(false);
    expect(
      new RegExp(fieldPattern).test(
        "com.azure.ai.agents.models.Foo$Bar::getSnakeCase",
      ),
    ).toBe(true);
    expect(
      new RegExp(fieldPattern).test(
        "com.azure.ai.agents.models.Foo$Bar::getSnakeCaseExtra",
      ),
    ).toBe(false);
  });

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
  it("merges manual targets while retaining previews and explicitly requested fields", () => {
    const entries = toTspAstInputEntries(
      COLLECTED,
      { ...MANUAL_OPTIONS, justification: "Beta." },
      manualTargets(
        "AgentDefinition,com.azure.ai.agents.models.AgentDefinition,Tool::blobUrl,Tool,AgentDefinition::betaProp",
        "tsp-ast-input",
      ),
    );
    expect(entries).toEqual([
      {
        type: "class",
        class_name: "com.azure.ai.agents.models.AgentDefinition",
        annotation_description: "Beta. Hosted=V1",
      },
      {
        type: "field",
        class_name: "com.azure.ai.agents.models.AgentDefinition",
        annotation_description: "Beta.",
        member_name: "betaProp",
      },
      {
        type: "class",
        class_name: "com.azure.ai.agents.models.Tool",
        annotation_description: "Beta.",
      },
      {
        type: "field",
        class_name: "com.azure.ai.agents.models.Tool",
        annotation_description: "Beta. Eval=V1",
        member_name: "blobUrl",
      },
    ]);
  });

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

describe("toListShape", () => {
  it("sorts and deduplicates manual additions without suppressing requested fields", () => {
    expect(
      toListShape(
        COLLECTED,
        MANUAL_OPTIONS,
        manualTargets(
          "Zeta,AgentDefinition,com.azure.ai.agents.AgentDefinition,Tool::blobUrl,Alpha,AgentDefinition::betaProp,AgentDefinition::betaProp",
          "list",
        ),
      ),
    ).toEqual({
      class: [
        "com.azure.ai.agents.AgentDefinition",
        "com.azure.ai.agents.Alpha",
        "com.azure.ai.agents.Zeta",
      ],
      field: [
        "com.azure.ai.agents.AgentDefinition::betaProp",
        "com.azure.ai.agents.Tool::blobUrl",
      ],
    });
  });

  it("collapses beta types into `class` and beta props into `field`, without a subpackage", () => {
    const result = toListShape(COLLECTED, {});
    // FQNs carry no models/internal subpackage; Tool::blobUrl is a beta
    // property on the non-beta Tool, so it lands under `field`.
    expect(result).toEqual({
      class: ["com.azure.ai.agents.AgentDefinition"],
      field: ["com.azure.ai.agents.Tool::blobUrl"],
    });
  });

  it("sorts and de-duplicates each list", () => {
    const collected: CollectedBeta = {
      types: [
        { ...COLLECTED.types[0], name: "Zeta" },
        { ...COLLECTED.types[0], name: "Alpha" },
        { ...COLLECTED.types[0], name: "Alpha" },
      ],
      properties: [
        { ...COLLECTED.properties[0], propertyName: "second" },
        { ...COLLECTED.properties[0], propertyName: "first" },
        { ...COLLECTED.properties[0], propertyName: "first" },
      ],
    };
    const result = toListShape(collected, {});
    expect(result).toEqual({
      class: ["com.azure.ai.agents.Alpha", "com.azure.ai.agents.Zeta"],
      field: [
        "com.azure.ai.agents.Tool::first",
        "com.azure.ai.agents.Tool::second",
      ],
    });
  });

  it("applies the namespace override to both lists", () => {
    const result = toListShape(COLLECTED, { namespace: "Contoso.Ai" });
    expect(result).toEqual({
      class: ["Contoso.Ai.AgentDefinition"],
      field: ["Contoso.Ai.Tool::blobUrl"],
    });
  });
});
