import { abilitiesPresets } from './abilities';
import { charactersPresets } from './characters';
import { dialoguesPresets } from './dialogues';
import { dialogueNodesPresets } from './dialogueNodes';
import { itemsPresets } from './items';
import { storyArcsPresets } from './storyArcs';
import type { EntityPreset, PresetScope } from './types';

const presetScopes: PresetScope[] = [
  abilitiesPresets,
  itemsPresets,
  dialogueNodesPresets,
  dialoguesPresets,
  charactersPresets,
  storyArcsPresets,
  // Wildcard examples for future expansion:
  // { schema: 'story_*', presets: [...] },
  // { schema: 'npc_*', presets: [...] },
];

function matchesScope(schemaName: string, scopeSchema: string): boolean {
  if (scopeSchema.endsWith('*')) {
    return schemaName.startsWith(scopeSchema.slice(0, -1));
  }
  return schemaName === scopeSchema;
}

export function getPresetsForSchema(schemaName: string): EntityPreset[] {
  const normalized = (schemaName || '').trim();
  if (!normalized) return [];

  const exact: EntityPreset[] = [];
  const wildcard: EntityPreset[] = [];
  for (const scope of presetScopes) {
    if (!matchesScope(normalized, scope.schema)) continue;
    if (scope.schema.endsWith('*')) {
      wildcard.push(...scope.presets);
    } else {
      exact.push(...scope.presets);
    }
  }

  const deduped = new Map<string, EntityPreset>();
  [...exact, ...wildcard].forEach((preset) => {
    const key = preset.id || preset.label;
    if (!deduped.has(key)) deduped.set(key, preset);
  });
  return [...deduped.values()];
}

export * from './types';
