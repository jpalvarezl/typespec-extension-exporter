# revapi-ignore-emitter

A TypeSpec emitter that turns `@extension`-marked beta entities into a
[revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html)
ignore list. It can also dump every `@extension` decorator occurrence as raw
JSON.

## Features

- Detects all `@extension` applications across the compiled program.
- Records, for each occurrence: extension `key`, `value`, the target's `kind`
  and fully-qualified `name`, the containing `namespace`, and the exact
  `file`/`line`/`column` of the decorator.
- Optional filtering by target kind (e.g. only models, fields, or operations).
- Output file name is configurable.

## Installation

```bash
npm install revapi-ignore-emitter
```

The emitter has `@typespec/compiler` and `@typespec/openapi` as peer
dependencies (plus `@azure-tools/typespec-client-generator-core` for `revapi`
mode), so they must be present in your TypeSpec project.

## Usage

Run it as part of `tsp compile`:

```bash
tsp compile <path> --emit revapi-ignore-emitter
```

This writes `extensions.json` into the emitter output directory
(`tsp-output/revapi-ignore-emitter/` by default).

You can also enable it from `tspconfig.yaml`:

```yaml
emit:
  - revapi-ignore-emitter
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

Pass options via `--option revapi-ignore-emitter.<name>=<value>` (or under
`options.revapi-ignore-emitter` in `tspconfig.yaml`).

| Option        | Type   | Description                                                                                                                                            |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keys`        | string | Comma-separated, case-sensitive extension keys to include (e.g. `x-ms-foundry-meta`). Omit to include any key. |
| `kinds`       | string | Comma-separated, case-insensitive target kinds to include (e.g. `model,modelProperty,operation,enum,union,scalar`). The alias `field` maps to `modelProperty`. Omit to include all kinds. |
| `output-format` | string | `raw` (default) emits raw occurrences; `revapi` emits a [revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html) ignore list. |
| `output-file` | string | Name of the JSON file to write. Defaults to `extensions.json` (raw) or `revapi.json` (revapi). |

#### revapi-mode options (used when `output-format: revapi`)

| Option | Type | Description |
| --- | --- | --- |
| `java-namespace` | string | Override for the Java base package, e.g. `com.azure.ai.agents`. When omitted, the client namespace resolved by TCGC (`@@clientNamespace(..., "java")`) is used. Set this when the Java package comes from the `typespec-java` emitter's `namespace` option instead of `@@clientNamespace`. |
| `models-subpackage` | string | Subpackage for public models/enums. Defaults to `models`. |
| `internal-subpackage` | string | Subpackage for non-public (internal-access) types. Defaults to `implementation.models`. |
| `justification` | string | Base justification attached to every generated entry. The gating preview feature keys (from the `@extension` value's `required_previews`/`conditional_previews`) are appended automatically. |

In `revapi` mode the emitter builds the TypeSpec Client Generator Core (TCGC)
SDK model the same way the `typespec-java` emitter does, so each beta entity is
named exactly as it appears in the generated Java SDK: `@clientName` renames are
applied, and the public/internal `access` decides the `models` vs
`implementation.models` subpackage. Anonymous models (e.g. request bodies) have
no distinct public Java type and are skipped — their beta members are covered by
the named models they originate from.

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
  "justification": "Beta entity marked with @extension(\"x-ms-foundry-meta\", ...); breaking changes are accepted while the API is in preview. Gated behind preview feature(s): HostedAgents=V1Preview."
}
```

Type-level entities (models, enums, unions) match their own class/enum name.
Beta properties on a non-beta model match that model's accessors
(`...Model::(get|set|is|with)?PropertyName`); properties on a model that is
itself beta are omitted as redundant.

### Example: only models and fields

```bash
tsp compile <path> --emit revapi-ignore-emitter --option "revapi-ignore-emitter.kinds=model,field"
```

## Development

```bash
npm install
npm run build        # compile TypeScript to dist/
npm run watch        # rebuild on change
```

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

| Project | Config | Output |
| --- | --- | --- |
| `sdk-java-azure-ai-agents` | `foundry/agents.tspconfig.yaml` | `foundry/tsp-output/revapi-ignore-emitter/agents.revapi.json` |
| `sdk-java-azure-ai-projects` | `foundry/projects.tspconfig.yaml` | `foundry/tsp-output/revapi-ignore-emitter/projects.revapi.json` |

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
  - revapi-ignore-emitter
options:
  revapi-ignore-emitter:
    keys: x-ms-foundry-meta
    output-format: revapi
    java-namespace: com.azure.ai.agents
```

