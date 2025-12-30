# UE5 Integration Plan

A blueprint-only roadmap that turns the SoA content repository into a narrative-focused JRPG inside Unreal Engine 5. The plan absorbs the deep-dive in `UE5_Integration/UE5_Blueprint_Integration_Guide.txt` and is scaffolded by two companion docs:

- `UE5_Integration/Data_Relationship_Map.md` - field-level cross links.
- `UE5_Integration/Blueprint_Systems.md` - subsystem blueprints and ownership.

## Vision & Design North Star
- Deliver an author-first experience: narrative tools must let you iterate on branching stories, evocative dialogue, and companion side tales rapidly.
- Stay data-driven: all gameplay pulls from exported SoA DataTables so designers can update content without touching Blueprints.
- Support a lone protagonist with rotating companions: architecture separates the player hero from temporary allies while keeping combat, dialogue, and quest hooks consistent.
- Keep import/export painless: reimports from the SoA editor should be a one-click workflow with validation warnings for broken links.

## Daily Start (short sessions, clear head)
Mini-Ziel: genau 1 kleine Aufgabe pro Abend.

Start-Checkliste (2-3 Minuten)
1) `UE5_Integration/UE5_Blueprint_Integration_Guide.txt` oeffnen und letzte Stop-Notiz lesen.
2) Eine kleine Aufgabe waehlen (max 20-30 Minuten).
3) Ende der Session direkt terminieren (keine "nur noch schnell").

Easy-Win Aufgaben (wenn du muede bist)
- 1 Blueprint-Enum anlegen und Strings 1:1 uebernehmen.
- 1 Struct fuer eine Tabelle pruefen/anpassen.
- 1 DataTable reimportieren und Log checken.
- 1 Cache-Map im `BP_GameDataSubsystem` fuer einen Block anlegen.

Stop-Notiz Template (am Ende jeder Session)
Kopieren und 30 Sekunden ausfuellen:
```
Datum:
Heute gemacht:
Naechster Schritt (1 Satz):
Block-Status:
Offene Fragen:
```

## Content Coverage Snapshot
- Core datasets: Stats, Attributes, Attribute-to-Stat links, Abilities, Ability links (effects and scaling), Effects, Items, Item modifiers, Currencies, Content Packs, Character Classes, NPCs, Dialogues plus Nodes, Quests, Story Arcs, Timelines, Locations, Location Routes, Encounters, Events, Enemies, Factions, Flags, Requirements plus flag and reputation link tables, Shops, Shop Inventory, Lore Entries.
- Cross-link highlights: Abilities reference Effects and Attributes; Items reference Requirements and modifiers; Quests feed Story Arcs, Flags, and reward bundles; NPCs bridge Locations, Dialogues, Shops, and Companions; Events chain Encounters, Dialogues, and reward payloads; Routes connect Locations with travel metadata; Requirements unify gating across systems.
- Use the relationship map as a wiring checklist before building Blueprint lookups.

## 1. Data Structures and Data Tables
1. Mirror every backend model with matching Blueprint Structs (`FStatData`, `FLocationData`, and so on) and set the backend `slug` as the DataTable Row Name while storing the ULID `id` inside the struct for stable references.
2. Convert backend enums (item type, biome, encounter type, stat category, and similar) into Blueprint Enums that keep the exact backend strings. Organise them under `/Game/Data/Enums` so the CSV or JSON importer can resolve values automatically.
3. Import every SoA export into DataTables under `Content/Data/Tables`. Enforce exact field name parity between CSV and struct members to avoid import warnings.
4. Build `BP_DataImportManager` (Editor Utility Widget) to batch re-import all exports, validate enum strings, and flag missing references (for example a quest referencing an absent arc or a shop inventory pointing to a missing item).
5. Introduce automated validation routines: after imports, run sweeps checking any Requirements, Flags, Content Packs, or Location Routes referenced by other tables actually exist; log actionable errors in editor.
6. Extend exports with a `LocationRoute` table (two location ULIDs plus distance, travel time, requirements, encounter modifiers). Use it to build a graph for travel planning (see section 3).

> [Outcome] UE5 owns a faithful mirror of the SoA schema. Designers can iterate in the editor, re-export, and re-import with zero Blueprint tweaks; validation warns about bad data before runtime.

