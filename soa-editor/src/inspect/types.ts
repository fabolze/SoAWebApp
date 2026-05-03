export interface ItemCurrencyView {
  id: string;
  slug?: string | null;
  name?: string | null;
  code?: string | null;
  symbol?: string | null;
  type?: string | null;
  decimal_precision?: number | null;
  is_premium?: boolean | null;
  icon_path?: string | null;
}

export interface ItemRequirementView {
  id: string;
  slug: string;
  tags: string[];
  required_flags: Array<{ id: string; flag_id: string }>;
  forbidden_flags: Array<{ id: string; flag_id: string }>;
  min_faction_reputation: Array<{ id: string; faction_id: string; min_value: number }>;
}

export interface ItemEffectView {
  id: string;
  slug: string;
  name: string;
  type?: string | null;
  description?: string | null;
  target?: string | null;
  duration?: number | null;
  value_type?: string | null;
  value?: number | null;
  trigger_condition?: string | null;
  icon_path?: string | null;
  tags: string[];
}

export interface ItemModifierView {
  id: string;
  kind: "stat" | "attribute";
  target_id: string;
  target_slug?: string | null;
  target_name?: string | null;
  value: number;
  value_type?: string | null;
  scaling?: string | null;
  notes?: string | null;
  order_index?: number | null;
}

export interface ItemPriceLayer {
  starting_price?: number;
  multiplier?: number;
  modifier?: number;
  override?: number | null;
  applied_override?: boolean;
  result_price?: number;
}

export interface ItemPricingView {
  currency_id?: string | null;
  buy_price: number;
  sell_price: number;
  breakdown: {
    base_price?: number;
    shop?: ItemPriceLayer | null;
    entry?: ItemPriceLayer | null;
    final_buy_price?: number;
    sell_ratio?: number;
  };
}

export interface ItemShopSource {
  shop_id: string;
  shop_slug?: string | null;
  shop_name: string;
  inventory_id: string;
  inventory_slug: string;
  stock?: number | null;
  requirements?: ItemRequirementView | null;
  currency?: ItemCurrencyView | null;
  pricing: ItemPricingView;
  price_layers: Record<string, unknown>;
  tags: string[];
}

export interface ItemInspectorViewModel {
  id: string;
  slug: string;
  name: string;
  type: string;
  rarity?: string | null;
  description?: string | null;
  base_price: number;
  base_currency?: ItemCurrencyView | null;
  equipment_slot?: string | null;
  weapon_type?: string | null;
  damage_type?: string | null;
  weapon_range_type?: string | null;
  weapon_range?: number | null;
  icon_path?: string | null;
  tags: string[];
  requirements?: ItemRequirementView | null;
  effects: ItemEffectView[];
  stat_modifiers: ItemModifierView[];
  attribute_modifiers: ItemModifierView[];
  shop_sources: ItemShopSource[];
}
