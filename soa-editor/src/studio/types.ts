import type { CreativeTone } from "../creative";
import type { PresetApplyMode } from "../presets";
import type { UnknownRecord } from "../types/common";
import type { EntryRelationshipSummary } from "../relationships";

export type StudioMode = "recipes" | "composer" | "variants" | "fix" | "library";
export type StudioOutputKind = "patch" | "bundle";
export type StudioSource = "local" | "ai";
export type StudioRisk = "safe" | "needs_review" | "conflicts";

export interface StudioBrief {
  theme: string;
  tone: CreativeTone;
  keywords: string[];
  contentPackId?: string;
  locationId?: string;
  factionId?: string;
  questId?: string;
  playerLevel: number;
  stakes: "low" | "medium" | "high";
  rewardStyle: "none" | "modest" | "generous" | "rare";
  difficulty: "early" | "standard" | "elite" | "boss";
  intensity: number;
}

export interface StudioPatch {
  title: string;
  summary?: string;
  patch: UnknownRecord;
  mode: PresetApplyMode;
  source: StudioSource;
  risk: StudioRisk;
}

export interface StudioBundleEntry {
  schemaName: string;
  apiPath: string;
  routePath: string;
  tempId: string;
  label: string;
  data: UnknownRecord;
  dependsOn?: string[];
  warnings?: string[];
}

export interface StudioBundle {
  id: string;
  title: string;
  summary?: string;
  source: StudioSource;
  risk: StudioRisk;
  entries: StudioBundleEntry[];
  warnings?: string[];
}

export interface StudioSuggestion {
  id: string;
  title: string;
  summary?: string;
  outputKind: StudioOutputKind;
  source: StudioSource;
  risk: StudioRisk;
  patch?: StudioPatch;
  bundle?: StudioBundle;
  tags?: string[];
}

export interface StudioProviderInput {
  schemaName: string;
  schema: UnknownRecord;
  currentData: UnknownRecord;
  brief: StudioBrief;
  count: number;
  relationshipSummary?: EntryRelationshipSummary | null;
}

export interface StudioProvider {
  id: string;
  label: string;
  source: StudioSource;
  generatePatches: (input: StudioProviderInput) => Promise<StudioSuggestion[]> | StudioSuggestion[];
  generateBundles: (input: StudioProviderInput) => Promise<StudioSuggestion[]> | StudioSuggestion[];
}

export interface StudioApplyPlan {
  selectedPatchIds: string[];
  selectedBundleEntryIds: string[];
  warnings: string[];
  conflicts: string[];
}