## 2. Core Systems: Data and Game State
1. `BP_GameDataSubsystem` (Engine Subsystem) loads all DataTables on Init, caches rows by ULID and slug, and exposes Blueprint-callable lookup helpers (`GetItemById`, `GetAbilityEffects`, `FindQuestsByStoryArc`). Apply lazy maps (`ULID -> Struct`) for hot paths.
2. `BP_ContentPackRegistry` (Game Instance Subsystem) tracks active packs, exposes filters for subsystems (Story, Encounter, Shop) to hide gated content.
3. `BP_CurrencyManager` (Game Instance Subsystem) mirrors Currency rows, tracks balances per currency, and emits wallet change events for UI and reward flows.
4. `BP_SaveGame_SoA` persists player stats, inventory, active and completed quests, learned abilities, companions, global flags, unlocked routes, and active content packs. Load and save flows use the managers above to hydrate runtime state.
5. `BP_FlagManager` (Game Instance Subsystem) initialises all Flags, evaluates `CheckRequirement(RequirementId)` by traversing required or forbidden flag tables and faction reputation thresholds, and broadcasts `OnFlagChanged` events.
6. `BP_QuestLogComponent` (Player Actor Component) maps quest objectives, syncs with Flags, updates UI, and routes quest rewards through Currency, Reputation, and Item managers. Supports multi-branch objectives and timed goals.
7. `BP_StoryManager` (GameMode Component) orchestrates Story Arcs, Timelines, and Event chains. It reacts to Flags, Content Pack filters, and `FEventData.next_event_id` to push the correct quest or event sequence.
8. `BP_CompanionManager` (Game Instance Subsystem) controls active companion roster via `NPC.companion_config`, handles spawn and despawn, manages loyalty progression (Flags), and shares stat or ability data with the combat setup.
9. Add a lightweight `BP_PersistenceValidator` to ensure SaveGame snapshots stay schema-compatible (for example warn if a removed quest exists in a save).

> [Outcome] Gameplay systems call into central managers instead of reading DataTables ad-hoc. State progression, gating, and rewards stay in sync with content packs and save data.

## 3. World and Encounter System
### 3.1 Location Graph and Travel Planner
- Create `BP_WorldGraphSubsystem` (World Subsystem) to ingest Locations plus LocationRoutes and build a directed, weighted graph. Cache adjacency lists keyed by Location ULID for fast lookups.
- Add `BP_TravelPlanner` to compute optimal paths (Dijkstra or A* on route weights) and expose travel time, resource costs, and optional scenic variants. Support developer toggles (`Instant Travel`) and debug overlays.
- Add a small travel tuning dataset (for example `FTravelTuningData` as a DataTable/DataAsset) so encounter odds and travel multipliers are fully data-driven and testable.
- Store per-route metadata: travel time, stamina cost, vehicle type, environmental hazard level, encounter weight modifiers, requirements (`RequirementId`), and unlock conditions (for example a Flag gating a bridge). Use this to dynamically enable or disable edges at runtime.
- Provide blueprint APIs: `FindBestRoute(FromSlug, ToSlug, TravelMode)`, `CanTravelRoute(RouteId)`, `GetTravelSummary(Path)`.
- Supply a `BP_WorldMapWidget` that visualises nodes and edges, highlights locked routes, and surfaces encounter chances per segment.
- For implementation specifics, see `UE5_Integration/World_Travel_System.md`.

### 3.2 Travel Execution and Encounters
- Use `BP_LocationRegistry` to track current location, known fast-travel points, safe zones, respawn anchors, and travel history. Share this data with SaveGame.
- During travel, `BP_TravelOrchestrator` steps through the `BP_TravelPlanner` path:
  1. Announce the segment (UI plus travel flavour text).
  2. Check for forced events (Events tied to Route or Location) before random rolls.
  3. Roll random encounters using route-level encounter weights, biome modifiers, and character stats (Luck or Stealth). Allow global toggles (`ToggleEncounters`, `ForceEncounter <Slug>`).
  4. For each triggered encounter, call into `BP_EncounterManager` (see below).
- Persist enough travel session state (seed + current segment index, at minimum) to pause/resume deterministically across encounters, save/load, or map transitions.
- Safe zones (Locations with `is_safe_zone`) bypass random encounter logic; route encounter weights drop to zero when either endpoint is safe and the route is marked safe in data.
- Fast Travel: if `is_fast_travel_point` is true and the player has discovered the location (Flag), the world map offers direct teleport. Requirements (currency cost, faction reputation, items) are validated via `BP_FlagManager` and `BP_CurrencyManager`.
- For dynamic world state, allow routes to change weights or unlock or lock based on Flags (for example a destroyed bridge). `BP_WorldGraphSubsystem` should respond to `OnFlagChanged` and rebuild only affected edges.

