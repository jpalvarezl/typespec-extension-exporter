import { describe, expect, it } from "vitest";
import { emitJsonTcgc, emitOutputs, TcgcTester } from "./test-host.js";

interface RevapiEntry {
  ignore: boolean;
  regex: boolean;
  code: string;
  old: string;
  justification: string;
}

interface TspAstInputEntry {
  type: "class" | "field";
  class_name: string;
  annotation_description: string;
  member_name?: string;
}

/**
 * A spec with:
 *  - a beta model (`AgentDefinition`) carrying a beta property,
 *  - a non-beta model (`Tool`) carrying a beta property.
 *
 * The beta property on the beta model must be omitted as redundant; the beta
 * property on the non-beta model must surface as its own entry.
 */
const SAMPLE = `
  @service(#{ title: "Agents" })
  namespace Agents;

  @extension("x-ms-foundry-meta", #{ required_previews: #["HostedAgents=V1Preview"] })
  model AgentDefinition {
    name: string;

    @extension("x-ms-foundry-meta", #{ required_previews: #["Tools=V1Preview"] })
    betaProp?: string;
  }

  model Tool {
    name: string;

    @extension("x-ms-foundry-meta", #{ required_previews: #["Eval=V1Preview"] })
    blobUrl?: string;
  }

  @route("/get")
  op get(): { agent: AgentDefinition; tool: Tool };
`;

const JAVA_OPTIONS = { keys: "x-ms-foundry-meta", "java-namespace": "com.azure.ai.agents" };

describe("revapi output shape", () => {
  it("maps beta entities to revapi ignore entries named by their Java FQN", async () => {
    const entries = await emitJsonTcgc<RevapiEntry[]>(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "revapi",
    });

    const byOld = (needle: string) => {
      const match = entries.filter((e) => e.old.includes(needle));
      expect(match, `expected one entry containing "${needle}"`).toHaveLength(1);
      return match[0];
    };

    // Beta model -> class-level ignore matching its FQN.
    expect(byOld("AgentDefinition")).toEqual({
      ignore: true,
      regex: true,
      code: "java\\..*",
      old: ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.AgentDefinition(?![\\w$]).*",
      justification: "Preview API. HostedAgents=V1Preview",
    });

    // Beta property on a non-beta model -> accessor-level ignore.
    expect(byOld("Tool::")).toEqual({
      ignore: true,
      regex: true,
      code: "java\\..*",
      old: ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.Tool::(get|set|is|with)?BlobUrl(?![\\w$]).*",
      justification: "Preview API. Eval=V1Preview",
    });
  });

  it("omits beta properties of a beta model as redundant", async () => {
    const entries = await emitJsonTcgc<RevapiEntry[]>(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "revapi",
    });

    expect(entries.some((e) => e.old.includes("betaProp"))).toBe(false);
    expect(entries.some((e) => e.old.includes("BetaProp"))).toBe(false);
    expect(entries).toHaveLength(2);
  });

  it("uses the configured justification as the base text", async () => {
    const entries = await emitJsonTcgc<RevapiEntry[]>(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "revapi",
      justification: "Beta feature.",
    });

    expect(entries.every((e) => e.justification.startsWith("Beta feature."))).toBe(
      true,
    );
  });

  it("defaults the file name to revapi.json", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "revapi",
    });
    expect(Object.keys(outputs)).toEqual(["revapi.json"]);
  });
});

describe("tsp-ast-input output shape", () => {
  it("maps type-level beta entities to class entries", async () => {
    const entries = await emitJsonTcgc<TspAstInputEntry[]>(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "tsp-ast-input",
    });

    expect(entries).toContainEqual({
      type: "class",
      class_name: "com.azure.ai.agents.models.AgentDefinition",
      annotation_description: "Preview API. HostedAgents=V1Preview",
    });
  });

  it("maps beta properties on non-beta models to field entries", async () => {
    const entries = await emitJsonTcgc<TspAstInputEntry[]>(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "tsp-ast-input",
    });

    expect(entries).toContainEqual({
      type: "field",
      class_name: "com.azure.ai.agents.models.Tool",
      annotation_description: "Preview API. Eval=V1Preview",
      member_name: "blobUrl",
    });
  });

  it("defaults the file name to tsp-ast-input.json", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, {
      ...JAVA_OPTIONS,
      "output-shape": "tsp-ast-input",
    });
    expect(Object.keys(outputs)).toEqual(["tsp-ast-input.json"]);
  });
});
