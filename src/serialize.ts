import { stringify as stringifyYaml } from "yaml";
import type { OutputFormat, OutputShape } from "./types.js";

export function getDefaultOutputFile(
  shape: OutputShape,
  format: OutputFormat,
): string {
  const baseName =
    shape === "raw"
      ? "extensions"
      : shape === "revapi"
        ? "revapi"
        : "tsp-ast-input";
  const extension = format === "yaml" ? "yaml" : format;
  return `${baseName}.${extension}`;
}

function getCsvHeaders(shape: OutputShape): string[] {
  switch (shape) {
    case "raw":
      return [
        "key",
        "value",
        "targetKind",
        "targetName",
        "namespace",
        "file",
        "line",
        "column",
      ];
    case "revapi":
      return ["ignore", "regex", "code", "old", "justification"];
    case "tsp-ast-input":
      return ["type", "class_name", "annotation_description", "member_name"];
  }
}

export function stringifyCsvValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[";\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeCsv(payload: unknown, shape: OutputShape): string {
  const headers = getCsvHeaders(shape);
  const rows = Array.isArray(payload) ? payload : [];
  const lines = [headers.join(";")];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(
      headers.map((header) => stringifyCsvValue(record[header])).join(";"),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function serializePayload(
  payload: unknown,
  shape: OutputShape,
  format: OutputFormat,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(payload, null, 2);
    case "yaml":
      return stringifyYaml(payload);
    case "csv":
      return serializeCsv(payload, shape);
  }
}
