import type { PresetScope } from './types';

export const talentNodesPresets: PresetScope = {
  schema: 'talent_nodes',
  presets: [
    {
      id: 'talent-node-passive-stat',
      label: 'Talent Node: Passive Stat',
      description: 'Passive node scaffold for stat or attribute bonuses.',
      category: 'Progression',
      intent: 'passive_bonus',
      difficulty: 'starter',
      tags: ['talent', 'passive'],
      defaultMode: 'fill_empty',
      data: {
        node_type: 'Passive',
        description: 'Passive improvement that strengthens a core build direction.',
        max_rank: 1,
        point_cost: 1,
        granted_abilities: [],
        stat_modifiers: [],
        attribute_modifiers: [],
        position: { x: 0, y: 0 },
        tags: ['talent', 'passive'],
      },
    },
    {
      id: 'talent-node-keystone',
      label: 'Talent Node: Keystone',
      description: 'High-impact node scaffold for build-defining choices.',
      category: 'Progression',
      intent: 'keystone',
      difficulty: 'advanced',
      tags: ['talent', 'keystone'],
      defaultMode: 'fill_empty',
      data: {
        node_type: 'Keystone',
        description: 'Build-defining talent that changes how the character plays.',
        max_rank: 1,
        point_cost: 3,
        granted_abilities: [],
        stat_modifiers: [],
        attribute_modifiers: [],
        position: { x: 0, y: 0 },
        tags: ['talent', 'keystone'],
      },
    },
  ],
};
