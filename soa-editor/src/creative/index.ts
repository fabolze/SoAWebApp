import { creativeScopes } from "./generators";
import type { CreativeInput, CreativeSuggestion } from "./types";

function matchesSchema(schemaName: string, scopeSchema: string): boolean {
  if (scopeSchema === "*") return true;
  if (scopeSchema.endsWith("*")) {
    return schemaName.startsWith(scopeSchema.slice(0, -1));
  }
  return schemaName === scopeSchema;
}

function filterPatchBySchema(patch: Record<string, any>, schema: any): Record<string, any> {
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object") return patch;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (properties[key] !== undefined) {
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
    patch: filterPatchBySchema(suggestion.patch || {}, input.schema),
  }));
}

export * from "./types";
