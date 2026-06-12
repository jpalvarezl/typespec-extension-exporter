#!/usr/bin/env bash
#
# Installs the TypeSpec libraries the Foundry spec needs (so its imports
# resolve) AND links this local revapi-ignore-emitter into the spec tree so it
# can be referenced by name -- i.e. `--emit revapi-ignore-emitter` and,
# ultimately, an entry in the spec's own tspconfig.yaml.
#
# Why this is needed: TypeSpec resolves library/emitter imports using Node
# module resolution starting from the spec file's own directory and walking up.
# The azure-rest-api-specs repo has no node_modules in that tree, so we install
# the required libraries and symlink the emitter into a node_modules at the
# Foundry directory (an ancestor of the spec sources). That node_modules is
# gitignored in the spec repo.
#
# The emitter is added as a `file:` dependency, which npm installs as a SYMLINK.
# That means rebuilding the emitter locally (e.g. `npm run watch`) is picked up
# immediately -- no reinstall needed while iterating.
#
# The temporary package.json is removed afterward so the spec repo's git status
# stays clean; the installed/symlinked node_modules remains and is enough for
# resolution.
#
# Usage:
#   ./foundry/setup-foundry-deps.sh <path-to-Foundry-dir>
#
# The Foundry directory can also be provided via the FOUNDRY_DIR environment
# variable. The argument takes precedence when both are set.
#
set -euo pipefail

FOUNDRY_DIR="${1:-${FOUNDRY_DIR:-}}"

if [[ -z "$FOUNDRY_DIR" ]]; then
  echo "Error: path to the Foundry directory is required." >&2
  echo "Usage: $0 <path-to-Foundry-dir>" >&2
  echo "   or: FOUNDRY_DIR=<path> $0" >&2
  exit 1
fi

if [[ ! -d "$FOUNDRY_DIR" ]]; then
  echo "Foundry directory not found: $FOUNDRY_DIR" >&2
  exit 1
fi

# Resolve the emitter repo root from this script's location (foundry/..),
# so the path is never hardcoded.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMITTER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TMP_MANIFEST="$FOUNDRY_DIR/package.json"

cat >"$TMP_MANIFEST" <<JSON
{
  "name": "foundry-spec-deps",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "@azure-tools/openai-typespec": "1.20.1",
    "@azure-tools/typespec-azure-core": "0.69.0",
    "@azure-tools/typespec-client-generator-core": "0.69.0",
    "@typespec/compiler": "1.13.0",
    "@typespec/events": "0.83.0",
    "@typespec/http": "1.13.0",
    "@typespec/openapi": "1.13.0",
    "@typespec/openapi3": "1.13.0",
    "@typespec/rest": "0.83.0",
    "@typespec/sse": "0.83.0",
    "@typespec/streams": "0.83.0",
    "@typespec/versioning": "0.83.0",
    "@typespec/xml": "0.83.0",
    "revapi-ignore-emitter": "file:$EMITTER_DIR"
  },
  "overrides": {
    "@typespec/asset-emitter": "0.79.1"
  }
}
JSON

echo "Building the emitter ..."
(cd "$EMITTER_DIR" && npm run build)

echo "Installing TypeSpec libraries and linking the emitter into $FOUNDRY_DIR/node_modules ..."
(cd "$FOUNDRY_DIR" && npm install)

# Keep node_modules (gitignored); remove the temp manifest so git stays clean.
rm -f "$TMP_MANIFEST" "$FOUNDRY_DIR/package-lock.json"

echo "Done. Foundry spec libraries are installed and 'revapi-ignore-emitter' is linked."
echo "You can now use: --emit revapi-ignore-emitter"
