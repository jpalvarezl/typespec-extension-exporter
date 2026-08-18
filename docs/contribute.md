# Contributing

## Setup

```bash
npm install
npm run build        # compile TypeScript to dist/
npm run watch        # rebuild on change
```

The emitter entry point (`$onEmit`, `$lib`) resolves to `dist/src/index.js`, so
a build is required before the emitter (or the tests) can run.

## Scripts

| Script                 | Purpose                           |
| ---------------------- | --------------------------------- |
| `npm run build`        | Compile TypeScript to `dist/`.    |
| `npm run watch`        | Rebuild on change.                |
| `npm test`             | Build, then run the Vitest suite. |
| `npm run test:watch`   | Re-run tests on change.           |
| `npm run lint`         | ESLint.                           |
| `npm run lint:fix`     | ESLint with autofix.              |
| `npm run format`       | Format with Prettier.             |
| `npm run format:check` | Verify formatting (used in CI).   |
| `npm run clean`        | Remove `dist/`.                   |

These checks run on every push and pull request via the GitHub Actions workflow
in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Project structure

| Path                  | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `src/index.ts`        | `$onEmit` orchestrator; re-exports `$lib` and public output types.   |
| `src/lib.ts`          | `$lib` definition, options schema, and diagnostics.                  |
| `src/options.ts`      | Filter parsing, SDK naming options, option-validation helpers.       |
| `src/extension.ts`    | `@extension` detection and decorator reading.                        |
| `src/collect-raw.ts`  | Raw `@extension` occurrence collection via the type graph.           |
| `src/collect-beta.ts` | TCGC beta-entity collection for SDK output modes.                    |
| `src/transform.ts`    | SDK output transforms and generated FQN/text helpers.                |
| `src/serialize.ts`    | JSON/YAML/CSV serialization.                                         |
| `src/types.ts`        | Shared interfaces.                                                   |
| `test/`               | Vitest integration tests (compile a spec) + `test/unit/` unit tests. |
| `foundry/emit.mjs`    | Cross-platform helper to emit against a Foundry spec checkout.       |

## Testing

Tests use the `@typespec/compiler/testing` host. Integration tests
(`test/*.test.ts`) compile a small in-memory spec through the built emitter and
assert on the emitted files; unit tests (`test/unit/*.test.ts`) import the pure
functions from `dist/` and assert directly. A Vitest global setup builds the
emitter before the suite runs.

```bash
npm test
```

## Publishing to npm

Releases use npm trusted publishing from GitHub Actions, so no long-lived
`NPM_TOKEN` is stored in the repository. The npm package must have a GitHub
Actions trusted publisher configured with:

- Organization or user: `jpalvarezl`
- Repository: `typespec-extension-exporter`
- Workflow filename: `publish.yml`
- Environment: leave blank

To publish, update the version in `package.json` and `package-lock.json`, commit
that change, and push a matching `v<version>` tag. The
[Publish to npm workflow](../.github/workflows/publish.yml) verifies the tag,
runs formatting, lint, build/tests, and publishes with npm provenance. For
example:

```bash
npm version minor -m "Release %s"
git push origin HEAD
git push origin v0.5.0
```

Do not reuse or move a published version tag.

## Quick smoke test against the sample spec

A sample spec lives in [`sample/`](../sample). To try the emitter against it
from this repo:

```bash
tsp compile sample/main.tsp --emit "$PWD" --output-dir sample/tsp-output
# raw occurrences -> sample/tsp-output/typespec-extension-exporter/extensions.json
```

## How `foundry/emit.mjs` works

The helper makes the emitter usable against a checkout of the Foundry spec
without publishing it. It:

1. Builds the emitter (invokes the local `tsc` directly — no shell).
2. Copies `dist/` + `package.json` (no nested `node_modules`) into the spec
   tree's `node_modules`, so the emitter resolves the spec repo's own
   `@typespec/*` and `yaml` versions — avoiding "multiple versions" warnings.
3. Resolves the spec's own `tsp` CLI and compiles each project's `client.tsp`
   with `--emit typespec-extension-exporter`, passing
   `--option typespec-extension-exporter.emitter-output-dir=<target>` so the
   file lands directly in the target (no `typespec-extension-exporter/`
   subfolder).

The target defaults to `foundry/tsp-output/<project>/`; `--<project>-out <dir>`
overrides it (e.g. a Java SDK module's `customizations/`). Options otherwise
come from the spec's committed `tspconfig.yaml`. See the
[Foundry usage in the README](../README.md#running-against-the-foundry-spec).

### Adding a new Foundry project

1. Add an `options.typespec-extension-exporter` block to that project's
   `tspconfig.yaml` in the spec repo (`keys`, explicit `language`,
   `output-shape`, `output-format`, `output-file`, and `namespace` matching
   the language emitter's `namespace` when it isn't set via
   `@@clientNamespace`).
2. Add the project to the `PROJECTS` map in
   [`foundry/emit.mjs`](../foundry/emit.mjs) and, optionally, a
   `foundry:emit:<name>` npm script.
