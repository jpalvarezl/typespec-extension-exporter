import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { emitOutputs, Tester } from "./test-host.js";

/** A minimal single-occurrence spec keeps serialized output easy to assert on. */
const SAMPLE = `
  @service(#{ title: "S" })
  namespace S;

  @extension("x-a", "v")
  model M {
    name: string;
  }
`;

describe("serialization formats", () => {
  it("defaults to a JSON file named extensions.json", async () => {
    const outputs = await emitOutputs(Tester, SAMPLE);

    expect(Object.keys(outputs)).toEqual(["extensions.json"]);
    const parsed = JSON.parse(outputs["extensions.json"]);
    expect(parsed).toMatchObject([
      { key: "x-a", value: "v", targetKind: "Model" },
    ]);
  });

  it("emits YAML to extensions.yaml when output-format is yaml", async () => {
    const outputs = await emitOutputs(Tester, SAMPLE, {
      "output-format": "yaml",
    });

    expect(Object.keys(outputs)).toEqual(["extensions.yaml"]);
    const parsed = parseYaml(outputs["extensions.yaml"]);
    expect(parsed).toMatchObject([
      { key: "x-a", value: "v", targetKind: "Model" },
    ]);
  });

  it("emits semicolon-delimited CSV to extensions.csv when output-format is csv", async () => {
    const outputs = await emitOutputs(Tester, SAMPLE, {
      "output-format": "csv",
    });

    expect(Object.keys(outputs)).toEqual(["extensions.csv"]);
    const lines = outputs["extensions.csv"].trimEnd().split("\n");
    expect(lines[0]).toBe(
      "key;value;targetKind;targetName;namespace;file;line;column",
    );
    expect(lines[1]).toMatch(/^x-a;v;Model;S\.M;S;/);
  });

  it("quotes CSV values that contain the delimiter", async () => {
    const outputs = await emitOutputs(
      Tester,
      `
        @service(#{ title: "S" })
        namespace S;

        @extension("x-a", "a;b")
        model M {
          name: string;
        }
      `,
      { "output-format": "csv" },
    );

    const lines = outputs["extensions.csv"].trimEnd().split("\n");
    expect(lines[1]).toMatch(/^x-a;"a;b";Model;/);
  });

  it("JSON-encodes and quotes object-valued CSV cells", async () => {
    const outputs = await emitOutputs(
      Tester,
      `
        @service(#{ title: "S" })
        namespace S;

        @extension("x-a", #{ team: "core" })
        model M {
          name: string;
        }
      `,
      { "output-format": "csv" },
    );

    const lines = outputs["extensions.csv"].trimEnd().split("\n");
    // Doubled quotes are CSV's escape for a literal quote inside a quoted cell.
    expect(lines[1]).toContain(`"{""team"":""core""}"`);
  });

  it("honors an explicit output-file name", async () => {
    const outputs = await emitOutputs(Tester, SAMPLE, {
      "output-file": "custom.json",
    });

    expect(Object.keys(outputs)).toEqual(["custom.json"]);
  });
});
