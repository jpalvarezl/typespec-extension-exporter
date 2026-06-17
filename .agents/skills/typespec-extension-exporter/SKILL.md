---
name: typespec-extension-exporter
description: "Build, configure, and run the typespec-extension-exporter TypeSpec emitter in this repo. USE WHEN: working on this emitter; generating a revapi differences ignore list from @extension-marked beta entities; generating tsp-ast-input annotation customization data; dumping raw @extension occurrences; serializing output as JSON/YAML/CSV; running it against the Azure AI Foundry spec (agents/projects); understanding the emitter config options (keys, kinds, output-shape, output-format, java-namespace, subpackages, justification); wiring the Foundry spec into the emitter. Explains every option value, the npm scripts, and the FOUNDRY_DIR emit flow."
---

# typespec-extension-exporter

A TypeSpec emitter (TypeSpec compiler v1.13) with three output shapes and JSON/YAML/CSV serialization:

- **`raw`** (default): every `@extension` decorator occurrence
  (from `@typespec/openapi`) with source locations.
- **`revapi`**: a [revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html)
  ignore list. Each `@extension`-marked beta entity becomes an `ignore` entry
  matching its **Java** fully-qualified name.
- **`tsp-ast-input`**: annotation-insertion requests for a
  downstream AST customization step. Each entry has `type` (`class` or
  `field`), `class_name`, `annotation_description`, and field entries also have
  `member_name` with the generated Java field/member name.

Java names/packages come from TCGC (`@azure-tools/typespec-client-generator-core`)
using the Java emitter scope, so `@clientName` renames and public/internal
`access` are honoured — the same model the `typespec-java` emitter is built on.

The primary use case is exporting beta (`x-ms-foundry-meta`) Foundry entities
for Azure Java SDK workflows, especially revapi suppressions and AST annotation
customization input.

## Project layout

| Path                                                        | Purpose                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| [src/index.ts](../../../src/index.ts)                       | `$onEmit` orchestrator (re-exports `$lib` + public output types)      |
| [src/lib.ts](../../../src/lib.ts)                           | `$lib` definition + options schema (`ExtensionEmitterOptions`)        |
| [src/options.ts](../../../src/options.ts)                   | Filter parsing, Java naming options, option-validation helpers        |
| [src/collect-raw.ts](../../../src/collect-raw.ts)           | Raw `@extension` occurrence collection via the type graph             |
| [src/collect-beta.ts](../../../src/collect-beta.ts)         | TCGC beta-entity collection (Java output modes)                       |
| [src/transform.ts](../../../src/transform.ts)               | revapi + tsp-ast-input transforms and Java FQN/text helpers           |
| [src/serialize.ts](../../../src/serialize.ts)               | JSON/YAML/CSV serialization                                           |
| [foundry/emit.mjs](../../../foundry/emit.mjs)               | Cross-platform helper: build, link into spec tree, emit both projects |
| `foundry/tsp-output/<project>/typespec-extension-exporter/` | Generated Foundry outputs (gitignored)                                |
| [test/](../../../test/)                                     | Vitest integration + unit tests                                       |
| [sample/](../../../sample/)                                 | Minimal standalone test spec                                          |

The Foundry spec's two Java SDK projects carry this emitter's options in their
own `tspconfig.yaml` (in the `azure-rest-api-specs` repo), under
`options.typespec-extension-exporter`. That block is inert unless the emitter is
selected with `--emit`.

The emitter is registered under the name **`typespec-extension-exporter`** (matches
`package.json` `name` and `$lib.name`). The output directory is derived from
this name: `tsp-output/typespec-extension-exporter/`.

## Configuration options

Pass via `--option typespec-extension-exporter.<name>=<value>` or under
`options.typespec-extension-exporter` in a `tspconfig.yaml`. Schema lives in
[src/lib.ts](../../../src/lib.ts) (`additionalProperties: false`, so unknown
keys fail validation). Array-style values are NOT supported — use
comma-separated strings.

