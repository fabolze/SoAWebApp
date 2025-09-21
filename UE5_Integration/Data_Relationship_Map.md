# Data Relationship Map

A narrative-focused JRPG in UE5 lives and dies by clean data links. Keep this sheet nearby while wiring Blueprint lookups or chasing missing references.

---

## Core Foundations
### Stats (`backend/app/models/m_stats.py`)
- **Key fields:** `id`, `slug`, `category`, `value_type`, `scaling_behavior`
- **Feeds:** Attribute-to-Stat links, Effects (`scaling_stat_id`), Items (`stat_*`), CharacterClass `base_stats` and `stat_growth`
- **Blueprint touchpoints:** Data subsystem cache, progression math, combat calculators

### Attributes (`m_attributes.py`)
- **Key fields:** `id`, `slug`, `value_type`, `scaling`
- **Feeds:** AttributeStatLink, AbilityScalingLink, Effects (`attribute_id`)
- **Blueprint touchpoints:** Attribute subsystem, ability math, character build UI

### Attribute-to-Stat Link (`m_attribute_stat_link.py`)
- **Key fields:** `attribute_id`, `stat_id`, `multiplier`
- **Feeds:** Derived stat calculations, level-up previews
- **Blueprint touchpoints:** Stat growth resolver, equipment preview widgets

### Content Packs (`m_content_packs.py`)
- **Key fields:** `slug`, `name`, `release_date`, `status`, `is_active`
- **Feeds:** Flags (`content_pack_id`), Story Arcs (`content_pack_id`), future pack-scoped gating for quests, encounters, items
- **Blueprint touchpoints:** Pack selection UI, DLC toggles, import validation for pack-assigned content

---

## Abilities and Effects
### Abilities (`m_abilities.py`)
- **Key fields:** `type`, `resource_cost`, `cooldown`, `trigger_condition`
- **References:** AbilityEffectLink, AbilityScalingLink
- **Blueprint touchpoints:** Combat ability executor, companion AI kits

### Ability-to-Effect Link (`m_abilities_links.py`)
- **Key fields:** `ability_id`, `effect_id`
- **Purpose:** Connects abilities to their payload Effects
- **Blueprint touchpoints:** Ability execution graphs

### Ability Scaling Link (`m_abilities_links.py`)
- **Key fields:** `ability_id`, `attribute_id`, `multiplier`
- **Purpose:** Drives ability scaling off character Attributes
- **Blueprint touchpoints:** Damage and heal formulas

### Effects (`m_effects.py`)
- **Key fields:** `type`, `target`, `value_type`, `attribute_id`, `scaling_stat_id`
- **References:** Attributes, Stats, related Items (JSON)
- **Blueprint touchpoints:** Buff and debuff system, combat log, status tracking

---

## Gear, Progression, and Economy
### Currencies (`m_currencies.py`)
- **Key fields:** `type`, `code`, `symbol`, `decimal_precision`, `is_premium`
- **Feeds:** Events `currency_rewards`, Quests `currency_rewards`, Encounter reward bundles (`rewards.currencies`), Enemies `currency_rewards`, Item base pricing, Shop and ShopInventory currency overrides
- **Blueprint touchpoints:** Player wallet/economy manager, reward pipelines, UI currency displays

### Items (`m_items.py`)
- **Key fields:** `type`, `rarity`, `equipment_slot`, `requirements_id`, `base_price`, `base_currency_id`
- **References:** Requirements, Currency (base price), effect payloads (JSON), stat overrides
- **Feeds:** Pricing helper derives canonical buy/sell values for every shop entry
- **Blueprint touchpoints:** Inventory and equipment UI, loot generation, shop displays

### Character Classes (`m_characterclasses.py`)
- **Key fields:** `role`, `base_stats`, `starting_abilities`
- **References:** Abilities, Stats, Attributes, Items
- **Blueprint touchpoints:** Player growth, enemy templates, companion setup

### Shops (`m_shops.py`)
- **Key fields:** `location_id`, `npc_id`, `requirements_id`, `price_modifier`, `price_multiplier`, `price_override`, `currency_id`
- **References:** Locations, NPCs, Requirements, Currencies
- **Blueprint touchpoints:** Shop registry, availability gating, pricing helper defaults

### Shop Inventory (`m_shop_inventory.py`)
- **Key fields:** `shop_id`, `item_id`, `requirements_id`, `price_modifier`, `price_multiplier`, `price_override`, `currency_id`
- **References:** Shops, Items, Requirements, Currencies
- **Blueprint touchpoints:** Shop UI item lists, pricing display, restock logic

---

