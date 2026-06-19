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

## SDK output modes (`revapi`, `tsp-ast-input`, and `beta-classes`)

In all SDK output modes the emitter builds the TypeSpec Client Generator Core
(TCGC) SDK model the same way the target language emitter does, so each beta
entity is named exactly as it appears in the generated SDK. The `language`
option picks the TCGC emitter scope (`java` by default, `csharp`, or a raw
emitter name), so language-scoped customizations apply:

- `@clientName` / `@@clientName(..., "<lang>")` renames are applied.
- The public/internal `access` decides the `models` vs `implementation.models`
  subpackage (for `revapi`/`tsp-ast-input`; `beta-classes` uses no subpackage).
- Anonymous models (e.g. request bodies) have no distinct public type and
  are skipped — their beta members are covered by the named models they
  originate from.

The base namespace/package is taken from TCGC's resolved client namespace, or
overridden with the `namespace` option. See the
[SDK-output options](../README.md#sdk-output-options-used-when-output-shape-is-revapi-tsp-ast-input-or-beta-classes).

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
- Properties on a model that is itself beta are omitted as redundant.

### `tsp-ast-input`

Annotation-insertion requests for a later AST customization step (this is what
the Azure Java SDK's `@Beta` customization consumes as
`beta-annotations.csv`). Type-level entities become `class` entries, and beta
properties on non-beta models become `field` entries whose `member_name` is the
generated Java member name from TCGC:

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

### `beta-classes`

Two sorted, de-duplicated lists of beta entities named by their generated-SDK
fully-qualified name — language neutral, so pair it with `language`:

- `beta_classes` — the **type-level** beta entities (models, enums, unions).
- `beta_class_properties` — beta **properties** declared on a non-beta
  container, as `<ContainerFqn>::<propertyName>`. Properties of an
  already-beta container are omitted (covered by the container's class entry),
  exactly like `revapi`/`tsp-ast-input`.

Unlike `revapi`/`tsp-ast-input`, the FQN is just `namespace + "." + name` (no
`models`/`implementation.models` subpackage):

```yaml
beta_classes:
  - Azure.AI.Projects.Agents.AgentDefinition
  - Azure.AI.Projects.Agents.WorkflowAgentDefinition
beta_class_properties:
  - Azure.AI.Projects.Agents.SomeModel::someBetaProperty
```

(CSV serialization flattens these into `type;name` rows, with `type` of `class`
or `property`.)

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
`tsp-ast-input.<format>` (tsp-ast-input), or `beta-classes.<format>`
(beta-classes). Override it with `output-file`, or redirect the whole output
directory with the built-in `emitter-output-dir` option.
