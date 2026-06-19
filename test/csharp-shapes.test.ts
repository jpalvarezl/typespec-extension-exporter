import { describe, expect, it } from "vitest";
import { emitJsonTcgc, emitOutputs, TcgcTester } from "./test-host.js";

interface BetaClasses {
  beta_classes: string[];
  beta_class_properties: string[];
}

/**
 * A spec that mirrors the Foundry C# entry point shape: the service namespace
 * carries `@clientNamespace("Azure.AI.Agents")`, so TCGC's csharp scope resolves
 * the .NET namespace natively (no `namespace` override required).
 *
 * It contains:
 *  - a beta model (`AgentDefinition`) carrying a beta property,
 *  - a beta enum (`AgentKind`),
 *  - a non-beta model (`Tool`) carrying a beta property.
 *
 * The `beta-classes` shape lists the type-level beta entities
 * (`AgentDefinition`, `AgentKind`) under `beta_classes`, and beta properties on
 * non-beta containers (`Tool::blobUrl`) under `beta_class_properties`. The beta
 * property on the (already beta) `AgentDefinition` is covered by its class
 * entry, so it does not appear in `beta_class_properties`.
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
  "output-shape": "beta-classes",
};

describe("beta-classes output shape (C#)", () => {
  it("lists beta classes and beta properties by their .NET FQN, resolved from @clientNamespace", async () => {
    const result = await emitJsonTcgc<BetaClasses>(
      TcgcTester,
      SAMPLE,
      CSHARP_OPTIONS,
    );

    // Namespace comes from @clientNamespace via the csharp TCGC scope, with no
    // models/internal subpackage. Sorted; types under beta_classes, the beta
    // property on the non-beta Tool under beta_class_properties.
    expect(result).toEqual({
      beta_classes: [
        "Azure.AI.Agents.AgentDefinition",
        "Azure.AI.Agents.AgentKind",
      ],
      beta_class_properties: ["Azure.AI.Agents.Tool::blobUrl"],
    });
  });

  it("never promotes a beta property to a class entry, nor lists a beta container's own property", async () => {
    const result = await emitJsonTcgc<BetaClasses>(
      TcgcTester,
      SAMPLE,
      CSHARP_OPTIONS,
    );

    // Tool is not beta, so it never appears as a class...
    expect(result.beta_classes.some((c) => c.includes("Tool"))).toBe(false);
    // ...but its beta property is captured as a property reference.
    expect(result.beta_class_properties).toContain(
      "Azure.AI.Agents.Tool::blobUrl",
    );
    // AgentDefinition's own beta property is covered by its class entry, so it
    // is not duplicated as a property reference.
    expect(
      result.beta_class_properties.some((p) => p.includes("betaProp")),
    ).toBe(false);
  });

  it("lets the `namespace` override supersede the resolved namespace for both lists", async () => {
    const result = await emitJsonTcgc<BetaClasses>(TcgcTester, SAMPLE, {
      ...CSHARP_OPTIONS,
      namespace: "Contoso.Ai",
    });

    expect(result).toEqual({
      beta_classes: ["Contoso.Ai.AgentDefinition", "Contoso.Ai.AgentKind"],
      beta_class_properties: ["Contoso.Ai.Tool::blobUrl"],
    });
  });

  it("defaults the file name to beta-classes.json", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, CSHARP_OPTIONS);
    expect(Object.keys(outputs)).toEqual(["beta-classes.json"]);
  });

  it("serializes to YAML when requested", async () => {
    const outputs = await emitOutputs(TcgcTester, SAMPLE, {
      ...CSHARP_OPTIONS,
      "output-format": "yaml",
    });
    expect(Object.keys(outputs)).toEqual(["beta-classes.yaml"]);
    const yaml = outputs["beta-classes.yaml"];
    expect(yaml).toContain("beta_classes:");
    expect(yaml).toContain("  - Azure.AI.Agents.AgentDefinition");
    expect(yaml).toContain("beta_class_properties:");
    expect(yaml).toContain("  - Azure.AI.Agents.Tool::blobUrl");
  });
});

describe("beta-classes output shape (language-neutral)", () => {
  it("works under the default Java scope with a namespace override", async () => {
    const result = await emitJsonTcgc<BetaClasses>(TcgcTester, SAMPLE, {
      keys: "x-ms-foundry-meta",
      "output-shape": "beta-classes",
      // No `language` -> default Java scope. `namespace` supplies the base
      // package.
      namespace: "com.azure.ai.agents",
    });

    // Deliberately no `.models` subpackage: the FQN is namespace + name.
    expect(result).toEqual({
      beta_classes: [
        "com.azure.ai.agents.AgentDefinition",
        "com.azure.ai.agents.AgentKind",
      ],
      beta_class_properties: ["com.azure.ai.agents.Tool::blobUrl"],
    });
  });
});
