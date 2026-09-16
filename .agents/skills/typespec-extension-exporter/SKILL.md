---
name: typespec-extension-exporter
description: "Build, configure, and run the typespec-extension-exporter TypeSpec emitter in this repo. USE WHEN: working on this emitter; generating a revapi differences ignore list from @extension-marked beta entities; generating tsp-ast-input annotation customization data; generating a list output (two lists — `class` FQNs and `field` references — collapsed from the beta class/field entries, Java or C#); dumping raw @extension occurrences; serializing output as JSON/YAML/CSV; running it against the Azure AI Foundry spec (Java agents/projects and the C# projects-agents); understanding the emitter config options (keys, kinds, output-shape, output-format, language, namespace, subpackages, justification); wiring the Foundry spec into the emitter. Explains every option value, the npm scripts, and the FOUNDRY_DIR emit flow."
---

# typespec-extension-exporter

A TypeSpec emitter (TypeSpec compiler v1.13) with four output shapes and JSON/YAML/CSV serialization:

- **`raw`** (default): every `@extension` decorator occurrence
  (from `@typespec/openapi`) with source locations.
- **`revapi`**: a [revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html)
  ignore list. Java-specific: each `@extension`-marked beta entity becomes an
  `ignore` entry matching its generated Java fully-qualified name.
- **`tsp-ast-input`**: annotation-insertion requests for a
  downstream AST customization step. Each entry has `type` (`class` or
  `field`), `class_name`, `annotation_description`, and field entries also have
  `member_name` with the generated field/member name.