| Option                | Type                                 | Default                                                                                             | Description                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`                | string (CSV, case-sensitive)         | all keys                                                                                            | Only include occurrences whose `@extension` key is in this list, e.g. `x-ms-foundry-meta`.                                                                                                                                                                                                  |
| `kinds`               | string (CSV, case-insensitive)       | all kinds                                                                                           | Only include these TypeSpec target kinds: `model,modelProperty,operation,enum,union,scalar,...`. Alias `field` → `modelProperty`. **Raw mode only** (Java output modes walk the TCGC model, not kinds).                                                                                     |
| `output-shape`        | `raw` \| `revapi` \| `tsp-ast-input` | `raw`                                                                                               | Semantic output shape (see modes above).                                                                                                                                                                                                                                                    |
| `output-format`       | `json` \| `yaml` \| `csv`            | `json`                                                                                              | Serialization format. CSV output uses `;` as the delimiter.                                                                                                                                                                                                                                 |
| `output-file`         | string                               | `extensions.<format>` (raw) / `revapi.<format>` (revapi) / `tsp-ast-input.<format>` (tsp-ast-input) | File name written into the emitter output dir.                                                                                                                                                                                                                                              |
| `java-namespace`      | string                               | TCGC client namespace                                                                               | Java output modes only. Override the Java base package, e.g. `com.azure.ai.agents`. **Set this when the package comes from the `typespec-java` emitter's `namespace` option rather than `@@clientNamespace(..., "java")`** — projects has no `@@clientNamespace`, so it needs the override. |
| `models-subpackage`   | string                               | `models`                                                                                            | Java output modes only. Subpackage for public types.                                                                                                                                                                                                                                        |
| `internal-subpackage` | string                               | `implementation.models`                                                                             | Java output modes only. Subpackage for non-public (internal `access`) types.                                                                                                                                                                                                                |
| `justification`       | string                               | `Preview API.`                                                                                      | Java output modes only. Base annotation/justification on each entry. Gating preview keys parsed from the `@extension` value's `required_previews`/`conditional_previews` arrays are appended automatically (e.g. `Preview API. CodeAgents=V1Preview`).                                      |

### revapi `old` regex shape

- Types (model/enum/union): `.*\b<fqn>(?![\w$]).*` — word-boundary anchored so
  `AgentObject` never matches `AgentObjectVersion`. `<fqn>` =
  `<java-namespace>.<models|implementation.models>.<ClientName>`.
- Beta property on a non-beta model:
  `.*\b<containerFqn>::(get|set|is|with)?<PascalName>(?![\w$]).*`. Properties on
  a model that is itself beta are skipped (covered by the type entry).
- Anonymous models (request bodies, empty namespace) are skipped.
- Every entry uses `code: "java\\..*"` (matches any breaking-change code).

### tsp-ast-input shape

- Type-level entities (model/enum/union):
  `{ "type": "class", "class_name": "<fqn>", "annotation_description": "..." }`.
- Beta property on a non-beta model:
  `{ "type": "field", "class_name": "<containerFqn>", "annotation_description": "...", "member_name": "<javaMemberName>" }`.
- `member_name` is the generated Java field/member name from TCGC (camelCase,
  reflecting Java `@clientName` customizations), not the accessor name.
- Anonymous models are skipped using the same rules as revapi mode.

## Build

```bash
npm install
npm run build      # tsc -p .  → dist/
npm run watch      # rebuild on change
npm test           # build + vitest suite
npm run lint       # ESLint
npm run format     # Prettier
```

## Run against the sample spec (quick smoke test)

```bash
npx tsp compile sample/main.tsp --config sample/tspconfig.yaml
# raw occurrences → tsp-output/typespec-extension-exporter/extensions.json
```

## Run against the Foundry spec

The Foundry spec lives in the `azure-rest-api-specs` repo. Each Java SDK project
(`sdk-java-azure-ai-agents`, `sdk-java-azure-ai-projects`) carries this emitter's
options in its own `tspconfig.yaml` under `options.typespec-extension-exporter`
(default output: the `tsp-ast-input` CSV `beta-annotations.csv` the Java SDK
consumes). The block is **inert** unless the emitter is selected with `--emit`,
so a plain `tsp compile` ignores it.

TypeSpec resolves emitters from the spec's own directory tree (NOT global
installs), so the emitter must be present in a `node_modules` above the spec
files. Onboard once with either `npm link` or `npm install --no-save
typespec-extension-exporter` inside the spec repo.

### Emit (local dev helper)

```bash
export FOUNDRY_DIR=/path/to/azure-rest-api-specs/specification/ai-foundry/data-plane/Foundry
npm run foundry:emit            # both projects -> foundry/tsp-output/<project>/
npm run foundry:emit:agents     # one project

