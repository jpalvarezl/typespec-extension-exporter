# typespec-extension-exporter

A TypeSpec emitter that turns `@extension`-marked beta entities into a
[revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html)
ignore list or into annotation-insertion input for downstream AST customization.
It can also dump every `@extension` decorator occurrence as raw data. Outputs
can be serialized as JSON, YAML, or CSV.

## Features

- Detects all `@extension` applications across the compiled program.
- Records, for each occurrence: extension `key`, `value`, the target's `kind`
  and fully-qualified `name`, the containing `namespace`, and the exact
  `file`/`line`/`column` of the decorator.
- Optional filtering by target kind (e.g. only models, fields, or operations).
- Output file name is configurable.

## Installation

```bash
npm install typespec-extension-exporter
```

The emitter has `@typespec/compiler`, `@typespec/openapi`, and
`@azure-tools/typespec-client-generator-core` as peer dependencies, so they must
be present in your TypeSpec project. TCGC is only used when the selected
`output-shape` needs Java SDK entity names (`revapi` or `tsp-ast-input`), but it
is still a required peer dependency because the emitter imports it directly.

## Usage

Run it as part of `tsp compile`:

```bash
tsp compile <path> --emit typespec-extension-exporter
```

By default, this writes `extensions.json` into the emitter output directory
(`tsp-output/typespec-extension-exporter/`).

You can also enable it from `tspconfig.yaml`:

```yaml
emit:
  - typespec-extension-exporter
```

### Output shape

```json
[
  {
    "key": "x-model-tag",
    "value": "widget",
    "targetKind": "Model",
    "targetName": "Sample.Widget",
    "namespace": "Sample",
    "file": "/abs/path/to/main.tsp",
    "line": 8,
    "column": 1
  }
]
```

## Options

Pass options via `--option typespec-extension-exporter.<name>=<value>` (or under
`options.typespec-extension-exporter` in `tspconfig.yaml`).

| Option          | Type   | Description                                                                                                                                                                                                                                                                |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`          | string | Comma-separated, case-sensitive extension keys to include (e.g. `x-ms-foundry-meta`). Omit to include any key.                                                                                                                                                             |
| `kinds`         | string | Comma-separated, case-insensitive target kinds to include (e.g. `model,modelProperty,operation,enum,union,scalar`). The alias `field` maps to `modelProperty`. Omit to include all kinds.                                                                                  |
| `output-shape`  | string | Semantic output shape: `raw` (default) emits raw occurrences; `revapi` emits a [revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html) ignore list; `tsp-ast-input` emits annotation-insertion requests for downstream AST customization. |
| `output-format` | string | Serialization format: `json` (default), `yaml`, or `csv`. CSV output uses `;` as the delimiter.                                                                                                                                                                            |
| `output-file`   | string | Name of the output file to write. Defaults to `extensions.<format>` for raw, `revapi.<format>` for revapi, or `tsp-ast-input.<format>` for tsp-ast-input.                                                                                                                  |

#### Java-output options (used when `output-shape` is `revapi` or `tsp-ast-input`)

| Option                | Type   | Description                                                                                                                                                                                                                                                                                |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `java-namespace`      | string | Override for the Java base package, e.g. `com.azure.ai.agents`. When omitted, the client namespace resolved by TCGC (`@@clientNamespace(..., "java")`) is used. Set this when the Java package comes from the `typespec-java` emitter's `namespace` option instead of `@@clientNamespace`. |
| `models-subpackage`   | string | Subpackage for public models/enums. Defaults to `models`.                                                                                                                                                                                                                                  |
| `internal-subpackage` | string | Subpackage for non-public (internal-access) types. Defaults to `implementation.models`.                                                                                                                                                                                                    |
| `justification`       | string | Base annotation/justification text attached to every generated Java output entry. The gating preview feature keys (from the `@extension` value's `required_previews`/`conditional_previews`) are appended automatically.                                                                   |

#### Option validation

The emitter reports a compiler warning (without failing the build) for option
values that can never match:

- `unknown-kind`: a `kinds` value that is not a recognized TypeSpec kind.
- `non-extension-key`: a `keys` value that does not start with `x-` (OpenAPI
  `@extension` keys always do).

Examples:

```yaml
options:
  typespec-extension-exporter:
    output-shape: tsp-ast-input
    output-format: yaml
```

```bash
tsp compile <path> --emit typespec-extension-exporter \
  --option typespec-extension-exporter.output-shape=revapi \
  --option typespec-extension-exporter.output-format=csv
