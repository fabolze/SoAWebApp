# Blueprint Systems Overview

This layout translates the SoA data into UE5 Blueprint-only systems tailored to a story-driven JRPG with a primary hero and optional companions.

## Data Foundation
- **`BP_GameDataSubsystem` (Engine Subsystem)**: Loads every DataTable on Init from `Content/Data/Tables`. Provide lookup helpers for Stats, Attributes, Requirements, etc., returning structs by ULID or slug. Cache frequently used rows as `TMap<FString, FSoARow>` to avoid repeated DataTable calls.
- **`BP_DataImportManager` (Editor Utility Widget)**: Batch re-imports CSV/JSON exports, validates enum strings, checks for dangling ULIDs (leveraging the relationship map), and logs issues. Run before packaging builds.
- **`BP_SaveGame_SoA`**: Stores player stats, inventory, flags, quest states, companion roster, and active story arc context. Integrates with Flag Manager for serialization.

```
BP_GameInstance
  +-- BP_GameDataSubsystem
        +-- DataTable: Stats
        +-- DataTable: Attributes
        +-- DataTable: Abilities & links
        +-- DataTable: Items
        +-- DataTable: Quests / StoryArcs / Flags
        +-- Helper Maps (ULID -> Struct)
```

## Narrative & Progression Layer
- **`BP_FlagManager` (Game Instance Subsystem)**: Initializes all Flags to default, exposes `CheckRequirement(RequirementId)` that iterates Requirement link tables and faction reputation. Broadcasts `OnFlagChanged` events for UI and quests.
- **`BP_StoryManager` (Actor Component on GameMode)**: Tracks current Story Arc, Story Beats, and calls into `BP_FlagManager`. Resolves `FStoryArcData.branching` to decide next quest once flags are set.
- **`BP_QuestLogComponent` (Actor Component on Player)**: Consumes `FQuestData` and manages objective states. Invokes `BP_FlagManager` when objectives complete (`flags_set_on_completion`). Provides UI data for quest journal.
- **`BP_CompanionManager`**: Maintains active companions, reading `NPC.companion_config`, and spawns follower pawns. Handles temporary join/leave logic for narrative pacing.
- **`BP_LevelProgressionComponent`**: Uses `CharacterClass.base_stats` / `stat_growth` and AttributeStat links to calculate derived stats on level up. Recomputes equipment bonuses by pulling Item definitions.

## Encounter & Combat Layer
- **`BP_EncounterDirector` (World Subsystem)**: Builds encounters from `FEncounterData`, combining `enemy_ids`, `npc_ids`, and reward definitions. For Combat encounters, spawns battlers using `CharacterClass` templates and attaches ability sets from `Enemy.custom_abilities`.
- **`BP_TurnManager`**: Orders participants by Speed stat, processes ability execution. For each ability, fetch linked `AbilityEffectLink` entries, then apply `Effect` rows using `BP_EffectResolver`.
- **`BP_EffectResolver`**: Evaluates Effect value based on `value_type`, `attribute_id`, and `scaling_stat_id`. Requests current attribute/stat values from Player / Enemy components.
- **`BP_StatusComponent`**: Applies lasting effects, handles stacking and expiration per `Effect.duration` and `Effect.stackable`.

## Dialogue & Interaction Layer
- **`BP_DialogueManager` (Widget + Actor Component)**: Loads `FDialogueData` for the selected NPC, then iterates `FDialogueNodeData` to present lines. Each node checks `requirements_id` via `BP_FlagManager`, triggers `set_flags`, and advances through `choices`.
- **`BP_DialogueSpeaker`**: Maps `speaker` field to Character references (Player, NPC, Companion) and cues VO/subtitles.
- **`BP_EventSequencer`**: Consumes `FEventData`, dispatches to appropriate handlers (Encounter, Dialogue, Teleport, ScriptedScene). Uses `next_event_id` for chains.
- **`BP_ShopWidget` / `BP_ShopController`**: Uses Shop + ShopInventory tables, verifying requirements on open, applying `price_modifiers`, and cross-referencing Items for display.

## World & Exploration Layer
- **`BP_LocationRegistry`**: Registers `FLocationData`, handles fast-travel availability and safe-zone logic. Ties into `BP_EventSequencer` to surface location-specific encounters.
- **`BP_LoreCompendium`**: Pulls `FLoreEntryData`, unlocks entries when Flags fire. Supports timeline filtering by referencing `TimelineId`.
- **`BP_ReputationSystem`**: Reads Faction definitions, updates reputations on turn-ins or dialogue outcomes, surfaces thresholds defined in `reputation_config`.
- **`BP_ItemManager`**: Centralizes equipment and consumable usage, applying stat bonuses or triggering ability-like effects for items with JSON `effects` arrays.

## Tooling & Validation
- Automated blueprint validation graph that iterates every Requirement node to ensure referenced Flags/Factions exist.
- Playtest command (`CheatManager`) to fetch rows by slug for quick debugging: `DebugLookupRow(RowType, Slug)` prints relevant fields.
- Unit-test style functional maps (using UE Automation Framework) to ensure DataTable imports match struct expectations before shipping.




