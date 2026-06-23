import {
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@typespec/compiler/testing";
import { describe, expect, it } from "vitest";
import { EMITTER, Tester } from "./test-host.js";

const SAMPLE = `
  @service(#{ title: "S" })
  namespace S;

  @extension("x-a", "v")
  model M {
    name: string;
  }
`;

async function diagnose(options: Record<string, unknown>) {
  const [, diagnostics] = await Tester.emit(
    EMITTER,
    options,
  ).compileAndDiagnose(SAMPLE);
  return diagnostics;
}

async function diagnoseWithOutputs(options: Record<string, unknown>) {
  return Tester.emit(EMITTER, options).compileAndDiagnose(SAMPLE);
}

describe("option diagnostics", () => {
  it("warns once per unknown kind", async () => {
    const diagnostics = await diagnose({ kinds: "model,bogus" });

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-extension-exporter/unknown-kind",
        severity: "warning",
        message: /Unknown kind 'bogus'/,
      },
    ]);
  });

  it("does not warn for valid kinds or the `field` alias", async () => {
    const diagnostics = await diagnose({ kinds: "model, field , ENUM" });
    expectDiagnosticEmpty(diagnostics);
  });

  it("warns when a key filter value does not start with x-", async () => {
    const diagnostics = await diagnose({ keys: "x-a,ms-foundry-meta" });

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-extension-exporter/non-extension-key",
        severity: "warning",
        message: /Key 'ms-foundry-meta' .* does not start with 'x-'/,
      },
    ]);
  });

  it("does not warn for well-formed x- keys", async () => {
    const diagnostics = await diagnose({ keys: "x-a,x-b" });
    expectDiagnosticEmpty(diagnostics);
  });

  it("warns for each invalid value independently", async () => {
    const diagnostics = await diagnose({ kinds: "foo,bar" });
    expect(
      diagnostics.filter(
        (d) => d.code === "typespec-extension-exporter/unknown-kind",
      ),
    ).toHaveLength(2);
  });

  it("errors and emits no output when a non-Java language is supplied for Java-specific shapes", async () => {
    const [result, diagnostics] = await diagnoseWithOutputs({
      keys: "x-a",
      language: "csharp",
      "output-shape": "revapi",
    });

    expectDiagnostics(diagnostics, [
      {
        code: "typespec-extension-exporter/non-java-language-for-java-shape",
        severity: "error",
        message: /language.*csharp.*not supported.*revapi.*Java-specific/,
      },
    ]);
    expect(result.outputs).toEqual({});
  });
});