```

In Java output modes (`revapi` and `tsp-ast-input`) the emitter builds the
TypeSpec Client Generator Core (TCGC) SDK model the same way the `typespec-java`
emitter does, so each beta entity is named exactly as it appears in the
generated Java SDK: `@clientName` renames are applied, and the public/internal
`access` decides the `models` vs `implementation.models` subpackage. Anonymous
models (e.g. request bodies) have no distinct public Java type and are skipped —
their beta members are covered by the named models they originate from.

Each beta entity becomes an ignore entry whose `code` is the regex `java\..*`
(so any breaking change on the matched element is ignored) and whose `old` is a
strict regex matching the entity's Java fully-qualified name — anchored with a
word boundary and a trailing negative look-ahead so it never matches a longer
name that merely shares the same prefix:

```json
{
  "ignore": true,
  "regex": true,
  "code": "java\\..*",
  "old": ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.AgentDefinition(?![\\w$]).*",
  "justification": "Preview API. HostedAgents=V1Preview"
}
```

Type-level entities (models, enums, unions) match their own class/enum name.
Beta properties on a non-beta model match that model's accessors
(`...Model::(get|set|is|with)?PropertyName`); properties on a model that is
itself beta are omitted as redundant.

In `tsp-ast-input` mode, each beta entity becomes an annotation request for a
later AST customization step. Type-level entities become `class` entries, and
beta properties on non-beta models become `field` entries whose `member_name` is
the generated Java member name from TCGC:

```json
{
  "type": "field",
  "class_name": "com.azure.ai.projects.models.CodeBasedEvaluatorDefinition",
  "annotation_description": "Preview API. Evaluators=V1Preview",
  "member_name": "blobUrl"
}
```

### Example: only models and fields

```bash
tsp compile <path> --emit typespec-extension-exporter --option "typespec-extension-exporter.kinds=model,field"
```

## Development

```bash
npm install
npm run build        # compile TypeScript to dist/
npm run watch        # rebuild on change
npm test             # build, then run the vitest suite
npm run test:watch   # re-run tests on change
npm run lint         # ESLint
npm run lint:fix     # ESLint with autofix
npm run format       # format with Prettier
npm run format:check # verify formatting (used in CI)
```

These checks run on every push and pull request via the GitHub Actions
workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

A sample spec lives in [`sample/`](./sample). To try the emitter against it
from this repo:

```bash
tsp compile sample/main.tsp --emit "$PWD" --output-dir sample/tsp-output
```

## Running against the Foundry spec

The Foundry spec lives in a separate repo that has no `node_modules`. TypeSpec
resolves libraries (and emitters) from the spec's own directory tree, so the
required libraries and this emitter must be made resolvable there first.

`foundry/setup-foundry-deps.sh` does this in one shot: it installs the TypeSpec
libraries the spec imports and symlinks this emitter into the spec tree (as a
`file:` dependency). Because it's a symlink, rebuilding the emitter is picked up
immediately — ideal for iteration.

```bash
# One-time setup (point at the Foundry directory):
export FOUNDRY_DIR=/path/to/azure-rest-api-specs/specification/ai-foundry/data-plane/Foundry
npm run foundry:setup "$FOUNDRY_DIR"

# Iterate: rebuild on change in one terminal ...
npm run watch

# ... and emit in another. Per project, or both at once:
npm run foundry:emit:agents
npm run foundry:emit:projects
npm run foundry:emit          # both
```

There is one config per Java SDK project, each producing its own revapi file:

| Project                      | Config                            | Output                                                                |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `sdk-java-azure-ai-agents`   | `foundry/agents.tspconfig.yaml`   | `foundry/tsp-output/typespec-extension-exporter/agents.revapi.json`   |
| `sdk-java-azure-ai-projects` | `foundry/projects.tspconfig.yaml` | `foundry/tsp-output/typespec-extension-exporter/projects.revapi.json` |

Each config mirrors its spec project's `imports` so all decorators and
namespaces resolve. The Java type names, packages and public/internal placement
are taken from TCGC — the same client model the `typespec-java` emitter is built
on — so renames and access levels line up automatically; the only per-project
knob is `java-namespace`, pinned to the `typespec-java` emitter's `namespace`
option. The output is a revapi ignore list of every beta (`x-ms-foundry-meta`)
entity, ready to paste into the Java SDK's `revapi.json`.

### Toward a `tspconfig.yaml` entry

Once the emitter is resolvable in the spec tree (via the setup above, or when
published/installed normally), it can be referenced by name from the spec's own
`tspconfig.yaml` instead of the `--emit` flag:

```yaml
emit:
  - typespec-extension-exporter
options:
  typespec-extension-exporter:
    keys: x-ms-foundry-meta
    output-shape: revapi
    output-format: json
    java-namespace: com.azure.ai.agents
```
