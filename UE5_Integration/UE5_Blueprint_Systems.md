# Blueprint Systems Overview

Subsystem ownership for the canonical UE5 Real-Time Top-Down Able prototype. Use this sheet to keep responsibilities clean and to know which blueprint should expose which API. Use `UE5_Prototype_Step_By_Step.md` for the active implementation order and detailed Blueprint tutorial steps.

```
BP_GameInstance_SoA
  +-- BP_GameDataService (constructed Blueprint Object)
  +-- BP_ContentPackRegistry
  +-- BP_CurrencyManager
  +-- BP_FlagManager
  +-- BP_TalentManager
  +-- BP_CompanionManager
  +-- BP_PersistenceValidator

Overworld Runtime (BP_GameState/BP_PlayerController components or world manager actor)
  +-- BP_WorldGraphSubsystem
  +-- BP_LocationRegistry
  +-- BP_TravelOrchestrator
  +-- BP_EncounterManager
  +-- BP_EncounterDirector
```

## Data Foundation
- Enum and Struct source of truth: `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`. This document only references them by name.
- **`BP_GameDataService` (GameInstance-owned Blueprint Object)**  
  Constructed by `BP_GameInstance_SoA` during `Event Init` using `Construct Object from Class`, then initialized through an explicit `InitializeDataService` function. Stores DataTable references, builds caches keyed by ULID and slug, exposes typed lookup functions (`GetStatDataBySlug`, `GetStatDataById`, later item/encounter getters), and emits validation logs when lookups miss. Do not rely on `BeginPlay` for this object.

- **`BFL_SoAHelpers` (Blueprint Function Library)**  
  Stateless helper library for `GetSoAGameInstance(WorldContextObject)` and `GetGameDataService(WorldContextObject)`. Actors, components, widgets, and debug tools should use this instead of repeating GameInstance casts.

- **`BP_DataImportManager` (Editor Utility Widget)**  
  Batch re-imports CSV/JSON exports, validates enum strings, checks dangling ULIDs, and can trigger automation tests. Presents a summary panel grouped by severity (error/warning/info). Supports hot reload during PIE for dialogue/narrative iteration.

- **`BP_ContentPackRegistry` (GameInstance-owned manager / `BP_GameInstance_SoA` functions)**  
  Stores active packs, exposes `IsPackActive`, `FilterRowsByPack`, and broadcast events when pack selection changes (allowing UI or story systems to refresh).

- **`BP_CurrencyManager` (GameInstance-owned manager / `BP_GameInstance_SoA` functions)**  
  Mirrors currency definitions, tracks player balances per currency, and provides mutators (`AddCurrency`, `RemoveCurrency`, `GetBalance`). Integrates with rewards, shop purchases, and save/load.

- **`BP_PersistenceValidator` (GameInstance-owned helper / validation utility)**  
  Verifies SaveGame snapshots against current data revisions, warning if removed quests/items/flags exist. Invoked post-load and after re-imports.

## Narrative & Game State
- **`BP_FlagManager` (GameInstance-owned manager / `BP_GameInstance_SoA` functions)**  
  Initialises all flags to default values, exposes `CheckRequirement`, `SetFlag`, `GetFlagValue`, iterates link tables (required/forbidden flags, faction thresholds). Broadcasts `OnFlagChanged (FlagId, OldValue, NewValue)`; other systems subscribe.

- **`BP_TalentManager` (GameInstance-owned manager / `BP_GameInstance_SoA` functions)**  
  Owns talent trees/nodes, tracks learned node ranks, validates prerequisites, applies passive modifiers to `BP_StatsComponent`, and emits `OnTalentChanged` for UI refresh and stat recompute.

- **`BP_ReputationSystem` (GameInstance-owned manager / `BP_GameInstance_SoA` functions)**  
  Keeps faction reputation maps, applies modifiers from quests/events/encounters, and exposes threshold queries used by requirements.

- **`BP_QuestLogComponent` (Actor Component on Player)**  
  Tracks quest states, objectives, timers. Subscribes to flag changes and updates UI. Calls into reward systems when objectives complete. Persists progress via SaveGame.

- **`BP_StoryManager` (Actor Component on GameMode)**  
  Drives story arc progression, timeline advancement, and event chains. Applies pack gating, requirement checks, and triggers new quests or events based on flag changes.

