import type { PresetScope } from './types';

export const encountersPresets: PresetScope = {
  schema: 'encounters',
  presets: [
    {
      id: 'encounter-combat-basic',
      label: 'Encounter: Basic Combat',
      description: 'Combat encounter scaffold with participant and reward slots ready.',
      category: 'Combat',
      intent: 'encounter',
      difficulty: 'starter',
      tags: ['combat', 'encounter'],
      defaultMode: 'fill_empty',
      data: {
        encounter_type: 'Combat',
        description: 'A direct combat encounter with configurable participants and rewards.',
        participants: [],
        rewards: { xp: 50, items: [], currencies: [], reputation: [], flags_set: [] },
        tags: ['combat', 'encounter'],
      },
    },
    {
      id: 'encounter-dialogue-branch',
      label: 'Encounter: Dialogue Branch',
      description: 'Non-combat encounter scaffold for story or faction moments.',
      category: 'Narrative',
      intent: 'dialogue',
      difficulty: 'starter',
      tags: ['dialogue', 'story'],
      defaultMode: 'fill_empty',
      data: {
        encounter_type: 'Dialogue',
        description: 'A dialogue-driven encounter that can set flags or lead into events.',
        participants: [],
        rewards: { xp: 0, items: [], currencies: [], reputation: [], flags_set: [] },
        tags: ['dialogue', 'branching'],
      },
    },
  ],
};
