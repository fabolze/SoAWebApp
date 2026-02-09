import type { PresetApplyMode } from "../presets";

export type CreativeTone = "neutral" | "heroic" | "dark" | "mystic" | "playful";

export interface CreativeInput {
  schemaName: string;
  schema?: any;
  currentData: Record<string, any>;
  theme: string;
  tone: CreativeTone;
  keywords: string[];
  count: number;
}

export interface CreativeSuggestion {
  id: string;
  title: string;
  summary: string;
  patch: Record<string, any>;
}

export interface CreativeGeneratorScope {
  schema: string;
  generate: (input: CreativeInput) => CreativeSuggestion[];
}

export interface CreativeApplyRequest {
  patch: Record<string, any>;
  mode: PresetApplyMode;
}
