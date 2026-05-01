import type { PresetScope } from './types';

export const requirementsPresets: PresetScope = {
  schema: 'requirements',
  presets: [
    {
      id: 'requirement-flag-gate',
      label: 'Requirement: Flag Gate',
      description: 'Basic progression gate using required and forbidden flag slots.',
      category: 'Gating',
      intent: 'progression',
      difficulty: 'starter',
      tags: ['requirements', 'flags'],
      defaultMode: 'fill_empty',
      data: {
        required_flags: [],
        forbidden_flags: [],
        min_faction_reputation: [],
        tags: ['gate', 'flags'],
      },
    },
    {
      id: 'requirement-faction-reputation',
      label: 'Requirement: Faction Reputation',
      description: 'Faction reputation gate scaffold.',
      category: 'Gating',
      intent: 'faction',
      difficulty: 'intermediate',
      tags: ['requirements', 'faction'],
      defaultMode: 'fill_empty',
      data: {
        required_flags: [],
        forbidden_flags: [],
        min_faction_reputation: [],
        tags: ['gate', 'reputation'],
      },
    },
  ],
};
