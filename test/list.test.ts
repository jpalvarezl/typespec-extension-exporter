import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { emitJsonTcgc, emitOutputs, TcgcTester } from "./test-host.js";

interface ListShape {
  class: string[];
  field: string[];
}

/**
 * The `list` shape collapses the `class`/`field` entries (as seen in the csv /
 * tsp-ast-input shapes) into two sorted, de-duplicated lists. It is
 * language-neutral: the `language` option picks the TCGC scope (Java by
 * default, or C#) and `namespace` / `@clientNamespace` supplies the base
 * package.
 *
 * The sample carries `@clientNamespace("Azure.AI.Agents")` so the csharp scope
 * resolves the .NET namespace natively, and contains:
 *  - a beta model (`AgentDefinition`) with a beta property (covered by its own
 *    `class` entry, so the property is not repeated under `field`),
 *  - a beta enum (`AgentKind`),
 *  - a non-beta model (`Tool`) with a beta property (`blobUrl`), which becomes
 *    a `field` entry.
 */
const SAMPLE = `
  @service(#{ title: "Agents" })
  @clientNamespace("Azure.AI.Agents")
  namespace Agents;

  @extension("x-ms-foundry-meta", #{ required_previews: #["HostedAgents=V1Preview"] })
  model AgentDefinition {
    name: string;

    @extension("x-ms-foundry-meta", #{ required_previews: #["Tools=V1Preview"] })
    betaProp?: string;
  }

  @extension("x-ms-foundry-meta", #{ required_previews: #["AgentKinds=V1Preview"] })
  enum AgentKind {
    standard,
    hosted,
  }

  model Tool {
    name: string;

    @extension("x-ms-foundry-meta", #{ required_previews: #["Eval=V1Preview"] })
    blobUrl?: string;
  }

  @route("/get")
  op get(): { agent: AgentDefinition; tool: Tool; kind: AgentKind };
`;

const CSHARP_OPTIONS = {
  keys: "x-ms-foundry-meta",
  language: "csharp",
  "output-shape": "list",
};

describe("list output shape", () => {
  it("collapses beta types into `class` and beta props into `field`, by FQN", async () => {
    const result = await emitJsonTcgc<ListShape>(
      TcgcTester,
      SAMPLE,
      CSHARP_OPTIONS,
    );

    // Namespace from @clientNamespace via the csharp scope; no subpackage. Both
    // lists sorted; the beta property on the non-beta Tool is a `field`.
    expect(result).toEqual({
      class: ["Azure.AI.Agents.AgentDefinition", "Azure.AI.Agents.AgentKind"],
      field: ["Azure.AI.Agents.Tool::blobUrl"],
    });
  });

  it("does not repeat a beta container's own property as a field", async () => {
    const result = await emitJsonTcgc<ListShape>(
      TcgcTester,
      SAMPLE,
      CSHARP_OPTIONS,
    );

    // Tool is not beta, so there is no Tool entry under `class`...
    expect(result.class.some((c) => c.includes("Tool"))).toBe(false);
    // ...but its beta property is a `field`.
    expect(result.field).toContain("Azure.AI.Agents.Tool::blobUrl");
    // AgentDefinition is beta, so its own beta property is covered by the
    // `class` entry and not repeated under `field`.
    expect(result.field.some((f) => f.includes("betaProp"))).toBe(false);
  });

  it("applies the `namespace` override to both lists", async () => {
    const result = await emitJsonTcgc<ListShape>(TcgcTester, SAMPLE, {
      ...CSHARP_OPTIONS,
      namespace: "Contoso.Ai",
    });

    expect(result).toEqual({
      class: ["Contoso.Ai.AgentDefinition", "Contoso.Ai.AgentKind"],
      field: ["Contoso.Ai.Tool::blobUrl"],
    });
  });

  it("defaults the file name to list.json", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, CSHARP_OPTIONS);
    expect(Object.keys(outputs)).toEqual(["list.json"]);
  });

  it("serializes to YAML as the exact two-list object", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, {
      ...CSHARP_OPTIONS,
      "output-format": "yaml",
    });
    expect(Object.keys(outputs)).toEqual(["list.yaml"]);
    expect(parseYaml(outputs["list.yaml"])).toEqual({
      class: ["Azure.AI.Agents.AgentDefinition", "Azure.AI.Agents.AgentKind"],
      field: ["Azure.AI.Agents.Tool::blobUrl"],
    });
  });

  it("serializes to CSV as the flattened type;name view of the two lists", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, {
      ...CSHARP_OPTIONS,
      "output-format": "csv",
    });
    expect(outputs["list.csv"].trimEnd().split("\n")).toEqual([
      "type;name",
      "class;Azure.AI.Agents.AgentDefinition",
      "class;Azure.AI.Agents.AgentKind",
      "field;Azure.AI.Agents.Tool::blobUrl",
    ]);
  });

  it("works under the default Java scope with a namespace override", async () => {
    const result = await emitJsonTcgc<ListShape>(TcgcTester, SAMPLE, {
      keys: "x-ms-foundry-meta",
      "output-shape": "list",
      // No `language` -> default Java scope. `namespace` supplies the base
      // package. Deliberately no `.models` subpackage: FQN is namespace + name.
      namespace: "com.azure.ai.agents",
    });

    expect(result).toEqual({
      class: [
        "com.azure.ai.agents.AgentDefinition",
        "com.azure.ai.agents.AgentKind",
      ],
      field: ["com.azure.ai.agents.Tool::blobUrl"],
    });
  });
});