- **`BP_CompanionManager` (GameInstance-owned manager / `BP_GameInstance_SoA` functions)**  
  Handles companion roster, spawns/despawns follower pawns, manages loyalty flags, communicates loadout/stats to combat setup. Supports rotating companions per story beat.

- **`BP_SaveGame_SoA` (SaveGame Blueprint)**  
  Serialises player stats, inventory, learned abilities, flags, quest states, companion roster, unlocked routes, content pack selection, travel seeds. For the prototype, store a minimal subset in the same schema.

## World Graph & Travel
- **`BP_WorldGraphSubsystem` (Blueprint world manager: GameState/Controller component or placed actor)**  
  Ingests Location + LocationRoute tables, builds adjacency lists and weighted graph metadata. Provides pathfinding (`FindBestRoute` / `FindAllRoutes`), caches results per travel mode, and reacts to flag/content pack changes to enable/disable edges.

- **`BP_TravelPlanner` (Object Library / Blueprint Function Library)**  
  Executes Dijkstra/A* using data from the world graph, returning `FTravelPlan` structs (segments, estimated time, stamina costs, encounter odds). Reads travel tuning data (for example `FTravelTuningData`) and supports developer overrides (instant travel, ignore requirements).

- **`BP_LocationRegistry` (Blueprint world manager: GameState/Controller component or placed actor)**  
  Tracks current location, discovered nodes, fast-travel unlocks, respawn anchors, and exposure to safe zones. Offers `GetLocationData`, `IsLocationUnlocked`, `MarkDiscovered`.

- **`BP_TravelOrchestrator` (PlayerController component or placed world manager actor)**  
  Manages travel execution: steps through travel plan segments, triggers pre-segment events, rolls for encounters, plays travel UI/VO, and resumes control after each segment. Owns persistable travel session state (seed + segment index) and works with `BP_EncounterManager` for encounter injection.

- **`BP_WorldMapWidget` (UI)**  
  Renders nodes/edges, colour-codes locked routes, shows encounter odds and travel costs. Integrates developer debug modes for graph visualisation.

> Detailed travel architecture: `UE5_Integration/World_Travel_System.md`.

## Encounter & Combat Layer (Real-Time + Able)
- **`BP_EncounterManager` (Blueprint world manager: GameState/Controller component or placed actor)**  
  Receives context from travel/events, filters encounter candidates by requirement, content pack, and difficulty, seeds RNG for deterministic runs, and forwards selected encounters to the event sequencer or combat director.

- **`BP_EncounterDirector` (Blueprint world manager: GameState/Controller component or placed actor)**  
  Builds combat scenes: spawns player + companions, instantiates combatants using `FCombatProfileData` and `FCharacterClassData`, applies route/environment modifiers (weather, terrain), and packages `FCombatContext`.

- **`BP_CombatComponent` (Actor Component on Combatants)**  
  Central API for basic attacks and ability requests, validates targets and range, triggers damage pipeline, and emits combat events for UI and AI.

- **`BP_StatsComponent` (Actor Component on Combatants)**  
  Stores base and derived stats, applies modifiers, and emits `OnStatsChanged`.

- **`BP_HealthComponent` (Actor Component on Combatants)**  
  Tracks current/max health, emits `OnHealthChanged`, and signals death to combat flow.

- **`BP_TargetingComponent` (Actor Component on `BP_PlayerController_Prototype` for the prototype)**  
  Maintains soft target and hard lock, refreshes valid targets with a radius overlap around the controlled pawn, cycles next/prev targets, validates stale target references after reset/death/range breaks, and exposes `GetCurrentTarget` for combat. LOS and screen-angle sorting are later refinements.

- **`BPI_Targetable` + optional `BP_TargetableComponent` (Interface + Component)**  
  `BPI_Targetable` is implemented first on `BP_BattleCharacter` and exposes `CanBeTargeted`, display name, team id, target location, and lock/unlock hooks. `BP_TargetableComponent` is optional metadata if target radius/socket/display overrides grow beyond the base class.

- **`BP_TargetIndicator` (Prototype visual feedback actor)**  
  Simple ring/decal/mesh actor spawned or attached by `BP_TargetingComponent` on hard lock. Use this before investing in custom-depth outline materials or final UI target frames.

