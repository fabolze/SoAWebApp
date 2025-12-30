# Blueprint Systems Overview

Subsystem ownership for the UE5 blueprint-only JRPG build. Use this sheet to keep responsibilities clean and to know which blueprint should expose which API.

```
BP_GameInstance
  +-- BP_GameDataSubsystem
  +-- BP_ContentPackRegistry
  +-- BP_CurrencyManager
  +-- BP_FlagManager
  +-- BP_CompanionManager
  +-- BP_WorldGraphSubsystem
  +-- BP_EncounterManager
  +-- BP_PersistenceValidator
```

## Data Foundation
- **`BP_GameDataSubsystem` (Engine Subsystem)**  
  Loads every DataTable on Init, builds caches keyed by ULID and slug, exposes helper functions (`GetStatById`, `GetItemModifiers`, `FindEncountersForLocation`). Provides typed wrappers for JSON fields (e.g. quest objective arrays). Emits validation logs when lookups miss.

- **`BP_DataImportManager` (Editor Utility Widget)**  
  Batch re-imports CSV/JSON exports, validates enum strings, checks dangling ULIDs, and can trigger automation tests. Presents a summary panel grouped by severity (error/warning/info). Supports hot reload during PIE for dialogue/narrative iteration.

- **`BP_ContentPackRegistry` (Game Instance Subsystem)**  
  Stores active packs, exposes `IsPackActive`, `FilterRowsByPack`, and broadcast events when pack selection changes (allowing UI or story systems to refresh).

- **`BP_CurrencyManager` (Game Instance Subsystem)**  
  Mirrors currency definitions, tracks player balances per currency, and provides mutators (`AddCurrency`, `RemoveCurrency`, `GetBalance`). Integrates with rewards, shop purchases, and save/load.

- **`BP_PersistenceValidator` (Auxiliary Subsystem)**  
  Verifies SaveGame snapshots against current data revisions, warning if removed quests/items/flags exist. Invoked post-load and after re-imports.

## Narrative & Game State
- **`BP_FlagManager` (Game Instance Subsystem)**  
  Initialises all flags to default values, exposes `CheckRequirement`, `SetFlag`, `GetFlagValue`, iterates link tables (required/forbidden flags, faction thresholds). Broadcasts `OnFlagChanged (FlagId, OldValue, NewValue)`; other systems subscribe.

- **`BP_ReputationSystem` (Game Instance Subsystem)**  
  Keeps faction reputation maps, applies modifiers from quests/events/encounters, and exposes threshold queries used by requirements.