### 3.3 Encounter Pipeline
- `BP_EncounterManager` (World Subsystem) selects the encounter using data-driven criteria:
  - Filter Location or Route encounter lists by Requirements (`CheckRequirement`), Content Pack, and player Level Range.
  - Weight by `FEncounterData` difficulty, route hazard, and optional story priorities (quests that request specific encounters).
  - Support deterministic seeding to reproduce bugs (seed stored in SaveGame).
- Once chosen, call `BP_EventSequencer.StartEventByEncounter(EncounterId)`:
  - `EncounterType = Combat` leads to the combat pipeline (section 4).
  - `EncounterType = Dialogue` calls `BP_DialogueManager` with pre-travel context (for example a traveling merchant).
  - `EncounterType = Event` pipes to `BP_EventSequencer` for scripted sequences (teleports, cutscenes, rewards).
- After the encounter resolves, resume travel unless interrupted by story events (`next_event_id` chain). Provide callbacks so the travel UI can update progress.

> [Outcome] World traversal is deterministic, fast to query, and resilient to content changes. Designers can author complex travel requirements without touching Blueprints.

## 4. Combat System (Turn-Based)
### 4.1 Encounter Setup
- `BP_EncounterDirector` builds combat scenes from `FEncounterData`: spawn player pawn, companions, and enemies. Pull `FEnemyData` plus `FCharacterClassData` to initialise stats, abilities, and AI tags.
- Factor in Location or Route modifiers (weather, terrain) and event payloads (for example start battle with status effects). Encapsulate this in `FCombatContext` passed through the combat pipeline.
- Support multiple arena templates: load small battle levels or use sub-level streaming; ensure SaveGame records last location to resume post-combat.

### 4.2 Turn Flow
- `BP_TurnManager` orders combatants by Speed stat (re-sort each round if buffs adjust Speed). Expose UI hooks for turn order timeline.
- `BP_ActionQueue` stores declared actions, enabling preview UI and reaction abilities (interrupt or counter). Reaction triggers can be defined in Effect data (for example `OnHit`, `OnAllyKo`).
- Allow initiative modifiers: pre-emptive strikes, ambushes, or scripting (boss first turn). Encode as data flags so designers can swap behaviours without code.

### 4.3 Ability and Effect Resolution
- `BP_EffectResolver` evaluates each effect using `value_type`, `attribute_id`, and `scaling_stat_id`. Support hybrid calculations (flat plus scaling) and clamp logic to target minimum or maximum stats.
- `BP_StatusComponent` stores buffs or debuffs, ticking durations on turn end and applying stat overrides (stacking rules from Effect data). Provide events for UI and AI (for example `OnStunned`, `OnPoisonTick`).
- `BP_CombatFormulaLibrary` centralises derived calculations (damage, critical hit chance, resistances) so balancing changes live in one place. Optionally expose a DataTable for formula coefficients.
- Items used mid-battle route through `BP_ItemManager` and leverage the same Effect pipeline for consistency.

### 4.4 Enemy and Companion Behaviour
- All combatants inherit from `BP_BattleCharacter` (base stats, damage handling, effect hooks). `BP_PlayerCharacter`, `BP_EnemyCharacter`, and `BP_CompanionCharacter` extend it with specific logic.
- `BP_EnemyBrain` chooses actions based on AI tags defined in data (Aggressive, FocusHealer, UsesItems, and so on). Start simple (weighted random abilities) and layer heuristics (focus lowest HP, exploit weaknesses) via data-driven scoring tables.
- Phase-based encounters: use Flags or encounter state to swap ability sets under health thresholds (for example `Phase2Flag` toggled at 25 percent HP triggers a new ability list).

### 4.5 Rewards and Cleanup
- After combat, `BP_EncounterDirector` distributes rewards: XP (per enemy or Encounter reward struct), currency (`BP_CurrencyManager`), items (`BP_ItemManager`), reputation (`BP_ReputationSystem`), flags (`BP_FlagManager`). Record results in SaveGame.
- Trigger follow-up events via `FEncounterReward.next_event_id` or Event chains. Ensure combat UI, turn manager, and world subsystem clean up and restore player control cleanly.

