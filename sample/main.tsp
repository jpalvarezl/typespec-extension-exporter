import "@typespec/openapi";

using OpenAPI;

@service(#{ title: "Sample" })
namespace Sample;

@extension("x-model-tag", "widget")
model Widget {
  @extension("x-field-tag", "the-id")
  id: string;

  name: string;
}

@extension("x-op-tag", #{ team: "core" })
op getWidget(): Widget;

@extension("x-enum-tag", "colors")
enum Color {
  red,
  green,
}
