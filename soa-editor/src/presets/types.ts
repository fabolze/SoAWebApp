import type { UnknownRecord } from "../types/common";

export type PresetApplyMode = 'fill_empty' | 'merge' | 'overwrite';

export interface EntityPreset {
  id: string;
  label: string;
  description?: string;
  tags?: string[];
  category?: string;
  intent?: string;
  difficulty?: 'starter' | 'intermediate' | 'advanced';
  schema?: string;
  recommendedMode?: PresetApplyMode;
  fieldGroups?: Record<string, string[]>;
  source?: 'curated' | 'custom';
  createdAt?: number;
  updatedAt?: number;
  defaultMode?: PresetApplyMode;
  scope?: 'entry' | 'bundle' | 'row';
  outputKind?: 'patch' | 'bundle';
  requiredContext?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  createsReferences?: boolean;
  estimatedEntities?: number;
  data: UnknownRecord;
}

export interface PresetScope {
  schema: string;
  presets: EntityPreset[];
}