# Write straight into a Java SDK module's customizations/ folder:
node foundry/emit.mjs agents \
  --agents-out /path/to/azure-sdk-for-java/sdk/ai/azure-ai-agents/customizations
```

[foundry/emit.mjs](../../../foundry/emit.mjs) (cross-platform) builds the
emitter, copies its `dist` + `package.json` into the spec tree's `node_modules`
(no nested `node_modules`, so it resolves the spec repo's own `@typespec/*` and
`yaml` versions — avoiding "multiple versions" warnings), then compiles each
project's `client.tsp` with `--emit typespec-extension-exporter`. It passes
`--option typespec-extension-exporter.emitter-output-dir=<target>` so the file
lands **directly** in the target (no `typespec-extension-exporter/` subfolder).
Target defaults to `foundry/tsp-output/<project>/`; `--<project>-out <dir>`
overrides it (e.g. the Java module's `customizations/`). Options otherwise come
from the spec's committed `tspconfig.yaml`. `FOUNDRY_DIR` can also be passed as
`--foundry-dir <path>`.

### Verify

```bash
node -e "const fs=require('fs');const f='foundry/tsp-output/agents/beta-annotations.csv';console.log(fs.readFileSync(f,'utf8').trim().split('\n').length-1, 'entries');"
# expected order of magnitude: agents≈74, projects≈25 entries

# spec repo should only show the two tspconfig.yaml edits as tracked changes:
git -C /path/to/azure-rest-api-specs status --short specification/ai-foundry/data-plane/Foundry/
```

### From the Java SDK repo (tsp-client)

```bash
npx tsp-client sync                                    # materializes TempTypeSpecFiles/
npm install --no-save typespec-extension-exporter      # run from within `TempTypeSpecFiles`

npx tsp compile <synced client.tsp> \                  # run from within `TempTypeSpecFiles`
  --emit typespec-extension-exporter

npx tsp-client generate                                # Java codegen, from package root; @Beta customization reads the CSV
```

No emitter option needs to be passed — the output location comes from the
committed `emitter-output-dir`. The `@Beta` customization throws if
`customizations/beta-annotations.csv` is missing, so the `tsp compile` step must
run before `tsp-client generate`.

`tsp-client generate --emitter-options` only feeds the **main** emitter
(typespec-java) from `eng/emitter-package.json`, so it cannot run this emitter;
use the `--emit` compile above (or the `emit.mjs` helper) as a separate step
before generation.

## Adding a new Foundry project

1. Add an `options.typespec-extension-exporter` block to that project's
   `tspconfig.yaml` in the spec repo (`keys`, `output-shape`, `output-format`,
   `output-file`, and `java-namespace` matching the `typespec-java` emitter's
   `namespace`).
2. Add the project to the `PROJECTS` map in
   [foundry/emit.mjs](../../../foundry/emit.mjs) and a `foundry:emit:<name>` npm
   script.

## Gotchas

- Emitter options in `tspconfig.yaml` are **inert** unless the emitter is in the
  `emit` list or passed via `--emit`; committing them upstream is safe.
- TypeSpec has **no global emitter resolution** — `npm install -g` alone is not
  enough; the emitter must be linked/installed into the spec tree.
- `kinds` and `keys` must be comma-separated **strings**; array values fail
  schema validation. Invalid `kinds`/`keys` values produce a warning diagnostic
  (`unknown-kind` / `non-extension-key`) but do not fail the build.
- Property names from TCGC may be snake_case or camelCase; revapi mode
  PascalCases them for the Java accessor regex. `tsp-ast-input` mode uses the
  TCGC property/member name directly in `member_name`.
- `@extension` is matched by name+namespace (`TypeSpec.OpenAPI`), not function
  identity, to survive the emitter and spec resolving different
  `@typespec/openapi` instances.
