import type { PresetScope } from './types';

export const itemsPresets: PresetScope = {
  schema: 'items',
  presets: [
    {
      id: 'item-weapon-common-melee',
      label: 'Weapon: Common Melee',
      description: 'Starter melee weapon with baseline values.',
      tags: ['equipment', 'weapon'],
      defaultMode: 'fill_empty',
      data: {
        type: 'Weapon',
        rarity: 'Common',
        equipment_slot: 'main_hand',
        weapon_range_type: 'melee',
        weapon_range: 1,
        damage_type: 'Slashing',
        base_price: 100,
        description: 'A reliable starter weapon.',
        tags: ['weapon', 'starter'],
      },
    },
    {
      id: 'item-consumable-heal',
      label: 'Consumable: Heal',
      description: 'Baseline consumable item setup.',
      tags: ['consumable', 'utility'],
      defaultMode: 'fill_empty',
      data: {
        type: 'Consumable',
        rarity: 'Common',
        base_price: 35,
        description: 'Consumable item that restores health.',
        effects: [],
        tags: ['consumable', 'healing'],
      },
    },
  ],
};
