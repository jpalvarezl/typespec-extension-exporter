import { resolveCompilerOptions } from "@typespec/compiler";
import {
  expectDiagnosticEmpty,
  resolveVirtualPath,
} from "@typespec/compiler/testing";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { EMITTER, emitJsonTcgc, emitOutputs, TcgcTester } from "./test-host.js";
import type {
  ListShape,
  RevapiEntry,
  TspAstInputEntry,
} from "../dist/src/types.js";

const ANONYMOUS_MODEL = `
  @service
  namespace Example;

  model Foo {
    bar: {
      baz: string;
    };
  }

  @route("/foo")
  @get
  op getFoo(): Foo;
`;

describe("manual entries from tspconfig.yaml", () => {
  it.each(["FooBar", "FooBar,FooBar::baz"])(
    "emits beta-annotations.csv for %s with an anonymous TypeSpec model",
    async (manualEntries) => {
      const tester = await TcgcTester.files({
        "main.tsp": ANONYMOUS_MODEL,
        "tspconfig.yaml": `
emit:
  - typespec-extension-exporter
options:
  typespec-extension-exporter:
    language: java
    namespace: com.example
    output-shape: tsp-ast-input
    output-format: csv
    output-file: beta-annotations.csv
    manual-entries: "${manualEntries}"
`,
      }).createInstance();
      const [compilerOptions, diagnostics] = await resolveCompilerOptions(
        tester.fs.compilerHost,
        {
          cwd: resolveVirtualPath("."),
          entrypoint: resolveVirtualPath("main.tsp"),
        },
      );
      expectDiagnosticEmpty(diagnostics);
      expect(compilerOptions.emit).toEqual([EMITTER]);
      const { program } = await tester.compile(ANONYMOUS_MODEL, {
        compilerOptions,
      });
      const output = await program.host.readFile(
        resolveVirtualPath("tsp-output", EMITTER, "beta-annotations.csv"),
      );
      expect(output.text).toBe(
        "type;class_name;annotation_description;member_name\n" +
          "class;com.example.models.FooBar;Preview API.;\n" +
          (manualEntries.includes("::")
            ? "field;com.example.models.FooBar;Preview API.;baz\n"
            : ""),
      );
    },
  );
});

describe("manual entries across SDK outputs", () => {
  for (const shape of ["revapi", "tsp-ast-input", "list"] as const) {
    it.each(["json", "yaml", "csv"] as const)(
      `emits manual-only class and field entries as ${shape}/%s`,
      async (format) => {
        const outputs = await emitOutputs(TcgcTester, ANONYMOUS_MODEL, {
          language: shape === "list" ? "csharp" : "java",
          namespace: "com.example",
          keys: "x-not-present",
          kinds: "enum",
          "output-shape": shape,
          "output-format": format,
          "manual-entries": "FooBar,FooBar::baz,FooBar",
          justification: "Manual beta.",
        });
        expect(Object.keys(outputs)).toEqual([`${shape}.${format}`]);
        const text = outputs[`${shape}.${format}`];
        const fqn =
          shape === "list" ? "com.example.FooBar" : "com.example.models.FooBar";
        const escapedFqn = "com\\.example\\.models\\.FooBar";
        const expected =
          shape === "list"
            ? { class: [fqn], field: [`${fqn}::baz`] }
            : shape === "tsp-ast-input"
              ? [
                  {
                    type: "class",
                    class_name: fqn,
                    annotation_description: "Manual beta.",
                  },
                  {
                    type: "field",
                    class_name: fqn,
                    annotation_description: "Manual beta.",
                    member_name: "baz",
                  },
                ]
              : [
                  {
                    ignore: true,
                    regex: true,
                    code: "java\\..*",
                    old: `.*\\b${escapedFqn}::(get|set|is|with)?Baz(?![\\w$]).*`,
                    justification: "Manual beta.",
                  },
                  {
                    ignore: true,
                    regex: true,
                    code: "java\\..*",
                    old: `.*\\b${escapedFqn}(?![\\w$]).*`,
                    justification: "Manual beta.",
                  },
                ];
        if (format !== "csv") {
          expect(
            format === "json" ? JSON.parse(text) : parseYaml(text),
          ).toEqual(expected);
        } else if (shape === "list") {
          expect(text).toBe(`type;name\nclass;${fqn}\nfield;${fqn}::baz\n`);
        } else if (shape === "tsp-ast-input") {
          expect(text).toBe(
            "type;class_name;annotation_description;member_name\n" +
              `class;${fqn};Manual beta.;\nfield;${fqn};Manual beta.;baz\n`,
          );
        } else {
          expect(text).toBe(
            "ignore;regex;code;old;justification\n" +
              `true;true;java\\..*;.*\\b${escapedFqn}::(get|set|is|with)?Baz(?![\\w$]).*;Manual beta.\n` +
              `true;true;java\\..*;.*\\b${escapedFqn}(?![\\w$]).*;Manual beta.\n`,
          );
        }
      },
    );
  }

  it.each(["revapi", "tsp-ast-input", "list"] as const)(
    "accepts exact FQNs without a namespace option for %s",
    async (shape) => {
      const fqn = "com.other.implementation.models.FooBar";
      const output = await emitJsonTcgc<
        ListShape | RevapiEntry[] | TspAstInputEntry[]
      >(TcgcTester, ANONYMOUS_MODEL, {
        language: "java",
        "output-shape": shape,
        "manual-entries": `${fqn},${fqn}::baz`,
      });
      if (shape === "list") {
        expect(output).toEqual({ class: [fqn], field: [`${fqn}::baz`] });
      } else if (shape === "tsp-ast-input") {
        expect(output).toEqual([
          {
            type: "class",
            class_name: fqn,
            annotation_description: "Preview API.",
          },
          {
            type: "field",
            class_name: fqn,
            annotation_description: "Preview API.",
            member_name: "baz",
          },
        ]);
      } else {
        expect(output).toEqual([
          {
            ignore: true,
            regex: true,
            code: "java\\..*",
            old: ".*\\bcom\\.other\\.implementation\\.models\\.FooBar::(get|set|is|with)?Baz(?![\\w$]).*",
            justification: "Preview API.",
          },
          {
            ignore: true,
            regex: true,
            code: "java\\..*",
            old: ".*\\bcom\\.other\\.implementation\\.models\\.FooBar(?![\\w$]).*",
            justification: "Preview API.",
          },
        ]);
      }
    },
  );

  it("keeps explicitly requested fields on discovered beta classes without renaming them", async () => {
    const output = await emitJsonTcgc<TspAstInputEntry[]>(
      TcgcTester,
      `
        @service namespace Example;
        @extension("x-beta", #{ required_previews: #["Feature=V1"] })
        model Foo {
          @extension("x-beta", true)
          @clientName("renamedField", "java")
          baz: string;
        }
        @route("/foo") @get op getFoo(): Foo;
      `,
      {
        language: "java",
        namespace: "com.example",
        "output-shape": "tsp-ast-input",
        "manual-entries": "Foo,Foo::baz",
      },
    );
    expect(output).toEqual([
      {
        type: "class",
        class_name: "com.example.models.Foo",
        annotation_description: "Preview API. Feature=V1",
      },
      {
        type: "field",
        class_name: "com.example.models.Foo",
        annotation_description: "Preview API.",
        member_name: "baz",
      },
    ]);
  });
});
