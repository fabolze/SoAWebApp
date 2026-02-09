export type PresetApplyMode = 'fill_empty' | 'merge' | 'overwrite';

export interface EntityPreset {
  id: string;
  label: string;
  description?: string;
  tags?: string[];
  defaultMode?: PresetApplyMode;
  data: Record<string, any>;
}

export interface PresetScope {
  schema: string;
  presets: EntityPreset[];
}
