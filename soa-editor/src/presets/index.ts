import { abilitiesPresets } from './abilities';
import { charactersPresets } from './characters';
import { combatProfilesPresets } from './combatProfiles';
import { dialoguesPresets } from './dialogues';
import { dialogueNodesPresets } from './dialogueNodes';
import { effectsPresets } from './effects';
import { encountersPresets } from './encounters';
import { itemsPresets } from './items';
import { questsPresets } from './quests';
import { requirementsPresets } from './requirements';
import { shopsPresets } from './shops';
import { statusesPresets } from './statuses';
import { storyArcsPresets } from './storyArcs';
import { talentNodesPresets } from './talentNodes';
import {
  combatProfileElitePreset,
  eliteEncounterPreset,
  npcVendorPreset,
  questStarterPreset,
  statusComboPreset,
  themedShopPreset,
} from './rpgRecipes';
import {
  fantasyAbilityPresets,
  fantasyEncounterPresets,
  fantasyItemPresets,
  fantasyQuestPresets,
  fantasyWorldPresets,
} from './fantasyRpg';
import type { EntityPreset, PresetScope } from './types';

const presetScopes: PresetScope[] = [
  abilitiesPresets,
  effectsPresets,
  statusesPresets,
  itemsPresets,
  dialogueNodesPresets,
  dialoguesPresets,
  charactersPresets,
  combatProfilesPresets,
  encountersPresets,
  questsPresets,
  requirementsPresets,
  shopsPresets,
  storyArcsPresets,
  talentNodesPresets,
  fantasyAbilityPresets,
  fantasyItemPresets,
  fantasyQuestPresets,
  fantasyEncounterPresets,
  ...fantasyWorldPresets,
  npcVendorPreset,
  questStarterPreset,
  eliteEncounterPreset,
  combatProfileElitePreset,
  statusComboPreset,
  themedShopPreset,
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
