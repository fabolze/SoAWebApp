# UE5 Integration Plan

A blueprint-only implementation roadmap that turns the SoA content repository into a narrative-focused JRPG inside Unreal Engine 5. This builds on `UE5_Integration/UE5_Blueprint_Integration_Guide.txt` and is backed by two new companion docs:

- `UE5_Integration/Data_Relationship_Map.md` � quick reference for which tables feed which systems.
- `UE5_Integration/Blueprint_Systems.md` � subsystem-level breakdown for data, narrative, combat, and tooling.

## Vision & Design North Star
- Deliver an author-first experience: narrative tools must let you iterate on branching stories, evocative dialogue, and companion side tales rapidly.
- Stay data-driven: all gameplay pulls from exported SoA DataTables so designers can update content without touching Blueprints.
- Support a lone protagonist with rotating companions: architecture separates the player hero from temporary allies while keeping combat, dialogue, and quest hooks consistent.
- Keep import/export painless: reimports from the SoA editor should be a one-click workflow with validation warnings for broken links.

## Current Content Coverage Snapshot
- Core datasets: Stats, Attributes, Attribute-to-Stat links, Abilities, Effects, Items, Currencies, Content Packs, Character Classes, NPCs, Dialogues with Nodes, Quests, Story Arcs, Timelines, Locations, Encounters, Events, Enemies, Factions, Flags, Requirements (with flag/reputation links), Shops, Shop Inventory, Lore Entries.
- Cross-link highlights: Abilities reference Effects and Attributes; Items reference Requirements, Item stat/attribute modifier tables, and effect payloads; Quests feed Story Arcs, Flags, and reward packages (xp, currency, reputation); NPCs bridge Locations, Dialogues, Shops, and Companions; Events chain Encounters, Dialogues, and reward payloads; Content Packs scope which arcs/flags surface; Requirements unify gating across systems.
- See the relationship map for exact field-level dependencies before wiring Blueprint lookups.

## Integration Pillars
### 1. Data Import & Validation
- Create `BP_GameDataSubsystem` to load all DataTables on game start, caching rows by ULID and slug.
- Build `BP_DataImportManager` (Editor Utility Widget) to batch re-import CSV/JSON exports, check enum strings, and flag missing references (items without requirements, quests pointing to absent arcs, etc.).
- Convert backend enums to synchronized Blueprint Enums (using the existing guide) and centralize them in `/Game/Data/Enums` for reuse.
- Introduce `BP_ContentPackRegistry` to load ContentPack tables, expose active pack filters, and gate story imports.
- Introduce `BP_CurrencyManager` to mirror Currency tables, expose wallet mutations, and plug into save/load.

### 2. Narrative State & Progression
- `BP_FlagManager` tracks all Flags, exposes Blueprint functions like `CheckRequirement`, `SetFlag`, `GetFlagValue`, and handles requirement link tables (required/forbidden flags, faction reputation minimums).
- `BP_StoryManager` sits on GameMode to orchestrate story arcs, branch resolution, and timeline progression based on `FStoryArcData` and `FEventData.next_event_id` chains, honoring active content packs from the registry.
- `BP_QuestLogComponent` on the Player reads quest objectives from data, syncs with Flags, updates UI, and gates progression.
- Companion flow: `BP_CompanionManager` spawns/despawns companions using `NPC.companion_config` and surfaces their loyalty/relationship arcs via Flags.

### 3. Character Build, Combat, & Stats
- Level progression calculates derived stats using Attribute-to-Stat links, CharacterClass growth curves, and Item bonuses.
- Combat layer leverages `BP_EncounterDirector`, `BP_TurnManager`, and `BP_EffectResolver` to translate Abilities + Effects into turn-based actions reminiscent of Octopath Traveler (break systems, buffs, debuffs, etc.).
- `BP_ItemManager` applies consumables/equipment, aggregating ItemStatModifier / ItemAttributeModifier rows and triggering JSON effect payloads.
- Design with extensibility for future multi-character parties; data already supports per-unit stats and abilities.

### 4. Dialogue, Events, & World Systems
- `BP_DialogueManager` consumes Dialogue + DialogueNode tables, evaluating requirements per node and triggering flags/quests/lore unlocks.
- `BP_EventSequencer` executes Events, chaining into Encounters, Dialogues, Teleports, or scripted scenes using `next_event_id`.
- `BP_LocationRegistry` and `BP_ReputationSystem` ensure world exploration, fast travel, and faction reputation logic reflect Flags, Faction thresholds, and Requirements.
- Shops, Lore Compendium, and Map UIs read directly from their tables, reusing the shared Requirements API for availability gating and the centralized pricing helper for buy/sell math.

### 5. Tooling, QA, & Narrative Iteration
- Establish Blueprint automation tests that load each DataTable row and validate mandatory fields (e.g., missing dialogue nodes, empty quest objectives).
- Build `DebugLookupRow` cheat commands for fast verification by slug during playtests.
- Adopt a nightly validation commandlet that exports current data, re-imports into a headless UE session, and logs schema or enum mismatches.

## Implementation Roadmap
| Phase     | Focus                     | Key Deliverables 
| ---       | ---                       | ---               
| 0         | Environment setup         | Project folder structure (`Content/Data`, `/Blueprints/Systems`), Blueprint Enums matching backend strings, initial DataTables imported. 
| 1         | Data access core          | `BP_GameDataSubsystem`, Data import widget, logging of broken references, helper functions for ULID/slug lookups. 
| 2         | Narrative spine           | Flag Manager, Quest Log, Story Manager, Dialogue Manager MVP (linear flow), Lore Compendium unlocks. 
| 3         | Combat & encounters       | Encounter Director, Turn Manager, Effect Resolver, Status Component, Item Manager, basic companion AI. 
| 4         | World polish & tooling    | Event Sequencer, Reputation & Location systems, Shop UI, automation tests, debug cheats, save/load integration. 

## Immediate Next Steps
1. Mirror backend enums in Blueprint and confirm DataTable struct fields match the SoA schema (see existing guide).
2. Prototype `BP_GameDataSubsystem` + `BP_FlagManager` to validate requirement evaluations against exported sample data.
3. Stand up dialogue playback using a single NPC to confirm requirement-driven branching works before scaling.

## Quality Gates
- Every DataTable import succeeds without warnings; missing references surface in validation logs, not at runtime.
- Narrative beats (quests, flags, story arcs) reproducibly advance via blueprint-only logic.
- Currency, content pack, and reputation references resolve to valid rows and update shared economy/reputation systems without runtime errors.
- Shop pricing helper produces consistent buy/sell values when fed item base_price plus shop/inventory modifiers; discrepancies surface in validation logs before export.
- Combat and dialogue systems read from identical data sources, ensuring narrative changes propagate automatically.