> [Outcome] Combat remains modular, data-driven, and extendable. Designers tune abilities or effects without Blueprint rewrites, while engineers focus on formula libraries and AI heuristics.

## 5. Testing, Debugging, and Developer Shortcuts
1. Cheat and debug tools:
   - `BP_SoACheatManager` commands: `SpawnEncounter <Slug>`, `ToggleEncounters`, `SetFlag <Slug> <Value>`, `GiveItem <Slug> <Quantity>`, `DebugLookupRow <Table> <Slug>`, `UnlockRoute <Slug>`, `TravelTo <Slug>`.
   - `BP_DebugOverlayWidget` for toggles (instant travel, god mode, fast XP), travel graph visualisation, and live requirement checks.
2. Automation and validation:
   - Blueprint automation tests covering DataTable integrity (missing fields, dangling ULIDs), requirement edge cases, and travel graph coherence (no orphaned nodes, all routes connect valid locations).
   - Nightly commandlet: re-import data, run validation, emit JSON summary for CI.
3. Iteration helpers:
   - Hot reload DataTables in editor via `BP_DataImportManager` without restarting PIE.
   - Dialogue skip toggle: auto-complete current conversation and set associated flags for quick story traversal.
   - Logging strategy: gateway subsystems (`BP_EncounterManager`, `BP_TurnManager`, `BP_FlagManager`) print structured debug lines in Development builds; allow runtime toggle to avoid noise.
4. Balancing sandboxes:
   - `BP_TestBattleMode` loads specific encounters, companions, and equipment sets from a configuration DataTable for rapid tuning.
   - `BP_TravelSimulator` batch simulates travel between two points with variable stats or seeds, reporting encounter frequency and travel times for balancing.

> [Outcome] Developers validate content automatically, reproduce bugs deterministically, and skip straight to the scenario they need to test.

## Implementation Roadmap
| Phase | Focus | Key Deliverables |
| --- | --- | --- |
| 0 | Environment setup | Project structure (`Content/Data`, `/Blueprints/Systems`), enums matching backend strings, initial DataTables imported, automation smoke test configured. |
| 1 | Data access core | `BP_GameDataSubsystem`, `BP_DataImportManager`, validation sweeps, enum and struct parity checks. |
| 2 | Narrative spine | `BP_FlagManager`, `BP_QuestLogComponent`, `BP_StoryManager`, dialogue playback MVP, `BP_ContentPackRegistry`, save or load baseline. |
| 3 | World and travel | `BP_WorldGraphSubsystem`, `BP_TravelPlanner`, `BP_LocationRegistry`, encounter selection logic, travel UI and developer shortcuts. |
| 4 | Combat and encounters | `BP_EncounterDirector`, `BP_TurnManager`, `BP_EffectResolver`, `BP_StatusComponent`, `BP_EnemyBrain`, reward resolution, combat sandbox. |
| 5 | Tooling and polish | Automation suite, cheat or debug tooling, economy and shop integration, route simulations, performance tuning. |

## Immediate Next Steps
1. Finalise Blueprint Struct and Enum definitions using the integration guide; generate placeholder DataTables and confirm imports (Phase 0).
2. Prototype `BP_GameDataSubsystem` plus `BP_FlagManager` to validate requirement evaluation with exported sample data (bridge between Phases 1 and 2).
3. Author initial Location plus Route data to seed the travel graph and validate the planner with Development cheats.
4. Stand up dialogue playback for a single NPC to validate branching requirements before scaling to full story arcs.

## Quality Gates
- All DataTable imports succeed without warnings; validation sweeps catch missing rows, enum mismatches, or orphaned routes before runtime.
- Narrative progression (quests, flags, story arcs) advances predictably via blueprint-only logic, respecting content pack gating.
- Travel planner always finds valid routes (or returns meaningful errors) and honours safe zones, requirements, and world-state changes.
- Shop pricing helper (see `backend/app/utils/pricing.py`) produces consistent buy or sell values when consulted via Blueprint, and discrepancies surface in validation logs.
- Combat, dialogue, and event systems consume identical data sources; balancing adjustments propagate automatically through formula libraries.
- Automation tests run clean in CI (data integrity, requirement evaluation, encounter seeding). Development builds enable deterministic reproduction via seeds and cheats.

With these pillars in place, the SoA content pipeline can drive a blueprint-only UE5 JRPG that scales from prototype to full narrative release without rewiring gameplay logic every time the data evolves.
