import { describe, expect, it } from "vitest";
import {
  normalizeKind,
  parseKeyFilter,
  parseKindFilter,
} from "../../dist/src/options.js";

describe("parseKindFilter", () => {
  it("returns undefined for unset or empty input", () => {
    expect(parseKindFilter(undefined)).toBeUndefined();
    expect(parseKindFilter("")).toBeUndefined();
    expect(parseKindFilter(" , ,")).toBeUndefined();
  });

  it("lowercases, trims, and splits on commas", () => {
    expect(parseKindFilter("Model, ENUM ")).toEqual(
      new Set(["model", "enum"]),
    );
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
