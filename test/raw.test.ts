import { describe, expect, it } from "vitest";
import { emitJson, Tester } from "./test-host.js";

/** Shape of a single entry in the `raw` output (mirrors `ExtensionOccurrence`). */
interface RawOccurrence {
  key: string;
  value: unknown;
  targetKind: string;
  targetName: string;
  namespace?: string;
  file: string;
  line: number;
  column: number;
}

/** A spec exercising every decorated kind the emitter visits. */
const SAMPLE = `
  @service(#{ title: "Sample" })
  namespace Sample;

  @extension("x-model-tag", "widget")
  model Widget {
    @extension("x-field-tag", "the-id")
    id: string;
    name: string;
  }

  @extension("x-op-tag", #{ team: "core" })
  op getWidget(): Widget;

  @extension("x-enum-tag", "colors")
  enum Color {
    red,
    green,
  }
`;

function byKey(occurrences: RawOccurrence[], key: string): RawOccurrence {
  const match = occurrences.filter((o) => o.key === key);
  expect(
    match,
    `expected exactly one occurrence for key "${key}"`,
  ).toHaveLength(1);
  return match[0];
}

describe("raw output shape", () => {
  it("collects every @extension occurrence with its target metadata", async () => {
    const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE);

    expect(occurrences.map((o) => o.key).sort()).toEqual([
      "x-enum-tag",
      "x-field-tag",
      "x-model-tag",
      "x-op-tag",
    ]);

    expect(byKey(occurrences, "x-model-tag")).toMatchObject({
      value: "widget",
      targetKind: "Model",
      targetName: "Sample.Widget",
      namespace: "Sample",
    });
    expect(byKey(occurrences, "x-field-tag")).toMatchObject({
      value: "the-id",
      targetKind: "ModelProperty",
      targetName: "Sample.Widget.id",
      namespace: "Sample",
    });
    expect(byKey(occurrences, "x-op-tag")).toMatchObject({
      value: { team: "core" },
      targetKind: "Operation",
      targetName: "Sample.getWidget",
      namespace: "Sample",
    });
    expect(byKey(occurrences, "x-enum-tag")).toMatchObject({
      value: "colors",
      targetKind: "Enum",
      targetName: "Sample.Color",
      namespace: "Sample",
    });
  });

  it("records a source location for each occurrence", async () => {
    const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE);

    for (const occurrence of occurrences) {
      expect(occurrence.file).toMatch(/main\.tsp$/);
      expect(occurrence.line).toBeGreaterThan(0);
      expect(occurrence.column).toBeGreaterThan(0);
      expect(Number.isInteger(occurrence.line)).toBe(true);
      expect(Number.isInteger(occurrence.column)).toBe(true);
    }
  });

  describe("kinds filter", () => {
    it("restricts output to a single kind", async () => {
      const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE, {
        kinds: "model",
      });
      expect(occurrences.map((o) => o.key)).toEqual(["x-model-tag"]);
    });

    it("treats the `field` alias as modelProperty", async () => {
      const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE, {
        kinds: "field",
      });
      expect(occurrences.map((o) => o.key)).toEqual(["x-field-tag"]);
    });

    it("is case-insensitive and accepts multiple kinds", async () => {
      const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE, {
        kinds: "Model,ENUM",
      });
      expect(occurrences.map((o) => o.key).sort()).toEqual([
        "x-enum-tag",
        "x-model-tag",
      ]);
    });
  });

  describe("keys filter", () => {
    it("restricts output to a single key", async () => {
      const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE, {
        keys: "x-op-tag",
      });
      expect(occurrences.map((o) => o.key)).toEqual(["x-op-tag"]);
    });

    it("accepts multiple comma-separated keys", async () => {
      const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE, {
        keys: "x-model-tag,x-enum-tag",
      });
      expect(occurrences.map((o) => o.key).sort()).toEqual([
        "x-enum-tag",
        "x-model-tag",
      ]);
    });

    it("is case-sensitive (no match yields an empty list)", async () => {
      const occurrences = await emitJson<RawOccurrence[]>(Tester, SAMPLE, {
        keys: "x-Model-Tag",
      });
      expect(occurrences).toEqual([]);
    });
  });
});
