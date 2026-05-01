import type { PresetScope } from './types';

export const statusesPresets: PresetScope = {
  schema: 'statuses',
  presets: [
    {
      id: 'status-damage-over-time',
      label: 'Status: Damage Over Time',
      description: 'Stackable harmful status scaffold for poison, burn, or bleed effects.',
      category: 'Mechanics',
      intent: 'debuff',
      difficulty: 'starter',
      tags: ['status', 'damage_over_time'],
      defaultMode: 'fill_empty',
      data: {
        category: 'DoT',
        description: 'Deals recurring damage while active.',
        default_duration: 4,
        stackable: true,
        max_stacks: 3,
        tags: ['debuff', 'dot'],
      },
    },
    {
      id: 'status-buff-temporary',
      label: 'Status: Temporary Buff',
      description: 'Positive timed status for combat or exploration bonuses.',
      category: 'Mechanics',
      intent: 'buff',
      difficulty: 'starter',
      tags: ['status', 'buff'],
      defaultMode: 'fill_empty',
      data: {
        category: 'Buff',
        description: 'Temporarily improves a character capability.',
        default_duration: 5,
        stackable: false,
        max_stacks: 1,
        tags: ['buff', 'temporary'],
      },
    },
  ],
};