## Characters, NPCs, and Dialogue
### NPCs (`m_npcs.py`)
- **Key fields:** `location_id`, `faction_id`, `dialogue_tree_id`, `inventory`, `available_quests`
- **References:** Locations, Factions, Dialogues, Quests, Items, Requirements
- **Blueprint touchpoints:** Dialogue spawner, shopkeeper logic, companion recruitment

### Dialogues (`m_dialogues.py`)
- **Key fields:** `npc_id`, `location_id`, `requirements_id`
- **References:** NPCs, Locations, Requirements, Dialogue Nodes
- **Blueprint touchpoints:** Dialogue manager, narrative triggers

### Dialogue Nodes (`m_dialogue_nodes.py`)
- **Key fields:** `dialogue_id`, `speaker`, `choices`, `set_flags`
- **References:** Requirements, Flags
- **Blueprint touchpoints:** Dialogue UI flow, branching selector

---

## World, Story, and Events
### Locations (`m_locations.py`)
- **Key fields:** `biome`, `level_range`, `encounters`
- **References:** Encounters, Lore, Events
- **Blueprint touchpoints:** World map, encounter picker, location registry

### Enemies (`m_enemies.py`)
- **Key fields:** `type`, `class_id`, `faction_id`, `loot_table`, `currency_rewards`, `reputation_rewards`, `xp_reward`
- **References:** CharacterClass, Faction, Abilities, Items, Quests, Currencies
- **Blueprint touchpoints:** Encounter builder, AI kits, loot and reward drops

### Encounters (`m_encounters.py`)
- **Key fields:** `encounter_type`, `enemy_ids`, `npc_ids`, `rewards` (xp, currencies, reputation, items, flags)
- **References:** Enemies, NPCs, Requirements, Currencies, Factions, Flags, Items
- **Blueprint touchpoints:** Encounter spawner, reward resolver, narrative event system

### Events (`m_events.py`)
- **Key fields:** `type`, `requirements_id`, `location_id`, `dialogue_id`, `encounter_id`, `item_rewards`, `xp_reward`, `currency_rewards`, `reputation_rewards`, `flags_set`, `next_event_id`
- **References:** Requirements, Locations, Dialogues, Encounters, Lore, Items, Currencies, Factions, Flags
- **Blueprint touchpoints:** World event sequencer, cutscene coordinator, reward dispatcher

### Lore Entries (`m_lore_entries.py`)
- **Key fields:** `title`, `text`, `location_id`, `timeline_id`
- **References:** Locations, Timelines, Story Arcs
- **Blueprint touchpoints:** Codex UI, narrative unlock checks

### Timelines (`m_timelines.py`)
- **Key fields:** `start_year`, `end_year`
- **References:** Story Arcs, Lore
- **Blueprint touchpoints:** Timeline UI, narrative context

### Story Arcs (`m_story_arcs.py`)
- **Key fields:** `type`, `content_pack_id`, `timeline_id`, `branching`, `required_flags`
- **References:** Content Packs, Timelines, Quests, Flags
- **Blueprint touchpoints:** Story manager, chapter selection, branching logic

### Quests (`m_quests.py`)
- **Key fields:** `story_arc_id`, `requirements_id`, `objectives`, `flags_set_on_completion`, `xp_reward`, `currency_rewards`, `reputation_rewards`, `item_rewards`
- **References:** Story Arcs, Requirements, Flags, Items, Currencies, Factions
- **Blueprint touchpoints:** Quest log, objective tracker, reward distribution

### Requirements (`m_requirements.py`)
- **Key fields:** `tags`
- **References:** RequirementRequiredFlag, RequirementForbiddenFlag, RequirementMinFactionReputation
- **Blueprint touchpoints:** Requirement evaluator used by quests, dialogues, shops, events

### Requirement Flag Links (`m_requirements.py` link tables)
- **Key fields:** `flag_id`, `faction_id`, `min_value`
- **References:** Flags, Factions
- **Blueprint touchpoints:** Requirement evaluator, faction reputation checks

### Flags (`m_flags.py`)
- **Key fields:** `flag_type`, `default_value`, `content_pack_id`
- **References:** Content Packs, set or read by dialogues, quests, events, items
- **Blueprint touchpoints:** Global flag service, save and load system

### Factions (`m_factions.py`)
- **Key fields:** `alignment`, `relationships`, `reputation_config`
- **References:** NPCs, Enemies, Requirements
- **Blueprint touchpoints:** Reputation system, dialogue checks, encounter reactions

---

## Quick Usage Tips
- Cross-check this sheet with `Blueprint_Systems.md` to see which managers should own each data lookup.
- Keep ULID-to-Struct helper maps handy inside Blueprints to avoid repeated DataTable queries.
- When validation fails, start with Requirements and Flags; they sit at the center of most gating logic.

