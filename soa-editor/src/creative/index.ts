import { creativeScopes } from "./generators";
import type { CreativeInput, CreativeSuggestion } from "./types";
import { asRecord, type UnknownRecord } from "../types/common";

function matchesSchema(schemaName: string, scopeSchema: string): boolean {
  if (scopeSchema === "*") return true;
  if (scopeSchema.endsWith("*")) {
    return schemaName.startsWith(scopeSchema.slice(0, -1));
  }
  return schemaName === scopeSchema;
}

function filterPatchBySchema(patch: UnknownRecord, schema: unknown): UnknownRecord {
  const schemaRecord = asRecord(schema);
  const properties = asRecord(schemaRecord.properties);
  if (Object.keys(properties).length === 0) return patch;
  const out: UnknownRecord = {};
  for (const [key, value] of Object.entries(asRecord(patch))) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      out[key] = value;
    }
  }
  return out;
}

export function generateCreativeSuggestions(input: CreativeInput): CreativeSuggestion[] {
  const schemaName = (input.schemaName || "").trim();
  const matching = creativeScopes.filter((scope) => matchesSchema(schemaName, scope.schema));
  const selected =
    matching.find((scope) => scope.schema === schemaName) ||
    matching.find((scope) => scope.schema.endsWith("*")) ||
    matching.find((scope) => scope.schema === "*");
  if (!selected) return [];

  const raw = selected.generate(input) || [];
  const limited = raw.slice(0, Math.max(1, Math.min(input.count, 8)));
  return limited.map((suggestion, idx) => ({
    ...suggestion,
    id: suggestion.id || `${schemaName}-creative-${idx}`,
    patch: filterPatchBySchema(asRecord(suggestion.patch), input.schema),
  }));
}

export * from "./types";
