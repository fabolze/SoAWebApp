import type { PresetScope } from './types';

export const dialogueNodesPresets: PresetScope = {
  schema: 'dialogue_nodes',
  presets: [
    {
      id: 'dialogue-node-greeting',
      label: 'Dialogue: Greeting',
      description: 'Simple opening node with one follow-up choice.',
      tags: ['story', 'npc', 'dialogue'],
      defaultMode: 'fill_empty',
      data: {
        speaker: 'NPC',
        text: 'Hello, traveler.',
        choices: [{ choice_text: 'Hello.', next_node_id: '' }],
        set_flags: [],
        tags: ['intro'],
      },
    },
  ],
};
