import { apiFetch } from "../lib/api";
import type { StudioProvider, StudioProviderInput, StudioSuggestion } from "./types";

async function requestAi(input: StudioProviderInput, outputKind: "patch" | "bundle"): Promise<StudioSuggestion[]> {
  const response = await apiFetch("/api/authoring/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaName: input.schemaName,
      schema: input.schema,
      currentEntry: input.currentData,
      brief: input.brief,
      relationshipSummary: input.relationshipSummary,
      outputKind,
      count: input.count,
    }),
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null) as { suggestions?: StudioSuggestion[] } | null;
  return Array.isArray(payload?.suggestions) ? payload.suggestions : [];
}

export const backendAiStudioProvider: StudioProvider = {
  id: "backend-ai",
  label: "Backend AI",
  source: "ai",
  generatePatches: (input) => requestAi(input, "patch"),
  generateBundles: (input) => requestAi(input, "bundle"),
};
