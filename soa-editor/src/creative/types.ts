import type { PresetApplyMode } from "../presets";
import type { UnknownRecord } from "../types/common";

export type CreativeTone = "neutral" | "heroic" | "dark" | "mystic" | "playful";

export interface CreativeInput {
  schemaName: string;
  schema?: UnknownRecord;
  currentData: UnknownRecord;
  theme: string;
  tone: CreativeTone;
  keywords: string[];
  count: number;
}

export interface CreativeSuggestion {
  id: string;
  title: string;
  summary: string;
  patch: UnknownRecord;
}

export interface CreativeGeneratorScope {
  schema: string;
  generate: (input: CreativeInput) => CreativeSuggestion[];
}

export interface CreativeApplyRequest {
  patch: UnknownRecord;
  mode: PresetApplyMode;
}
