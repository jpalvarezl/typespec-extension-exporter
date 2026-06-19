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

The default `raw` output is a JSON array of `@extension` occurrences. See
[Output shapes and formats](docs/advanced.md) for every shape and format.

## Options

Pass options via `--option typespec-extension-exporter.<name>=<value>` (or under
`options.typespec-extension-exporter` in `tspconfig.yaml`).

| Option          | Type   | Description                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`          | string | Comma-separated, case-sensitive extension keys to include (e.g. `x-ms-foundry-meta`). Omit to include any key.                                                                                                                                                                                                                                                                                    |
| `kinds`         | string | Comma-separated, case-insensitive target kinds to include (e.g. `model,modelProperty,operation,enum,union,scalar`). The alias `field` maps to `modelProperty`. Omit to include all kinds.                                                                                                                                                                                                         |
| `output-shape`  | string | Semantic output shape: `raw` (default) emits raw occurrences; `revapi` emits a [revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html) ignore list; `tsp-ast-input` emits annotation-insertion requests for downstream AST customization; `beta-classes` emits two lists — beta classes and beta properties — named by their generated-SDK fully-qualified name. |
| `output-format` | string | Serialization format: `json` (default), `yaml`, or `csv`. CSV output uses `;` as the delimiter.                                                                                                                                                                                                                                                                                                   |
| `output-file`   | string | Name of the output file to write. Defaults to `extensions.<format>` for raw, `revapi.<format>` for revapi, `tsp-ast-input.<format>` for tsp-ast-input, or `beta-classes.<format>` for beta-classes.                                                                                                                                                                                               |

#### SDK-output options (used when `output-shape` is `revapi`, `tsp-ast-input`, or `beta-classes`)

| Option                | Type   | Description                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `language`            | string | Target SDK language, used to pick the TCGC emitter scope so language-scoped customizations (`@clientName(..., "<lang>")`, `@@clientNamespace(..., "<lang>")`) apply. Known values: `java` (default), `csharp`. Any other value is treated as a raw TCGC emitter name.                                                                              |
| `namespace`           | string | Override for the generated SDK base namespace/package, e.g. `com.azure.ai.agents` (Java) or `Azure.AI.Projects.Agents` (.NET). When omitted, the client namespace resolved by TCGC (which honours `@@clientNamespace`) is used. Set this when the package comes from the language emitter's own `namespace` option instead of `@@clientNamespace`. |
| `models-subpackage`   | string | Subpackage for public models/enums. Defaults to `models`. (Applies to `revapi`/`tsp-ast-input`; `beta-classes` uses no subpackage.)                                                                                                                                                                                                                |
| `internal-subpackage` | string | Subpackage for non-public (internal-access) types. Defaults to `implementation.models`.                                                                                                                                                                                                                                                            |
| `justification`       | string | Base annotation/justification text attached to every generated Java output entry. The gating preview feature keys (from the `@extension` value's `required_previews`/`conditional_previews`) are appended automatically.                                                                                                                           |

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

For details on each output shape (including the `revapi` regex anchoring and the
`tsp-ast-input` entry format), the Java naming rules, and the serialization
formats, see [Output shapes and formats](docs/advanced.md).

## Running against the Foundry spec

The Foundry spec lives in the [`azure-rest-api-specs`](https://github.com/Azure/azure-rest-api-specs)
repo. Its two Java SDK projects carry this emitter's options in their own
`tspconfig.yaml`:

| Project                      | `tspconfig.yaml`                                            |
| ---------------------------- | ----------------------------------------------------------- |
| `sdk-java-azure-ai-agents`   | `.../Foundry/src/sdk-java-azure-ai-agents/tspconfig.yaml`   |
| `sdk-java-azure-ai-projects` | `.../Foundry/src/sdk-java-azure-ai-projects/tspconfig.yaml` |

Each has an `options.typespec-extension-exporter` block (default output: the
`tsp-ast-input` CSV the Java SDK consumes as
`<library-module>/customizations/beta-annotations.csv`). That block is **inert**
during a normal `tsp compile` — it only takes effect when the emitter is
explicitly selected with `--emit typespec-extension-exporter`, so it never
disrupts other contributors.

### One-time onboarding: make the emitter resolvable

TypeSpec resolves emitters from the spec's own directory tree (it does **not**
consult global installs), so the emitter must be present in a `node_modules`
above the spec files. Pick whichever you prefer:

```bash
# Option A — npm link (no publish; picks up local rebuilds):
npm install -g typespec-extension-exporter   # or: npm link  (from this repo)
cd /path/to/azure-rest-api-specs
npm link typespec-extension-exporter

