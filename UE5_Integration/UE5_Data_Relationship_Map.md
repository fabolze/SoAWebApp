# Data Relationship Map

Keep this sheet open while authoring DataTables or wiring Blueprint lookups. It highlights which backend tables feed each UE system and surfaces the most common cross-links to validate during imports.

---

## Core Foundations
### Stats (`backend/app/models/m_stats.py`)
- **Key fields:** `id`, `slug`, `category`, `value_type`, `scaling_behavior`.
- **Feeds:** Attribute-to-Stat links, Effects (`scaling_stat_id`), Item Stat Modifiers, CharacterClass `base_stats` or `stat_growth`, combat formula coefficients.
- **Blueprint owners:** `BP_GameDataSubsystem` cache, `BP_LevelProgressionComponent`, `BP_CombatFormulaLibrary`.

### Attributes (`m_attributes.py`)
- **Key fields:** `id`, `slug`, `value_type`, `scaling`.
- **Feeds:** AttributeStatLink, AbilityScalingLink, Item Attribute Modifiers, Effects (`attribute_id`), dialogue or stat checks.
- **Blueprint owners:** Attribute resolver inside `BP_GameDataSubsystem`, `BP_EffectResolver`, character sheet UI.

### Attribute-to-Stat Link (`m_attribute_stat_link.py`)
- **Purpose:** Converts Attribute gains into derived Stat bonuses.
- **Blueprint owners:** `BP_LevelProgressionComponent`, equipment preview widgets.

### Content Packs (`m_content_packs.py`)
- **Feeds:** Flags, Story Arcs, Quests, Events, Routes (optional gating), Items, Encounters.
- **Blueprint owners:** `BP_ContentPackRegistry`, gating logic in Story, Shop, Encounter, Route systems.

---

## Abilities and Effects
### Abilities (`m_abilities.py`)
- **Key fields:** `damage_type_source`, `damage_type`.
- **References:** AbilityEffectLink, AbilityScalingLink, Items (imbued abilities), Character Classes (starting kits).
- **Blueprint owners:** `BP_EncounterDirector` (loadout assembly), `BP_CombatComponent`, `BP_AbleAbilityComponent`, `BP_TargetingComponent`, `BP_EnemyBrain`.

### Ability-to-Effect Link (`m_abilities_links.py`)
- **Purpose:** Connects abilities to payload Effects.
- **Blueprint owners:** `BP_EffectResolver`, combat log.

### Ability Scaling Link (`m_abilities_links.py`)
- **Purpose:** Ties abilities to Attributes with multipliers.
- **Blueprint owners:** Damage or heal formulas in `BP_CombatFormulaLibrary`.

### Effects (`m_effects.py`)
- **Key fields:** `type`, `target`, `value_type`, `attribute_id`, `scaling_stat_id`, `duration`, `stackable`, `status_id`, `apply_chance`.
- **Blueprint owners:** `BP_EffectResolver`, `BP_StatusComponent`, requirement or dialogue side-effects.

### Statuses (`m_statuses.py`)
- **Key fields:** `category`, `default_duration`, `stackable`, `max_stacks`.
- **Blueprint owners:** `BP_StatusComponent`, `BP_EffectResolver`, combat UI overlays.

---

## Items, Economy and Progression
### Currencies (`m_currencies.py`)
- **Feeds:** Quest or Encounter rewards, Shop pricing, Events, Loot tables.
- **Blueprint owners:** `BP_CurrencyManager`, `BP_PricingHelper` (Blueprint wrapper around `backend/app/utils/pricing.py`), reward distribution in Events and Encounters.

### Items (`m_items.py`)
- **References:** Requirements, Currency, embedded Effect payloads, Item modifiers.
- **Feeds:** Shops, Rewards, Loot tables, Dialogue gifts, Starting gear.
- **Blueprint owners:** `BP_ItemManager`, inventory UI, loot popups.

### Item Stat Modifiers (`m_items.py`)
- **Purpose:** Adds stat bonuses via equipment.
- **Blueprint owners:** Equipment resolver in `BP_ItemManager`, character sheet preview.

### Item Attribute Modifiers (`m_items.py`)
- **Purpose:** Adds attribute bonuses or penalties.
- **Blueprint owners:** Same as above; feed progression and combat formulas.

### Character Classes (`m_characterclasses.py`)
- **References:** Stats, Abilities, Items, Attributes.
- **Blueprint owners:** `BP_EncounterDirector`, `BP_LevelProgressionComponent`, companion setup.

### Talent Trees / Nodes (`m_talent_trees.py`)
- **References:** Character Classes (optional), Requirements, Abilities, Stats, Attributes.
- **Feeds:** Player talent progression, passive stat/attribute modifiers, learned abilities.
- **Blueprint owners:** `BP_TalentManager`, character sheet UI, skillbook.

### Shops (`m_shops.py`) and Shop Inventory (`m_shop_inventory.py`)
- **References:** Locations, Characters, Requirements, Currencies, Items.
- **Blueprint owners:** `BP_ShopController`, `BP_ShopWidget`, availability gating via `BP_FlagManager`.

---

## Characters, Dialogue and Narrative
### Characters (`m_characters.py`)
- **References:** Locations, Factions, Character Classes, Combat Profiles (optional), Interaction Profiles (optional).
- **Blueprint owners:** `BP_CharacterRegistry`, `BP_DialogueManager`, `BP_CompanionManager`.

### Interaction Profiles (`m_interaction_profiles.py`)
- **References:** Characters, Dialogues, Quests, Flags, Shops.
- **Blueprint owners:** `BP_NPCSpawner`, `BP_DialogueManager`, `BP_CompanionManager`.

