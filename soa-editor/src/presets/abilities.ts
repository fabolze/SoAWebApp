import type { PresetScope } from './types';

export const abilitiesPresets: PresetScope = {
  schema: 'abilities',
  presets: [
    {
      id: 'ability-active-basic-damage',
      label: 'Active: Basic Damage',
      description: 'Simple active ability with cost, cooldown and one scaling row.',
      tags: ['combat', 'starter'],
      defaultMode: 'fill_empty',
      data: {
        type: 'Active',
        targeting: 'Single',
        trigger_condition: 'On Use',
        damage_type_source: 'Weapon',
        resource_cost: 10,
        cooldown: 1,
        effects: [],
        scaling: [{ multiplier: 1.0 }],
        description: 'Deals damage to a single target.',
        tags: ['damage', 'single_target'],
      },
    },
    {
      id: 'ability-passive-proc',
      label: 'Passive: Proc',
      description: 'Passive setup for on-hit style procs.',
      tags: ['passive', 'proc'],
      defaultMode: 'fill_empty',
      data: {
        type: 'Passive',
        targeting: 'Self',
        trigger_condition: 'On Hit',
        damage_type_source: 'None',
        resource_cost: 0,
        cooldown: 0,
        effects: [],
        description: 'Passive effect that triggers on hit.',
        tags: ['passive', 'proc'],
      },
    },
  ],
};