- **`BP_QuestLogComponent` (Actor Component on Player)`**  
  Tracks quest states, objectives, timers. Subscribes to flag changes and updates UI. Calls into reward systems when objectives complete. Persists progress via SaveGame.

- **`BP_StoryManager` (Actor Component on GameMode)**  
  Drives story arc progression, timeline advancement, and event chains. Applies pack gating, requirement checks, and triggers new quests or events based on flag changes.

- **`BP_CompanionManager` (Game Instance Subsystem)**  
  Handles companion roster, spawns/despawns follower pawns, manages loyalty flags, communicates loadout/stats to combat setup. Supports rotating companions per story beat.

- **`BP_SaveGame_SoA` (SaveGame Blueprint)**  
  Serialises player stats, inventory, learned abilities, flags, quest states, companion roster, unlocked routes, content pack selection, travel seeds.

## World Graph & Travel
- **`BP_WorldGraphSubsystem` (World Subsystem)**  
  Ingests Location + LocationRoute tables, builds adjacency lists and weighted graph metadata. Provides pathfinding (`FindBestRoute` / `FindAllRoutes`), caches results per travel mode, and reacts to flag/content pack changes to enable/disable edges.

- **`BP_TravelPlanner` (Object Library / Blueprint Function Library)**  
  Executes Dijkstra/A* using data from the world graph, returning `FTravelPlan` structs (segments, estimated time, stamina costs, encounter odds). Reads travel tuning data (for example `FTravelTuningData`) and supports developer overrides (instant travel, ignore requirements).

- **`BP_LocationRegistry` (World Subsystem)**  
  Tracks current location, discovered nodes, fast-travel unlocks, respawn anchors, and exposure to safe zones. Offers `GetLocationData`, `IsLocationUnlocked`, `MarkDiscovered`.

- **`BP_TravelOrchestrator` (World Subsystem or Component on Player Controller)**  
  Manages travel execution: steps through travel plan segments, triggers pre-segment events, rolls for encounters, plays travel UI/VO, and resumes control after each segment. Owns persistable travel session state (seed + segment index) and works with `BP_EncounterManager` for encounter injection.

- **`BP_WorldMapWidget` (UI)**  
  Renders nodes/edges, colour-codes locked routes, shows encounter odds and travel costs. Integrates developer debug modes for graph visualisation.

> Detailed travel architecture: `UE5_Integration/World_Travel_System.md`.

## Encounter & Combat Layer
- **`BP_EncounterManager` (World Subsystem)**  
  Receives context from travel/events, filters encounter candidates by requirement, content pack, and difficulty, seeds RNG for deterministic runs, and forwards selected encounters to the event sequencer or combat director.

- **`BP_EncounterDirector` (World Subsystem)**  
  Builds combat scenes: spawns player + companions, instantiates enemies using `FEnemyData` and `FCharacterClassData`, applies route/environment modifiers (weather, terrain), and packages `FCombatContext`.

- **`BP_TurnManager` (Actor/Component inside Battle Level)**  
  Orders combatants by Speed, handles initiative modifiers, queues actions, and drives the turn loop. Publishes turn order to UI and handles skip logic (stun, death).

- **`BP_ActionQueue` (Support Object)**  
  Stores declared actions, allows preview/confirmation, supports reaction hooks (interrupts, counters) configured via data.

- **`BP_EffectResolver` (Blueprint Function Library)**  
  Applies damage/heal/buff/debuff effects using `value_type`, `attribute_id`, and `scaling_stat_id`. Interfaces with `BP_CombatFormulaLibrary` for calculations and `BP_StatusComponent` for persistent states.

- **`BP_StatusComponent` (Actor Component on Battle Characters)**  
  Manages timed effects, stacking, immunities, and tick-based damage. Emits events for UI/AI when states change.

- **`BP_CombatFormulaLibrary` (Function Library)**  
  Centralises formulas (damage, crit, resistance), pulling coefficients from DataTables so balancing can change without blueprint rewiring.

- **`BP_BattleCharacter` / `BP_PlayerCharacter` / `BP_EnemyCharacter` / `BP_CompanionCharacter`**  
  Base combatant class plus specialisations. Provide API for stats, abilities, item usage, AI hooks, animation triggers.

- **`BP_EnemyBrain` (Actor Component)**  
  Wraps AI behaviour for enemies. Consumes behaviour tags from enemy data, scores abilities against current battlefield state, and picks targets.

- **`BP_RewardDistributor` (Function Library)**  
  Routes XP, currency, items, reputation, and flags after combat or scripted events through `BP_CurrencyManager`, `BP_ItemManager`, `BP_ReputationSystem`, and `BP_FlagManager`.

## Dialogue, Events & Interactions
- **`BP_DialogueManager` (Widget + Actor Component)**  
  Plays dialogues from `FDialogueData` + `FDialogueNodeData`, validates requirements per node using `BP_FlagManager`, pushes flags/rewards, and supports skip/debug options.

- **`BP_DialogueSpeaker`**  
  Maps speaker identifiers to character references (player, companion, NPC) and triggers VO/subtitles/emotes.

- **`BP_EventSequencer` (Subsystem)**  
  Reads `FEventData`, resolves requirements, fires target actions (encounter, dialogue, teleport, scripted scene), applies rewards, and follows `next_event_id` chains. Used by travel, story, and encounter systems.

- **`BP_ShopController` / `BP_ShopWidget`**  
  Validates access requirements, pulls inventory, calculates prices via pricing helper, processes purchases, updates currency manager.

- **`BP_LoreCompendium` (Subsystem/UI)**  
  Unlocks lore entries when flags/events trigger, references timelines for chronology filters.

## Tooling, Debug & QA
- **`BP_SoACheatManager`**  
  Exposes commands (`SpawnEncounter`, `ToggleEncounters`, `SetFlag`, `GiveItem`, `DebugLookupRow`, `UnlockRoute`, `TravelTo`, etc.). Only active in Development builds.

- **`BP_DebugOverlayWidget`**  
  UI for toggling cheats, viewing travel graph, inspecting current requirements, visualising encounter odds and turn order predictions.

- **Automation Tests (Blueprint-based)**  
  - Data integrity suite (per-table row validation, dangling ULIDs, enum mismatches).  
  - Requirement evaluation tests (required/forbidden flags, faction thresholds).  
  - Travel graph tests (ensure every route endpoint exists, detect cycles/orphans, validate safe-zone exclusions).  
  - Encounter seeding tests (consistent output for given seed + location).  

- **`BP_TravelSimulator` (Editor Utility)**  
  Runs Monte-Carlo simulations over travel paths to report encounter frequency, average cost/time, and edge cases (e.g. zero available routes). Helps tuning encounter chances.

- **`BP_TestBattleMode`**  
  Loads selected encounters, companions, equipment sets for rapid combat iteration; integrates with automation to catch regressions in formulas or AI.

---

Stick to these ownership boundaries to limit blueprint complexity. When in doubt, prefer adding data to the relevant table and letting the owning subsystem react, rather than special-casing logic in gameplay blueprints.