- **`BP_AbleAbilityComponent` (Able Plugin Component)**  
  Executes abilities, cooldowns, casts, and channels. Wrapper helpers should expose `TryActivateAbility`, `CancelAbility`, and cooldown queries to UI.

- **`BP_TelegraphActor` / `BP_TelegraphComponent`**  
  Spawns AOE warnings from Able ability timelines and cleans up on execute or cancel.

- **`BPI_VFXHooks` / `BPI_AudioHooks`**  
  Interface hooks for hit, cast start/end, telegraph, and impact cues.

- **`BP_EffectResolver` (Blueprint Function Library)**  
  Applies damage/heal/buff/debuff effects using `calculation_basis`, `value_type`, `value`, `scaling_stat_id`, `scaling_multiplier`, and optional `damage_type`/`tick_interval`. Interfaces with `BP_CombatFormulaLibrary` for calculations and `BP_StatusComponent` for persistent states.

- **`BP_StatusComponent` (Actor Component on Combatants)**  
  Manages timed effects, stacking, immunities, and tick-based damage. Emits events for UI/AI when states change.

- **`BP_CombatFormulaLibrary` (Function Library)**  
  Centralises formulas (damage, crit, resistance), pulling coefficients from DataTables so balancing can change without blueprint rewiring. Ability scaling reads `ability_scaling_links.stat_id` (Stats), not Attributes.

- **`BP_BattleCharacter` / `BP_PlayerCharacter` / `BP_EnemyCharacter` / `BP_CompanionCharacter`**  
  Base combatant class plus specialisations. Prototype baseline includes team id, display name, targetability, initial transform, alive/dead state, reset helper, and later components for stats, health, combat, abilities, item usage, AI hooks, and animation triggers.

- **`BP_EnemyBrain` (Actor Component)**  
  Wraps AI behaviour for enemies. Consumes behaviour tags from combat profile data, scores abilities against current battlefield state, and picks targets.

- **`BP_RewardDistributor` (Function Library)**  
  Routes XP, currency, items, reputation, and flags after combat or scripted events through `BP_CurrencyManager`, `BP_ItemManager`, `BP_ReputationSystem`, and `BP_FlagManager`.

## Character Build Systems
- **`BP_InventoryComponent` (Actor Component on Player/Companions)**  
  Manages slots, stacks, grants, and removes items for prototyping.

- **`BP_EquipmentComponent` (Actor Component on Player/Companions)**  
  Equips gear, applies stat modifiers via `BP_StatsComponent`, and emits equip/unequip events.

## Dialogue, Events & Interactions
- **`BP_DialogueManager` (Widget + Actor Component)**  
  Plays dialogues from `FDialogueData` + `FDialogueNodeData`, validates requirements per node using `BP_FlagManager`, pushes flags/rewards, and supports skip/debug options.

- **`BP_DialogueSpeaker`**  
  Maps speaker identifiers to character references (player, companion, character) and triggers VO/subtitles/emotes.

- **`BP_EventSequencer` (GameInstance- or world-owned manager blueprint)**  
  Reads `FEventData`, resolves requirements, fires target actions (encounter, dialogue, teleport, scripted scene), applies rewards, and follows `next_event_id` chains. Used by travel, story, and encounter systems.

- **`BP_ShopController` / `BP_ShopWidget`**  
  Validates access requirements, pulls inventory, calculates prices via pricing helper, processes purchases, updates currency manager.

- **`BP_LoreCompendium` (manager blueprint + UI)**  
  Unlocks lore entries when flags/events trigger, references timelines for chronology filters.

## Tooling, Debug & QA
- **`BP_SoACheatManager`**  
  Exposes commands (`SpawnEncounter`, `ToggleEncounters`, `SetFlag`, `GiveItem`, `DebugLookupRow`, `UnlockRoute`, `TravelTo`, etc.). Only active in Development builds.

- **`BP_DebugOverlayWidget`**  
  UI for toggling cheats, viewing travel graph, inspecting current requirements, and visualising encounter odds or targeting debug data.

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

Stick to these ownership boundaries to limit blueprint complexity. When in doubt, prefer adding data to the relevant table and letting the owning manager react, rather than special-casing logic in gameplay blueprints.
