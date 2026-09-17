import { describe, expect, it } from "vitest";
import {
  findNonExtensionKeys,
  findUnknownKinds,
  getJavaNameOptions,
  hasExplicitLanguage,
  normalizeKind,
  parseKeyFilter,
  parseKindFilter,
  parseManualEntries,
  resolveEmitterScope,
  resolvesToJavaScope,
} from "../../dist/src/options.js";

describe("parseManualEntries", () => {
  it.each([undefined, "", "   ", " , , "])(
    "treats %j as no additions",
    (value) => {
      expect(parseManualEntries(value)).toEqual({
        entries: [],
        invalidEntries: [],
      });
    },
  );

  it("parses short and qualified class/field names, trimming separators", () => {
    expect(
      parseManualEntries(
        " FooBar, OtherModel :: baz , com.example.FooBar, com.example.OtherModel::snake_case,",
      ),
    ).toEqual({
      entries: [
        { type: "class", className: "FooBar" },
        { type: "field", className: "OtherModel", memberName: "baz" },
        { type: "class", className: "com.example.FooBar" },
        {
          type: "field",
          className: "com.example.OtherModel",
          memberName: "snake_case",
        },
      ],
      invalidEntries: [],
    });
  });

  it("accepts Unicode identifiers and Java dollar signs", () => {
    expect(parseManualEntries("Caf\u00e9$Inner::_value").entries).toEqual([
      { type: "field", className: "Caf\u00e9$Inner", memberName: "_value" },
    ]);
  });

  it.each([
    "::baz",
    "FooBar::",
    "FooBar::baz::extra",
    "FooBar:baz",
    ".FooBar",
    "com..FooBar",
    "com.FooBar.",
    "Foo Bar",
    "Foo*",
    "Foo<Bar>",
    "Foo::getBaz()",
    "Foo::baz.qux",
    "1Foo",
    "Foo::1baz",
  ])(
    "reports malformed reference %s without dropping valid entries",
    (entry) => {
      expect(parseManualEntries(`Valid, ${entry}`)).toEqual({
        entries: [{ type: "class", className: "Valid" }],
        invalidEntries: [entry],
      });
    },
  );
});

describe("parseKindFilter", () => {
  it("returns undefined for unset or empty input", () => {
    expect(parseKindFilter(undefined)).toBeUndefined();
    expect(parseKindFilter("")).toBeUndefined();
    expect(parseKindFilter(" , ,")).toBeUndefined();
  });

  it("lowercases, trims, and splits on commas", () => {
    expect(parseKindFilter("Model, ENUM ")).toEqual(new Set(["model", "enum"]));
  });

  it("maps the `field` alias to modelproperty", () => {
    expect(parseKindFilter("field")).toEqual(new Set(["modelproperty"]));
  });
});

describe("normalizeKind", () => {
  it("lowercases and trims", () => {
    expect(normalizeKind("  Operation ")).toBe("operation");
  });

  it("aliases field to modelproperty", () => {
    expect(normalizeKind("Field")).toBe("modelproperty");
  });
});

describe("parseKeyFilter", () => {
  it("returns undefined for unset or empty input", () => {
    expect(parseKeyFilter(undefined)).toBeUndefined();
    expect(parseKeyFilter("")).toBeUndefined();
    expect(parseKeyFilter(" , ")).toBeUndefined();
  });

  it("preserves case and trims surrounding whitespace", () => {
    expect(parseKeyFilter(" x-A , x-B ")).toEqual(new Set(["x-A", "x-B"]));
  });
});

describe("findUnknownKinds", () => {
  it("returns nothing for unset input", () => {
    expect(findUnknownKinds(undefined)).toEqual([]);
    expect(findUnknownKinds("")).toEqual([]);
  });

  it("accepts all canonical kinds and the `field` alias", () => {
    expect(
      findUnknownKinds(
        "model,modelProperty,field,operation,enum,enumMember,union,unionVariant,scalar,interface",
      ),
    ).toEqual([]);
  });

  it("returns the original spelling of each unrecognized value", () => {
    expect(findUnknownKinds("model, Bogus , typo")).toEqual(["Bogus", "typo"]);
  });
});

describe("findNonExtensionKeys", () => {
  it("returns nothing for unset input", () => {
    expect(findNonExtensionKeys(undefined)).toEqual([]);
  });

  it("flags only values that do not start with x-", () => {
    expect(findNonExtensionKeys("x-a, ms-meta , x-b")).toEqual(["ms-meta"]);
  });
});

describe("hasExplicitLanguage", () => {
  it("requires a non-blank value", () => {
    expect(hasExplicitLanguage(undefined)).toBe(false);
    expect(hasExplicitLanguage("")).toBe(false);
    expect(hasExplicitLanguage("   ")).toBe(false);
    expect(hasExplicitLanguage("java")).toBe(true);
  });
});

describe("resolveEmitterScope", () => {
  it("returns undefined when language is unset/empty/blank", () => {
    expect(resolveEmitterScope(undefined)).toBeUndefined();
    expect(resolveEmitterScope("")).toBeUndefined();
    expect(resolveEmitterScope("   ")).toBeUndefined();
  });

  it("maps known languages to emitter names, case-insensitively", () => {
    expect(resolveEmitterScope("java")).toBe("@azure-tools/typespec-java");
    expect(resolveEmitterScope(" CSharp ")).toBe(
      "@typespec/http-client-csharp",
    );
  });

  it("passes an unknown value through as a raw emitter name", () => {
    expect(resolveEmitterScope("@azure-tools/typespec-python")).toBe(
      "@azure-tools/typespec-python",
    );
  });
});

describe("resolvesToJavaScope", () => {
  it("accepts explicit java values", () => {
    expect(resolvesToJavaScope("java")).toBe(true);
    expect(resolvesToJavaScope("JAVA")).toBe(true);
    expect(resolvesToJavaScope("@azure-tools/typespec-java")).toBe(true);
  });

  it("rejects unset/blank/non-Java values", () => {
    expect(resolvesToJavaScope(undefined)).toBe(false);
    expect(resolvesToJavaScope(" ")).toBe(false);
    expect(resolvesToJavaScope("csharp")).toBe(false);
    expect(resolvesToJavaScope("@azure-tools/typespec-python")).toBe(false);
  });
});

describe("getJavaNameOptions namespace override", () => {
  it("uses `namespace` as the override", () => {
    expect(
      getJavaNameOptions({ namespace: "Azure.AI.Agents" }).namespaceOverride,
    ).toBe("Azure.AI.Agents");
  });

  it("leaves the override undefined when unset", () => {
    expect(getJavaNameOptions({}).namespaceOverride).toBeUndefined();
  });
});