### Dialogues (`m_dialogues.py`) and Dialogue Nodes (`m_dialogue_nodes.py`)
- **References:** Characters, Locations, Requirements, Flags (set or require), Events (follow-ups).
- **Blueprint owners:** `BP_DialogueManager`, narrative analytics tooling.

### Quests (`m_quests.py`)
- **References:** Story Arcs, Requirements, Flags, Rewards, Events, Items, Currencies, Factions.
- **Blueprint owners:** `BP_QuestLogComponent`, `BP_StoryManager`, reward resolvers.

### Story Arcs (`m_story_arcs.py`)
- **References:** Content Packs, Timelines, Quests, Flags, Events.
- **Blueprint owners:** `BP_StoryManager`, chapter selection UI.

### Flags (`m_flags.py`) and Requirement Link Tables (`m_requirements.py`)
- **References:** Content Packs, Factions, Timelines, Routes (unlock), Events, Dialogues, Quests, Encounters.
- **Blueprint owners:** `BP_FlagManager`, `BP_ReputationSystem`, requirement evaluation across all systems.

### Factions (`m_factions.py`)
- **Feeds:** Reputation rewards, requirement checks, dialogue branching, encounter reactions.
- **Blueprint owners:** `BP_ReputationSystem`, requirement evaluator, UI overlays.

---

## World Graph, Travel and Exploration
### Locations (`m_locations.py`)
- **Key fields:** `biome`, `level_range`, `encounters`, `is_safe_zone`, `is_fast_travel_point`, `has_respawn_point`.
- **References:** Encounters, Events, Lore, Shops, Characters.
- **Blueprint owners:** `BP_LocationRegistry`, `BP_WorldMapWidget`, travel orchestration.

### Location Routes (UE5 export proposal)
- **Key fields:** `from_location_id`, `to_location_id`, `travel_time`, `distance`, `requirements_id`, `encounter_modifiers`, `flags_unlock`, `flags_lock`, `cost_currency_id`, `cost_amount`.
- **References:** Locations, Requirements, Flags, Currencies, Events (route-triggered), Encounters (optional override list).
- **Blueprint owners:** `BP_WorldGraphSubsystem`, `BP_TravelPlanner`, `BP_TravelOrchestrator`, cheat tooling (for example `UnlockRoute`).

### Lore Entries (`m_lore_entries.py`) and Timelines (`m_timelines.py`)
- **References:** Locations, Story Arcs, Events.
- **Blueprint owners:** `BP_LoreCompendium`, timeline playback UI, story manager callbacks.

---

## Encounters, Events and Rewards
### Encounters (`m_encounters.py`)
- **Key fields:** `encounter_type`, `participants`, `requirements_id`, `rewards` (xp, currency, reputation, items, flags), `spawn_context`.
- **References:** Characters, Combat Profiles, Interaction Profiles, Requirements, Currencies, Factions, Flags, Items, Events.
- **Blueprint owners:** `BP_EncounterManager`, `BP_EncounterDirector`, reward pipelines.

### Combat Profiles (`m_combat_profiles.py`)
- **Key fields:** `character_id`, `enemy_type`, `aggression`, `loot_table`, `currency_rewards`, `reputation_rewards`, `xp_reward`, `custom_abilities`, `companion_config`.
- **References:** Characters, Character Classes (via Character), Abilities, Items, Factions, Quests, Events.
- **Blueprint owners:** `BP_EncounterDirector`, `BP_EnemyBrain`, loot resolver.

### Events (`m_events.py`)
- **Key fields:** `type`, `requirements_id`, `location_id`, `dialogue_id`, `encounter_id`, `item_rewards`, `xp_reward`, `currency_rewards`, `reputation_rewards`, `flags_set`, `next_event_id`.
- **References:** Requirements, Locations, Dialogues, Encounters, Items, Currencies, Factions, Flags, Routes (optional).
- **Blueprint owners:** `BP_EventSequencer`, `BP_TravelOrchestrator`, `BP_StoryManager`.

### Rewards (encounter, quest, event payloads)
- **References:** Items, Currencies, Flags, Reputation, Lore.
- **Blueprint owners:** `BP_CurrencyManager`, `BP_ItemManager`, `BP_ReputationSystem`, `BP_FlagManager`.

---

## Validation Hotspots
- **Requirements <-> Flags or Factions:** Every requirement entry should resolve its flags or faction thresholds. Broken links block narrative progression.
- **Talent Nodes <-> Abilities/Stats/Attributes:** Ensure referenced IDs exist and node links stay within the same tree.
- **Locations <-> Routes:** Every route endpoint must exist, and safe zones should not route into random-encounter-only segments unless design intends it.
- **Encounters <-> Characters and Profiles:** Ensure each character ULID exists and the required combat or interaction profile is present. Encounter rewards should reference valid currencies or items.
- **Events <-> next_event_id Chains:** Validate that chains terminate; use automation tests to catch accidental loops.
- **Quests <-> Story Arcs <-> Content Packs:** Quests must belong to Story Arcs that share the same content pack gating.

---

### Quick Usage Tips
- Use `BP_DataImportManager` after every CSV or JSON export. Let it surface missing rows, enum mismatches, or orphaned routes before hitting Play.
- `DebugLookupRow` cheat helps verify a row in-game (`DebugLookupRow Item HealingPotion`).
- Check this map whenever you add a new Requirement or Flag. If a system references it here, wire the Blueprint evaluation before designers depend on it.
