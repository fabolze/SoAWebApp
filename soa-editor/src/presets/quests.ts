import type { PresetScope } from './types';

export const questsPresets: PresetScope = {
  schema: 'quests',
  presets: [
    {
      id: 'quest-main-objective',
      label: 'Quest: Main Objective',
      description: 'Core quest scaffold with one objective and completion reward slots.',
      category: 'Narrative',
      intent: 'main_quest',
      difficulty: 'starter',
      tags: ['quest', 'main'],
      defaultMode: 'fill_empty',
      data: {
        description: 'Main quest step that advances the story.',
        objectives: [{ objective_id: 'objective_1', description: 'Complete the primary objective.' }],
        flags_set_on_completion: [],
        xp_reward: 100,
        currency_rewards: [],
        reputation_rewards: [],
        item_rewards: [],
        tags: ['quest', 'main'],
      },
    },
    {
      id: 'quest-side-reward',
      label: 'Quest: Side Reward',
      description: 'Optional side quest scaffold focused on rewards and world flavor.',
      category: 'Narrative',
      intent: 'side_quest',
      difficulty: 'starter',
      tags: ['quest', 'side'],
      defaultMode: 'fill_empty',
      data: {
        description: 'Optional quest that adds local flavor and rewards exploration.',
        objectives: [{ objective_id: 'objective_1', description: 'Help a local character or resolve a small conflict.' }],
        flags_set_on_completion: [],
        xp_reward: 50,
        currency_rewards: [],
        reputation_rewards: [],
        item_rewards: [],
        tags: ['quest', 'side'],
      },
    },
  ],
};
