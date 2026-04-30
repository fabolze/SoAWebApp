import type { PresetScope } from './types';

export const combatProfilesPresets: PresetScope = {
  schema: 'combat_profiles',
  presets: [
    {
      id: 'combat-profile-basic-hostile',
      label: 'Combat Profile: Basic Hostile',
      description: 'Simple enemy profile with neutral rewards and no special loadout.',
      category: 'Combat',
      intent: 'enemy',
      difficulty: 'starter',
      tags: ['enemy', 'starter'],
      defaultMode: 'fill_empty',
      data: {
        enemy_type: 'humanoid',
        aggression: 'Hostile',
        custom_stats: [],
        custom_abilities: [],
        loot_table: [],
        currency_rewards: [],
        reputation_rewards: [],
        xp_reward: 25,
        tags: ['enemy', 'hostile'],
      },
    },
    {
      id: 'combat-profile-boss-reward',
      label: 'Combat Profile: Boss Reward',
      description: 'Boss-style profile with higher XP and reward hooks.',
      category: 'Combat',
      intent: 'boss',
      difficulty: 'advanced',
      tags: ['boss', 'reward'],
      defaultMode: 'fill_empty',
      data: {
        enemy_type: 'boss',
        aggression: 'Hostile',
        custom_stats: [],
        custom_abilities: [],
        loot_table: [],
        currency_rewards: [],
        reputation_rewards: [],
        xp_reward: 250,
        tags: ['boss', 'elite', 'reward'],
      },
    },
  ],
};