# Option B — install into the spec repo without touching its package.json:
cd /path/to/azure-rest-api-specs
npm install --no-save typespec-extension-exporter
```

Both may emit a harmless "multiple versions of @typespec/\*" warning if your
emitter install resolves newer TypeSpec libraries than the spec repo's; the
output is unaffected.

### Emit

With the emitter onboarded, compile a project's `client.tsp` with `--emit`; the
options come from that project's committed `tspconfig.yaml`:

```bash
tsp compile .../Foundry/src/sdk-java-azure-ai-agents/client.tsp \
  --emit typespec-extension-exporter --output-dir <out>
```

For local development against a checkout of the spec, this repo ships a
cross-platform helper that builds the emitter, makes it resolvable in the spec
tree, and emits each project. By default it writes under
`foundry/tsp-output/<project>/`, but `--<project>-out <dir>` writes
`beta-annotations.csv` **straight into a Java SDK module's `customizations/`
folder** (where the `@Beta` customization reads it):

```bash
export FOUNDRY_DIR=/path/to/azure-rest-api-specs/specification/ai-foundry/data-plane/Foundry

# Generate into this repo's output dir:
npm run foundry:emit            # both projects
npm run foundry:emit:agents     # one project

# Generate straight into the Java SDK module (one command, ready to commit):
node foundry/emit.mjs agents \
  --agents-out /path/to/azure-sdk-for-java/sdk/ai/azure-ai-agents/customizations
node foundry/emit.mjs projects \
  --projects-out /path/to/azure-sdk-for-java/sdk/ai/azure-ai-projects/customizations
```

(`FOUNDRY_DIR` can also be passed as `--foundry-dir <path>`; it must contain
`src/sdk-java-azure-ai-<project>/client.tsp`. The helper writes the file
directly — no `typespec-extension-exporter/` subfolder — via the built-in
`emitter-output-dir` option.)

### Using `tsp-client` from the Java SDK repo

The committed options flow through the Java SDK repo's `tsp-location.yaml`
process. Each project's `tspconfig.yaml` sets
`emitter-output-dir: "{cwd}/../customizations"`, so — when `tsp compile` is run
from inside `TempTypeSpecFiles` — the CSV lands in the library module's
`customizations/` folder automatically, with no `--output-dir` or other flag
needed (`{cwd}` is the process working directory, and `TempTypeSpecFiles` sits
directly beside `customizations/` in the module).

From the library module (e.g. `sdk/ai/azure-ai-agents`):

```bash
npx tsp-client sync                                    # materializes TempTypeSpecFiles/

cd TempTypeSpecFiles
npm install --no-save typespec-extension-exporter      # the published emitter + its deps

npx tsp compile <synced client.tsp> \                  # run from within TempTypeSpecFiles
  --emit typespec-extension-exporter
cd ..

npx tsp-client generate                                # Java codegen; @Beta customization reads the CSV
```

The `@Beta` customization **requires** `customizations/beta-annotations.csv` to
exist, so the `tsp compile` step must run before `tsp-client generate`. No
emitter option needs to be passed — the output location comes from the committed
`emitter-output-dir`. Because that path is `{cwd}`-relative, the `tsp compile`
must be invoked **from inside `TempTypeSpecFiles`**; running it elsewhere puts
the CSV in the wrong place.

## Documentation

- [Output shapes and formats](docs/advanced.md) — the `raw`, `revapi`,
  `tsp-ast-input`, and `beta-classes` shapes in depth, SDK naming rules, and the
  JSON/YAML/CSV formats.
- [Contributing](docs/contribute.md) — local setup, scripts, project structure,
  testing, and how `foundry/emit.mjs` works.
