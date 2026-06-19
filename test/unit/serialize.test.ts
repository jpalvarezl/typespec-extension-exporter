import { describe, expect, it } from "vitest";
import {
  getDefaultOutputFile,
  serializeCsv,
  serializePayload,
  stringifyCsvValue,
} from "../../dist/src/serialize.js";

describe("getDefaultOutputFile", () => {
  it("names raw output extensions.<ext>", () => {
    expect(getDefaultOutputFile("raw", "json")).toBe("extensions.json");
    expect(getDefaultOutputFile("raw", "csv")).toBe("extensions.csv");
    expect(getDefaultOutputFile("raw", "yaml")).toBe("extensions.yaml");
  });

  it("names revapi and tsp-ast-input output after the shape", () => {
    expect(getDefaultOutputFile("revapi", "json")).toBe("revapi.json");
    expect(getDefaultOutputFile("tsp-ast-input", "yaml")).toBe(
      "tsp-ast-input.yaml",
    );
  });

  it("names list output list.<ext>", () => {
    expect(getDefaultOutputFile("list", "json")).toBe("list.json");
    expect(getDefaultOutputFile("list", "yaml")).toBe("list.yaml");
    expect(getDefaultOutputFile("list", "csv")).toBe("list.csv");
  });
});

describe("stringifyCsvValue", () => {
  it("renders null/undefined as empty", () => {
    expect(stringifyCsvValue(null)).toBe("");
    expect(stringifyCsvValue(undefined)).toBe("");
  });

  it("passes through plain scalars unquoted", () => {
    expect(stringifyCsvValue("abc")).toBe("abc");
    expect(stringifyCsvValue(42)).toBe("42");
  });

  it("quotes and escapes values containing the delimiter or quotes", () => {
    expect(stringifyCsvValue("a;b")).toBe('"a;b"');
    expect(stringifyCsvValue('a"b')).toBe('"a""b"');
  });

  it("JSON-encodes object values", () => {
    expect(stringifyCsvValue({ team: "core" })).toBe('"{""team"":""core""}"');
  });
});

describe("serializeCsv", () => {
  it("emits the header row followed by data rows for the raw shape", () => {
    const csv = serializeCsv(
      [
        {
          key: "x-a",
          value: "v",
          targetKind: "Model",
          targetName: "S.M",
          namespace: "S",
          file: "/main.tsp",
          line: 1,
          column: 2,
        },
      ],
      "raw",
    );
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "key;value;targetKind;targetName;namespace;file;line;column",
    );
    expect(lines[1]).toBe("x-a;v;Model;S.M;S;/main.tsp;1;2");
  });

  it("emits type;name rows (classes then fields) for the list shape", () => {
    const csv = serializeCsv(
      {
        class: ["Azure.AI.Agents.AgentDefinition"],
        field: ["Azure.AI.Agents.Tool::blobUrl"],
      },
      "list",
    );
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("type;name");
    expect(lines[1]).toBe("class;Azure.AI.Agents.AgentDefinition");
    expect(lines[2]).toBe("field;Azure.AI.Agents.Tool::blobUrl");
  });

  it("emits only the header for malformed list payloads", () => {
    expect(serializeCsv([], "list")).toBe("type;name\n");
    expect(serializeCsv({ class: ["A"], field: [5] }, "list")).toBe(
      "type;name\n",
    );
  });
});

describe("serializePayload", () => {
  it("pretty-prints JSON", () => {
    expect(serializePayload([{ a: 1 }], "raw", "json")).toBe(
      '[\n  {\n    "a": 1\n  }\n]',
    );
  });

  it("produces YAML", () => {
    expect(serializePayload([{ a: 1 }], "raw", "yaml")).toContain("- a: 1");
  });
});