- **`list`**: the beta `class`/`field` entries collapsed into two sorted,
  de-duplicated lists named by their generated-SDK FQN (`<namespace>.<name>`,
  no subpackage). `class` holds beta types (model/enum/union); `field` holds
  beta properties on a non-beta container as `<ContainerFqn>::<propertyName>`.
  Like the Java shapes, automatically discovered properties of an already-beta
  container are omitted (covered by its `class` entry); explicitly requested
  manual fields are retained. Language-neutral — set `language` explicitly
  (built for the C# SDK, where the namespace comes from `@clientNamespace`).

Names/packages come from TCGC (`@azure-tools/typespec-client-generator-core`).
`revapi` and `tsp-ast-input` are Java-specific and always use the Java TCGC
scope, but still require `language: java` to be set explicitly. The `list`
shape also requires `language` (`java`, `csharp`, or a raw emitter name) so
language-scoped `@clientName` renames and `@@clientNamespace(..., "<lang>")`
are honoured. `revapi`, `tsp-ast-input`, and `list` are the **SDK output modes**
(they build the TCGC model); `raw` walks the type graph.

The primary use case is exporting beta (`x-ms-foundry-meta`) Foundry entities
for Azure SDK workflows — revapi suppressions and AST annotation customization
input for the Java SDK, and the `list` output for the C# SDK.

## Project layout

File links below point at the canonical source repo
(<https://github.com/jpalvarezl/typespec-extension-exporter>) so the skill works
regardless of where it is installed. Note the published npm package ships only
`dist/`, `README.md`, `docs/`, `LICENSE`, and `sample/` — `foundry/` and `test/`
exist only in the source repo.

| Path                                                                                                           | Purpose                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [src/index.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/index.ts)               | `$onEmit` orchestrator (re-exports `$lib` + public output types)                    |
| [src/lib.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/lib.ts)                   | `$lib` definition + options schema (`ExtensionEmitterOptions`)                      |
| [src/options.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/options.ts)           | Filter parsing, SDK naming + emitter-scope (`resolveEmitterScope`) options          |
| [src/collect-raw.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/collect-raw.ts)   | Raw `@extension` occurrence collection via the type graph                           |
| [src/collect-beta.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/collect-beta.ts) | TCGC beta-entity collection (SDK scope selected by explicit `language`)             |
| [src/transform.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/transform.ts)       | revapi + tsp-ast-input + list transforms and SDK FQN/text helpers                   |
| [src/serialize.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/serialize.ts)       | JSON/YAML/CSV serialization                                                         |
| [foundry/emit.mjs](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/foundry/emit.mjs)       | Cross-platform helper for emitting against a local spec checkout (source repo only) |
| [test/](https://github.com/jpalvarezl/typespec-extension-exporter/tree/main/test)                              | Vitest integration + unit tests (source repo only)                                  |
| [sample/](https://github.com/jpalvarezl/typespec-extension-exporter/tree/main/sample)                          | Minimal standalone test spec                                                        |

The Foundry spec's SDK projects carry this emitter's options in their own
`tspconfig.yaml` (in the `azure-rest-api-specs` repo), under
`options.typespec-extension-exporter` — the two Java projects emit
`tsp-ast-input`, and the C# `sdk-csharp-azure-ai-projects-agents` project emits
`list`. That block is inert unless the emitter is selected with `--emit`.

The emitter is registered under the name **`typespec-extension-exporter`** (matches
`package.json` `name` and `$lib.name`). The output directory is derived from
this name: `tsp-output/typespec-extension-exporter/`.

## Configuration options

Pass via `--option typespec-extension-exporter.<name>=<value>` or under
`options.typespec-extension-exporter` in a `tspconfig.yaml`. Schema lives in
[src/lib.ts](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/src/lib.ts)
(`additionalProperties: false`, so unknown
keys fail validation). Array-style values are NOT supported — use
comma-separated strings.

| Option                | Type                                            | Default                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`                | string (CSV, case-sensitive)                    | all keys                                           | Only include occurrences whose `@extension` key is in this list, e.g. `x-ms-foundry-meta`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `kinds`               | string (CSV, case-insensitive)                  | all kinds                                          | Only include these TypeSpec target kinds: `model,modelProperty,operation,enum,union,scalar,...`. Alias `field` → `modelProperty`. **Raw mode only** (SDK output modes walk the TCGC model, not kinds).                                                                                                                                                                                                                                                                                                                                                                     |
| `output-shape`        | `raw` \| `revapi` \| `tsp-ast-input` \| `list`  | `raw`                                              | Semantic output shape (see modes above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `output-format`       | `json` \| `yaml` \| `csv`                       | `json`                                             | Serialization format. CSV output uses `;` as the delimiter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `output-file`         | string                                          | `<shape>.<format>` (`extensions.<format>` for raw) | File name written into the emitter output dir. Defaults: `extensions.<format>` (raw), `revapi.<format>`, `tsp-ast-input.<format>`, `list.<format>`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `language`            | string (`java` \| `csharp` \| raw emitter name) | **required for SDK output modes**                  | Required when `output-shape` is `revapi`, `tsp-ast-input`, or `list`; missing/blank reports `missing-language-for-sdk-shape` and emits no output. Picks the TCGC emitter scope so language-scoped customizations (`@clientName(..., "<lang>")`, `@@clientNamespace(..., "<lang>")`) apply. `java`→`@azure-tools/typespec-java`, `csharp`→`@typespec/http-client-csharp`; any other value is used verbatim as the scope. `revapi`/`tsp-ast-input` are Java-specific, so set `language: java`; non-Java values report `non-java-language-for-java-shape` and emit no output. |
| `namespace`           | string                                          | TCGC client namespace                              | SDK output modes only. Override the generated SDK base namespace/package, e.g. `com.azure.ai.agents` (Java) or `Azure.AI.Projects.Agents` (.NET). **Set this when the package comes from the language emitter's own `namespace` option rather than `@@clientNamespace`** — the Java `projects`/`agents` projects have no `@@clientNamespace`, so they need it; the C# project resolves it natively from `@clientNamespace`, so it omits it.                                                                                                                                |
| `models-subpackage`   | string                                          | `models`                                           | `revapi`/`tsp-ast-input` only. Subpackage for public types. (`list` uses no subpackage.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `internal-subpackage` | string                                          | `implementation.models`                            | `revapi`/`tsp-ast-input` only. Subpackage for non-public (internal `access`) types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `justification`       | string                                          | `Preview API.`                                     | `revapi`/`tsp-ast-input` only. Base annotation/justification on each entry. Gating preview keys parsed from the `@extension` value's `required_previews`/`conditional_previews` arrays are appended automatically (e.g. `Preview API. CodeAgents=V1Preview`).                                                                                                                                                                                                                                                                                                              |
| `manual-entries`      | string (CSV)                                    | no additions                                       | All SDK shapes. `FooBar` adds a class; `FooBar::baz` adds a field. Short names require an explicit `namespace`; Java shapes add `models-subpackage`, `list` does not. Dot-qualified class names are absolute FQNs preserved unchanged. Non-empty use with `raw` is an error.                                                                                                                                                                                                                                                                                               |

### Manual SDK entries

```yaml
options:
  typespec-extension-exporter:
    language: java
    namespace: com.example
    output-shape: tsp-ast-input
    output-format: csv
    output-file: beta-annotations.csv
    manual-entries: "FooBar,OtherModel::baz"
```

This adds `class;com.example.models.FooBar;Preview API.;` and
`field;com.example.models.OtherModel;Preview API.;baz` to the CSV, alongside
discovered entries. The emitter must still be enabled via `emit` or `--emit`.

- One comma-separated string, no nested keys or YAML lists. Whitespace,
  including around `::`, is trimmed; empty segments are ignored.
- Supply generated SDK names, not TypeSpec names. No `@clientName` rewriting
  or existence checking is applied to manual targets.
- Short names require explicit `namespace`, even when TCGC can infer it for
  discovered entries. Any dot-qualified name is an absolute FQN; use
  `com.example.implementation.models.FooBar` for internal classes.
- Manual entries apply to all SDK shapes/formats, independent of `keys` and
  `kinds`. Duplicate targets are merged without losing discovered preview
  keys. New manual targets use `justification` without inferred preview keys.
- Explicit fields remain even if their class is included. Automatic
  discovery's beta-container field omission is unchanged.
- `invalid-manual-entry`, `missing-namespace-for-manual-entry`, and
  `manual-entries-for-raw-shape` are errors and prevent output. Empty input
  is a no-op, including in `raw`.
- For inline TypeSpec models that generate separate Java classes, manual
  entries avoid guessing names in this emitter. Extracting a named model
  and attaching `@extension` directly is preferable when the spec can change.
  There is no automatic anonymous-type inference or parent metadata
  propagation.

### revapi `old` regex shape

- Types (model/enum/union): `.*\b<fqn>(?![\w$]).*` — word-boundary anchored so
  `AgentObject` never matches `AgentObjectVersion`. `<fqn>` =
  `<namespace>.<models|implementation.models>.<ClientName>`.
- Beta property on a non-beta model:
  `.*\b<containerFqn>::(get|set|is|with)?<PascalName>(?![\w$]).*`. Properties on
  a model that is itself beta are skipped during discovery (covered by the
  type entry); explicit manual fields are retained.
- SDK models without a namespace (e.g. synthetic request bodies) are skipped
  during discovery. Not all anonymous TypeSpec models fall into this category.
- Every entry uses `code: "java\\..*"` (matches any breaking-change code).

### tsp-ast-input shape

- Type-level entities (model/enum/union):
  `{ "type": "class", "class_name": "<fqn>", "annotation_description": "..." }`.
- Beta property on a non-beta model:
  `{ "type": "field", "class_name": "<containerFqn>", "annotation_description": "...", "member_name": "<javaMemberName>" }`.
- `member_name` is the generated Java field/member name from TCGC (camelCase,
  reflecting Java `@clientName` customizations), not the accessor name.
- Namespace-less SDK models are skipped using the same rules as revapi mode.

### list shape

- An object with two sorted, de-duplicated string lists: `class` (FQNs of
  **type-level** beta entities — model/enum/union) and `field`
  (`<ContainerFqn>::<propertyName>` for beta properties on a **non-beta**
  container) — i.e. the `class`/`field` rows of the csv/tsp-ast-input shapes
  collapsed into two lists. `<fqn>` = `<namespace>.<name>` with **no**
  `models`/`implementation.models` subpackage.
- Automatically discovered beta properties of an already-beta container are
  omitted (covered by that container's `class` entry), matching
  revapi/tsp-ast-input. Explicit manual fields are retained. Namespace-less
  SDK models are skipped during discovery. Each list is sorted.
- The property segment is the raw TCGC member name for the `language` scope
  (camelCase for Java; the csharp scope also yields the spec property name).
- CSV serialization flattens both lists into `type;name` rows; JSON/YAML emit
  the object with `class`/`field` arrays as-is.
- `<namespace>` comes from the `namespace` override if set, else the TCGC
  client namespace for the `language` scope. For C# this is resolved natively
  from the spec's `@clientNamespace(...)` (no override needed); for Java the
  package usually comes from the `typespec-java` emitter `namespace` option, so
  set `namespace` to match.
- `justification`/`models-subpackage`/`internal-subpackage` are ignored by this
  shape.

## Build

```bash
npm install
npm run build      # tsc -p .  → dist/
npm run watch      # rebuild on change
npm test           # build + vitest suite
npm run lint       # ESLint
npm run format     # Prettier
```

## Publish

Publishing uses npm trusted publishing through
`.github/workflows/publish.yml`; do not publish directly from the office
network and do not add a long-lived `NPM_TOKEN`. The npm package's trusted
publisher must target user `jpalvarezl`, repository
`typespec-extension-exporter`, workflow filename `publish.yml`, with no GitHub
environment. Bump and commit the package version, then push the matching
`v<version>` tag. The workflow validates that the tag matches `package.json`,
runs checks/tests, and publishes with provenance.

## Run against the sample spec (quick smoke test)

```bash
npx tsp compile sample/main.tsp --config sample/tspconfig.yaml
# raw occurrences → tsp-output/typespec-extension-exporter/extensions.json
```

## Run against the Foundry spec

The Foundry spec lives in the `azure-rest-api-specs` repo. Three SDK projects
carry this emitter's options in their own `tspconfig.yaml` under
`options.typespec-extension-exporter`:

- `sdk-java-azure-ai-agents`, `sdk-java-azure-ai-projects` (Java,
  `language: java`) — default output: the `tsp-ast-input` CSV
  `beta-annotations.csv` the Java SDK consumes.
- `sdk-csharp-azure-ai-projects-agents` (C#, `language: csharp`) — `list` YAML
  (`list.yaml`).

The block is **inert** unless the emitter is selected with `--emit`, so a plain
`tsp compile` ignores it. The `foundry/emit.mjs` helper below covers the two
Java projects; the C# project is emitted with a manual `--emit` compile (or by
adding it to the helper's `PROJECTS` map).

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

[foundry/emit.mjs](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/foundry/emit.mjs)
(cross-platform) builds the
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

# C# list (manual --emit; resolves Azure.AI.Projects.Agents.* from @clientNamespace):
#   npx tsp compile <FOUNDRY>/src/sdk-csharp-azure-ai-projects-agents/client.tsp --emit typespec-extension-exporter
# If the tspconfig has not yet been updated, also pass:
#   --option typespec-extension-exporter.language=csharp
# -> list.yaml: two lists, `class:` (FQNs) and `field:` (`<FQN>::<prop>`).

# spec repo should only show the three tspconfig.yaml edits as tracked changes
# (two Java + the C# projects-agents):
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

No emitter option needs to be passed when the synced `tspconfig.yaml` already
contains `language: java` and the committed `emitter-output-dir`. If the synced
config predates the breaking change, pass
`--option typespec-extension-exporter.language=java` (or update the config). The
`@Beta` customization throws if `customizations/beta-annotations.csv` is
missing, so the `tsp compile` step must run before `tsp-client generate`.

`tsp-client generate --emitter-options` only feeds the **main** emitter
(typespec-java) from `eng/emitter-package.json`, so it cannot run this emitter;
use the `--emit` compile above (or the `emit.mjs` helper) as a separate step
before generation.

## Adding a new Foundry project

1. Add an `options.typespec-extension-exporter` block to that project's
   `tspconfig.yaml` in the spec repo (`keys`, explicit `language`,
   `output-shape`, `output-format`, `output-file`, and `namespace` matching the
   language emitter's `namespace` when it isn't set via `@@clientNamespace`).
2. For a Java project, add it to the `PROJECTS` map in
   [foundry/emit.mjs](https://github.com/jpalvarezl/typespec-extension-exporter/blob/main/foundry/emit.mjs)
   and a `foundry:emit:<name>` npm
   script. (The helper assumes a `sdk-java-azure-ai-<name>` layout; other
   languages are emitted with a manual `--emit` compile.)

## Gotchas

- Emitter options in `tspconfig.yaml` are **inert** unless the emitter is in the
  `emit` list or passed via `--emit`; committing them upstream is safe.
- TypeSpec has **no global emitter resolution** — `npm install -g` alone is not
  enough; the emitter must be linked/installed into the spec tree
  (`npm install --no-save typespec-extension-exporter`).
- The Foundry configs set `emitter-output-dir: "{cwd}/../customizations"`, which
  is **cwd-relative**: it only resolves to the Java module's `customizations/`
  when `tsp compile` is invoked from inside `TempTypeSpecFiles`. Run it from
  anywhere else and the CSV lands in the wrong place. (`{cwd}` is the process
  working directory; the `foundry/emit.mjs` helper is unaffected because it
  overrides `emitter-output-dir` via `--option`.)
- `kinds` and `keys` must be comma-separated **strings**; array values fail
  schema validation. Invalid `kinds`/`keys` values produce a warning diagnostic
  (`unknown-kind` / `non-extension-key`) but do not fail the build.
- `language` is mandatory for SDK output modes (`revapi`, `tsp-ast-input`, and
  `list`). Missing or blank `language` reports `missing-language-for-sdk-shape`
  and emits no output. `revapi` and `tsp-ast-input` also require Java;
  non-Java values report `non-java-language-for-java-shape` and emit no output.
- Property names from TCGC may be snake_case or camelCase; revapi mode
  PascalCases them for the Java accessor regex. `tsp-ast-input` mode uses the
  TCGC property/member name directly in `member_name`.
- **`namespace` resolution differs by language.** TCGC's csharp scope honours
  the spec's `@clientNamespace(...)`, so the C# project needs no `namespace`
  override. TCGC's java scope does **not** see the package set by the
  `typespec-java` emitter's own `namespace` option, so the Java projects must
  set `namespace` explicitly (there is no `@@clientNamespace` to fall back on).
- `@extension` is matched by name+namespace (`TypeSpec.OpenAPI`), not function
  identity, to survive the emitter and spec resolving different
  `@typespec/openapi` instances.
