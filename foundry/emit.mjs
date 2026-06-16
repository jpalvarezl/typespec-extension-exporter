#!/usr/bin/env node
// Cross-platform Foundry emit helper. Replaces the old bash setup + emit
// scripts. It builds this emitter, makes it resolvable inside the Foundry spec
// tree, and runs it against each Java SDK project's `client.tsp`.
//
// The emit/options for this emitter live in each project's own
// `tspconfig.yaml` in the spec repo, so we only pass `--emit` here; the shape,
// format, output file name, keys and java-namespace come from that config.
//
// Usage:
//   node foundry/emit.mjs                       # both projects -> foundry/tsp-output/<project>/
//   node foundry/emit.mjs agents                # one project
//   node foundry/emit.mjs agents projects
//
//   # Write straight into a Java SDK module's customizations/ folder (where the
//   # @Beta customization reads beta-annotations.csv):
//   node foundry/emit.mjs agents \
//     --agents-out /path/to/azure-sdk-for-java/sdk/ai/azure-ai-agents/customizations
//
// The Foundry directory comes from FOUNDRY_DIR or `--foundry-dir <path>`; it
// must contain `src/sdk-java-azure-ai-<project>/client.tsp`.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EMITTER_NAME = "typespec-extension-exporter";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROJECTS = {
  agents: "sdk-java-azure-ai-agents",
  projects: "sdk-java-azure-ai-projects",
};

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Parse argv into selected projects, Foundry dir, and per-project output dirs. */
function parseArgs(argv) {
  const selected = [];
  const outDirs = {};
  let foundryDir = process.env.FOUNDRY_DIR;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--foundry-dir") {
      foundryDir = argv[++i];
      if (foundryDir === undefined) {
        fail(
          "--foundry-dir requires a path, e.g. --foundry-dir /path/to/Foundry.",
        );
      }
    } else if (arg in PROJECTS) {
      selected.push(arg);
    } else {
      const outMatch = /^--(\w+)-out$/.exec(arg);
      if (outMatch && outMatch[1] in PROJECTS) {
        const value = argv[++i];
        if (value === undefined) {
          fail(
            `${arg} requires a directory, e.g. ${arg} /path/to/customizations.`,
          );
        }
        outDirs[outMatch[1]] = value;
      } else {
        fail(
          `unknown argument '${arg}'. Expected: ${Object.keys(PROJECTS).join(", ")}, ` +
            `--<project>-out <dir>, or --foundry-dir <path>.`,
        );
      }
    }
  }
  return {
    projects: selected.length > 0 ? selected : Object.keys(PROJECTS),
    foundryDir,
    outDirs,
  };
}

/** Walk up from `start` to the first directory holding the TypeSpec compiler. */
function findSpecNodeModules(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "node_modules", "@typespec", "compiler"))) {
      return join(dir, "node_modules");
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    fail(`command failed (${result.status}): ${command} ${args.join(" ")}`);
  }
}

const { projects, foundryDir, outDirs } = parseArgs(process.argv.slice(2));

if (!foundryDir) {
  fail(
    "Foundry directory not set. Use FOUNDRY_DIR=<path> or --foundry-dir <path>.",
  );
}
const foundry = resolve(foundryDir);
if (!existsSync(join(foundry, "src"))) {
  fail(`'${foundry}' does not look like a Foundry directory (no src/).`);
}

// 1. Build the emitter so the copy below reflects the latest source. We invoke
//    the local TypeScript compiler directly (not via `npm`) so no shell is
//    needed and argument handling stays safe across platforms.
console.log("Building the emitter ...");
run(
  process.execPath,
  [join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "."],
  {
    cwd: repoRoot,
  },
);

// 2. Make the emitter resolvable inside the spec tree. We copy dist +
//    package.json (no node_modules) so the emitter resolves @typespec/* and
//    yaml from the spec repo itself — matching the versions the spec compiles
//    with and avoiding "multiple versions" warnings.
const specNodeModules = findSpecNodeModules(foundry);
if (!specNodeModules) {
  fail(
    `Could not find a node_modules with @typespec/compiler above '${foundry}'. ` +
      "Install the spec's dependencies first.",
  );
}
// The emitter imports `yaml` at runtime but we deliberately don't copy nested
// node_modules, so it must be resolvable from the spec tree. Check up front so a
// missing dependency fails with an actionable hint instead of a module-not-found
// error deep inside `tsp compile`.
if (!existsSync(join(specNodeModules, "yaml"))) {
  fail(
    `'yaml' is not installed in ${specNodeModules}. The emitter needs it at ` +
      "runtime. Install it there (e.g. `npm install --no-save yaml`) and retry.",
  );
}
const emitterDest = join(specNodeModules, EMITTER_NAME);
console.log(`Linking emitter into ${emitterDest} ...`);
rmSync(emitterDest, { recursive: true, force: true });
cpSync(join(repoRoot, "dist"), join(emitterDest, "dist"), { recursive: true });
cpSync(join(repoRoot, "package.json"), join(emitterDest, "package.json"));

// 3. Resolve the spec's own tsp CLI so the compiler version matches the spec.
const specTsp = join(specNodeModules, "@typespec", "compiler", "cmd", "tsp.js");
if (!existsSync(specTsp)) {
  fail(`Could not find the TypeSpec CLI at ${specTsp}.`);
}

// 4. Emit each requested project. `emitter-output-dir` is set to the target
//    directory so the file (beta-annotations.csv, per the spec's tspconfig)
//    lands there directly — no `typespec-extension-exporter/` subfolder. With
//    `--<project>-out`, that target is the Java module's customizations/ folder.
for (const project of projects) {
  const dir = PROJECTS[project];
  const entry = join(foundry, "src", dir, "client.tsp");
  if (!existsSync(entry)) {
    fail(`entry point not found: ${entry}`);
  }
  const target = outDirs[project]
    ? resolve(outDirs[project])
    : join(repoRoot, "foundry", "tsp-output", project);
  console.log(`\nEmitting ${project} -> ${target} ...`);
  run(process.execPath, [
    specTsp,
    "compile",
    entry,
    "--emit",
    EMITTER_NAME,
    "--option",
    `${EMITTER_NAME}.emitter-output-dir=${target}`,
  ]);
}

console.log(
  "\nDone. The Java SDK @Beta customization reads beta-annotations.csv from " +
    "<library-module>/customizations/.",
);
