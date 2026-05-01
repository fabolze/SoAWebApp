import type { PresetScope } from './types';

export const effectsPresets: PresetScope = {
  schema: 'effects',
  presets: [
    {
      id: 'effect-damage-flat',
      label: 'Effect: Flat Damage',
      description: 'Baseline direct damage payload for abilities or items.',
      category: 'Mechanics',
      intent: 'damage',
      difficulty: 'starter',
      tags: ['damage', 'combat'],
      defaultMode: 'fill_empty',
      data: {
        type: 'Damage',
        target: 'Enemy',
        value_type: 'Flat',
        value: 20,
        duration: 0,
        trigger_condition: 'None',
        stackable: false,
        description: 'Deals direct damage to the target.',
        tags: ['damage', 'direct'],
      },
    },
    {
      id: 'effect-status-control',
      label: 'Effect: Status Control',
      description: 'Status application scaffold with chance and duration.',
      category: 'Mechanics',
      intent: 'control',
      difficulty: 'intermediate',
      tags: ['status', 'control'],
      defaultMode: 'fill_empty',
      data: {
        type: 'Status',
        target: 'Enemy',
        value_type: 'None',
        duration: 3,
        apply_chance: 75,
        trigger_condition: 'On Cast',
        stackable: false,
        description: 'Applies a control status for a limited duration.',
        tags: ['status', 'control'],
      },
    },
  ],
};
