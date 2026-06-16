---
name: typespec-extension-exporter
description: "Build, configure, and run the typespec-extension-exporter TypeSpec emitter in this repo. USE WHEN: working on this emitter; generating a revapi differences ignore list from @extension-marked beta entities; generating tsp-ast-input annotation customization data; dumping raw @extension occurrences; serializing output as JSON/YAML/CSV; running it against the Azure AI Foundry spec (agents/projects); understanding the emitter config options (keys, kinds, output-shape, output-format, java-namespace, subpackages, justification); wiring the Foundry spec into the emitter. Explains every option value, the npm scripts, and the FOUNDRY_DIR setup flow."
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

| Path                                                                        | Purpose                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [src/index.ts](../../../src/index.ts)                                       | `$onEmit` entry; raw + Java beta entity collection and output transforms |
| [src/lib.ts](../../../src/lib.ts)                                           | `$lib` definition + options schema (`ExtensionEmitterOptions`)           |
| [foundry/setup-foundry-deps.sh](../../../foundry/setup-foundry-deps.sh)     | Installs spec libs + symlinks the emitter into the spec tree             |
| [foundry/agents.tspconfig.yaml](../../../foundry/agents.tspconfig.yaml)     | Config for `sdk-java-azure-ai-agents`                                    |
| [foundry/projects.tspconfig.yaml](../../../foundry/projects.tspconfig.yaml) | Config for `sdk-java-azure-ai-projects`                                  |
| `foundry/tsp-output/typespec-extension-exporter/`                           | Generated Foundry outputs (`*.revapi.*`, `*.tsp-ast-input.*`)            |
| [sample/](../../../sample/)                                                 | Minimal standalone test spec                                             |

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
npm run watch      # rebuild on change (symlinked into spec tree, picked up live)
```

## Run against the sample spec (quick smoke test)

```bash
npx tsp compile sample/main.tsp --config sample/tspconfig.yaml
# raw occurrences → tsp-output/typespec-extension-exporter/extensions.json
```

## Run against the Foundry spec

The Foundry spec (Azure REST API specs repo) has no `node_modules` in its tree,
so the emitter and the TypeSpec libraries it imports must be installed/linked
there first. TypeSpec resolves imports starting from the spec file's directory
and walking up.

### 1. Point `FOUNDRY_DIR` at the Foundry directory

```bash
set -x FOUNDRY_DIR /path/to/azure-rest-api-specs/specification/ai-foundry/data-plane/Foundry
```

(`FOUNDRY_DIR` must contain `src/sdk-java-azure-ai-agents/client.tsp` and
`src/sdk-java-azure-ai-projects/client.tsp`.)

### 2. One-time setup (or after dependency changes)

```bash
npm run foundry:setup "$FOUNDRY_DIR"
```

This [script](../../../foundry/setup-foundry-deps.sh) builds the emitter, writes
a temporary `package.json` into `$FOUNDRY_DIR` listing the required TypeSpec
libs plus `"typespec-extension-exporter": "file:<this repo>"` (npm installs it as a
**symlink**), runs `npm install`, then removes the temp manifest and lockfile so
the spec repo's git status stays clean. The gitignored `node_modules` remains
and is enough for resolution. After this, `--emit typespec-extension-exporter` works
by name.

### 3. Emit

```bash
npm run foundry:emit:agents     # → foundry/tsp-output/typespec-extension-exporter/agents.revapi.json
npm run foundry:emit:projects   # → .../projects.revapi.json
npm run foundry:emit            # both
```

Each script compiles the project's `client.tsp` entrypoint (NOT `main.tsp`)
with its matching config. The configs mirror the spec project's `imports` so
all decorators/namespaces resolve, and pin `java-namespace`.

### 4. Verify

```bash
node -e "const a=require('./foundry/tsp-output/typespec-extension-exporter/agents.revapi.json'),p=require('./foundry/tsp-output/typespec-extension-exporter/projects.revapi.json');console.log('agents='+a.length,'projects='+p.length);"
# expected order of magnitude: agents≈74, projects≈25

# spec repo must stay clean:
git -C /path/to/azure-rest-api-specs status --short specification/ai-foundry/data-plane/Foundry/
```

## Adding a new Foundry project

1. Copy an existing `foundry/<name>.tspconfig.yaml`, adjust `imports` to mirror
   the spec project's own tspconfig, set `output-file` and `java-namespace`
   (match the `typespec-java` emitter's `namespace` from that project's
   `tspconfig.yaml`).
2. Add a `foundry:emit:<name>` npm script pointing at its `client.tsp`.

## Gotchas

- **Use the npm scripts to emit**, not a bare `npx tsp compile`, so the emitter
  actually runs in the linked spec tree.
- `kinds` and `keys` must be comma-separated **strings**; array values fail
  schema validation.
- Property names from TCGC may be snake_case or camelCase; revapi mode
  PascalCases them for the Java accessor regex. `tsp-ast-input` mode uses the
  TCGC property/member name directly in `member_name`.
- `@extension` is matched by name+namespace (`TypeSpec.OpenAPI`), not function
  identity, to survive the emitter and spec resolving different
  `@typespec/openapi` instances.
