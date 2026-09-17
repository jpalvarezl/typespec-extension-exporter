# Output shapes and formats

This emitter has four semantic **output shapes** (`output-shape`) and three
serialization **formats** (`output-format`). The shape decides _what_ is
emitted; the format decides _how_ it is serialized. See the
[options reference](../README.md#options) for the full option list.

## `raw` (default)

Every `@extension` decorator occurrence across the compiled program, with its
source location. Useful for discovery and ad-hoc inspection.

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

Each occurrence records the extension `key` and `value`, the target's `kind`
and fully-qualified `name`, the containing `namespace`, and the exact
`file`/`line`/`column` of the decorator.

`raw` mode honours the `kinds` filter (it walks the TypeSpec type graph). For
example, to emit only models and fields:

```bash
tsp compile <path> --emit typespec-extension-exporter \
  --option "typespec-extension-exporter.kinds=model,field"
```

## SDK output modes (`revapi`, `tsp-ast-input`, and `list`)

All SDK output modes build a TypeSpec Client Generator Core (TCGC) SDK model and
name discovered beta entities from that model. Explicit `manual-entries` are
then merged into the output. The Java-oriented shapes (`revapi` and
`tsp-ast-input`) always use the Java TCGC scope because their payloads target
Java revapi and Java AST customization consumers. The language-neutral `list`
shape uses the required `language` option (`java`, `csharp`, or a raw emitter
name) so language-scoped customizations apply. SDK output modes require
`language` to be set explicitly; missing or blank `language` is a compiler
error.

- `@clientName` / `@@clientName(..., "<lang>")` renames are applied according to
  the selected TCGC scope.
- The public/internal `access` decides the `models` vs `implementation.models`
  subpackage for `revapi`/`tsp-ast-input`; `list` uses no subpackage.
- SDK models without a namespace (such as synthetic request bodies) are
  skipped. This is not a blanket exclusion of anonymous TypeSpec models:
  some inline models become named, namespaced generated SDK classes.

The base namespace/package is taken from TCGC's resolved client namespace, or
overridden with the `namespace` option. See the
[SDK-output options](../README.md#sdk-output-options-used-when-output-shape-is-revapi-tsp-ast-input-or-list).

### Manual entries and anonymous models

All three SDK output shapes accept the same comma-separated string:

```yaml
manual-entries: "FooBar,OtherModel::baz,com.example.implementation.models.Hidden"
```

A plain class name adds a `class` target; `Class::member` adds a `field`
target. These are the two supported target types, not additional CSV columns.
Use exact generated SDK names. Manual entries are not passed through TCGC
renaming and are not checked against generated source files.

Short names require a non-blank explicit `namespace`, even if automatic
discovery can obtain a namespace from TCGC. For `revapi` and `tsp-ast-input`,
short names use that namespace and `models-subpackage` (default `models`).
For `list`, they use only the namespace. Any dot-qualified class name is
treated as an absolute FQN; no namespace or subpackage is added or replaced.
Use a full FQN for internal classes or targets outside the default package,
not a relative name such as `models.FooBar`.

Leading/trailing whitespace and empty comma segments are ignored, including
whitespace around `::`. Omitted or empty input changes nothing. Malformed
references, missing namespaces for short names, and non-empty manual entries
with `raw` produce compiler errors and no output. YAML lists/objects are not
accepted; method signatures, wildcards, and additional `::` segments are not
part of this syntax.

Manual entries are explicit additions, independent of `keys` and `kinds`.
They share the existing sort/deduplication logic and use `justification`
(default `Preview API.`) for Java outputs. When a manual target matches a
discovered target, its discovered preview keys are retained. New manual
targets have no inferred preview keys. An explicitly requested field remains
present even when its class has an entry; only automatic discovery omits
fields of an already-beta container.

For example, Java may emit a distinct `FooBar` class for an inline model:

```tsp
model Foo {
  bar: {
    baz: string;
  };
}
```

Adding `manual-entries: "FooBar"` includes that class without depending on the
emitter discovering metadata on the inline type. This option does not infer
the name or propagate beta metadata from the parent model.

When you can change the spec, a named model with explicit metadata avoids
depending on generated anonymous-type naming conventions:

```tsp
@extension("x-ms-foundry-meta", #{ required_previews: #["Example=V1Preview"] })
model FooBar {
  baz: string;
}

model Foo {
  bar: FooBar;
}
```

The emitter can then use the named model's TCGC name and extension metadata.
Otherwise, keep manual entries aligned with Java code generation when the
spec or generator changes. Automatic anonymous-type inference is not part
of this feature.

### `revapi`

A [revapi `differences`](https://revapi.org/revapi-basic-features/0.13.1/differences.html)
ignore list. Each beta entity becomes an ignore entry whose `code` is the regex
`java\..*` (so any breaking change on the matched element is ignored) and whose
`old` is a strict regex matching the entity's Java fully-qualified name —
anchored with a word boundary and a trailing negative look-ahead so it never
matches a longer name that merely shares the same prefix:

```json
{
  "ignore": true,
  "regex": true,
  "code": "java\\..*",
  "old": ".*\\bcom\\.azure\\.ai\\.agents\\.models\\.AgentDefinition(?![\\w$]).*",
  "justification": "Preview API. HostedAgents=V1Preview"
}
```

- Type-level entities (models, enums, unions) match their own class/enum name.
- Beta properties on a non-beta model match that model's accessors
  (`...Model::(get|set|is|with)?PropertyName`).
- Automatically discovered properties on a model that is itself beta are
  omitted as redundant; explicit manual field targets are retained.

### `tsp-ast-input`

Annotation-insertion requests for a later AST customization step (this is what
the Azure Java SDK's `@Beta` customization consumes as
`beta-annotations.csv`). Type-level entities become `class` entries, and beta
properties on non-beta models become `field` entries whose `member_name` is the
generated Java member name from TCGC. Manual field targets use the supplied
member name verbatim:

```json
{
  "type": "field",
  "class_name": "com.azure.ai.projects.models.CodeBasedEvaluatorDefinition",
  "annotation_description": "Preview API. Evaluators=V1Preview",
  "member_name": "blobUrl"
}
```

The `annotation_description` starts from the `justification` option (default
`Preview API.`) and appends the gating preview feature keys parsed from the
`@extension` value's `required_previews`/`conditional_previews` arrays.

### `list`

The beta `class`/`field` entries collapsed by type into two sorted,
de-duplicated lists. Its CSV serialization is the same data flattened back to
`type;name` rows — language neutral, so set `language` explicitly:

- `class` — generated-SDK FQNs of the **type-level** beta entities (models,
  enums, unions).
- `field` — beta **properties** declared on a non-beta container, as
  `<ContainerFqn>::<propertyName>`. Properties of an already-beta container are
  omitted during automatic discovery (covered by its `class` entry), exactly
  like `revapi`/`tsp-ast-input`. Explicit manual field targets are retained.

Unlike `revapi`/`tsp-ast-input`, the FQN is just `namespace + "." + name` (no
`models`/`implementation.models` subpackage):

```yaml
class:
  - Azure.AI.Projects.Agents.AgentDefinition
  - Azure.AI.Projects.Agents.WorkflowAgentDefinition
field:
  - Azure.AI.Projects.Agents.SomeModel::someBetaProperty
```

(CSV serialization writes the same data flattened to `type;name` rows.)

For C# the namespace is resolved natively from the spec's `@clientNamespace`
via the csharp TCGC scope, so no `namespace` override is needed; for Java the
package usually comes from the `typespec-java` emitter's `namespace` option, so
set `namespace` to match.

## Serialization formats

`output-format` controls serialization for any shape:

| Format | Notes                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `json` | Default. Pretty-printed with two-space indentation.                                                                                                     |
| `yaml` | Standard YAML.                                                                                                                                          |
| `csv`  | Uses `;` as the delimiter. Object/array cell values are JSON-encoded and quoted; values containing `"`, `;`, or newlines are quoted with `""` escaping. |

The default output file name follows the shape and format:
`extensions.<format>` (raw), `revapi.<format>` (revapi),
`tsp-ast-input.<format>` (tsp-ast-input), or `list.<format>`
(list). Override it with `output-file`, or redirect the whole output
directory with the built-in `emitter-output-dir` option.
