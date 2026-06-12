# extension-emitter

A tiny TypeSpec emitter that scans a project for every `@extension` decorator
(from `@typespec/openapi`) and writes the occurrences to a JSON file.

## Features

- Detects all `@extension` applications across the compiled program.
- Records, for each occurrence: extension `key`, `value`, the target's `kind`
  and fully-qualified `name`, the containing `namespace`, and the exact
  `file`/`line`/`column` of the decorator.
- Optional filtering by target kind (e.g. only models, fields, or operations).
- Output file name is configurable.

## Installation

```bash
npm install extension-emitter
```

The emitter has `@typespec/compiler` and `@typespec/openapi` as peer
dependencies, so they must be present in your TypeSpec project.

## Usage

Run it as part of `tsp compile`:

```bash
tsp compile <path> --emit extension-emitter
```

This writes `extensions.json` into the emitter output directory
(`tsp-output/extension-emitter/` by default).

You can also enable it from `tspconfig.yaml`:

```yaml
emit:
  - extension-emitter
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

Pass options via `--option extension-emitter.<name>=<value>` (or under
`options.extension-emitter` in `tspconfig.yaml`).

| Option        | Type   | Description                                                                                                                                            |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kinds`       | string | Comma-separated, case-insensitive target kinds to include (e.g. `model,modelProperty,operation,enum,union,scalar`). The alias `field` maps to `modelProperty`. Omit to include all kinds. |
| `output-file` | string | Name of the JSON file to write. Defaults to `extensions.json`.                                                                                         |

### Example: only models and fields

```bash
tsp compile <path> --emit extension-emitter --option "extension-emitter.kinds=model,field"
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
