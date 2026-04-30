import type { PresetScope } from './types';

export const shopsPresets: PresetScope = {
  schema: 'shops',
  presets: [
    {
      id: 'shop-general-goods',
      label: 'Shop: General Goods',
      description: 'Baseline merchant shop with neutral pricing.',
      category: 'Economy',
      intent: 'merchant',
      difficulty: 'starter',
      tags: ['shop', 'merchant'],
      defaultMode: 'fill_empty',
      data: {
        description: 'A general-purpose merchant selling common supplies.',
        base_price_modifier: 0,
        base_price_multiplier: 1,
        inventory: [],
        price_modifiers: [],
        tags: ['shop', 'general_goods'],
      },
    },
    {
      id: 'shop-faction-specialist',
      label: 'Shop: Faction Specialist',
      description: 'Specialized shop scaffold intended for gated faction inventory.',
      category: 'Economy',
      intent: 'faction_shop',
      difficulty: 'intermediate',
      tags: ['shop', 'faction'],
      defaultMode: 'fill_empty',
      data: {
        description: 'A specialist vendor with inventory gated by progression or reputation.',
        base_price_modifier: 0,
        base_price_multiplier: 1.15,
        inventory: [],
        price_modifiers: [],
        tags: ['shop', 'faction', 'specialist'],
      },
    },
  ],
};
