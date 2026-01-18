# UE5 Integration Plan (Real-Time Top-Down Prototype)

A blueprint-only roadmap to build a real-time, top-down prototype inspired by Mini Healer, but with a fully buildable main character (talents, gear, and ability loadout). This plan uses Able for abilities and stays data-driven from the SoA exports.

Companion docs:
- `UE5_Integration/UE5_Blueprint_Integration_Guide.txt` - struct, enum, and DataTable import details.
- `UE5_Integration/UE5_Data_Relationship_Map.md` - field-level cross links.
- `UE5_Integration/UE5_Blueprint_Systems.md` - subsystem ownership and class boundaries.

## Vision and Prototype Scope
- Real-time, top-down boss encounter with a small party (player + 1-2 AI companions).
- Player is any buildable archetype (not forced healer). Talents and gear define role.
- One arena map, one boss encounter, a few abilities, and a small set of items.
- Data-driven: content comes from SoA DataTables and is reimportable.
- Blueprint-only logic with Able for abilities and telegraphs.

## Core Decisions
- Combat is real-time (no turn manager).
- Able is the ability system (abilities, cooldowns, cast times, telegraphs).
- Enhanced Input for all controls.
- Top-down camera with follow, free pan, and optional lock-on.

## 0. Project and Framework Basis
1. Game framework classes:
   - `BP_GameMode_Prototype`, `BP_GameState_Prototype`, `BP_PlayerController_Prototype`.
   - `BP_PlayerCharacter` (top-down movement) and `BP_CompanionCharacter`.
2. Content folders:
   - `/Game/Data/Enums`, `/Game/Data/Structs`, `/Game/Data/Tables`.
   - `/Game/Blueprints/Systems`, `/Game/Blueprints/Characters`, `/Game/UI`.
3. Plugin setup:
   - Enable Able and configure default ability component.
   - Enable Enhanced Input.

## 1. Data Structures and Imports (Prototype Minimum)
Minimum DataTables to run the prototype:
- Core: `stats`, `attributes`, `attribute_stat_links`.
- Combat: `abilities`, `ability_effect_links`, `ability_scaling_links`, `effects`, `statuses`.
- Characters: `characters`, `combat_profiles`, `interaction_profiles` (optional for UI hooks).
- Items: `items`, `item_stat_modifiers`, `item_attribute_modifiers` (for gear testing).
- Talents: `talent_trees`, `talent_nodes`, `talent_node_links` (simplified node set).
- Encounters: `encounters` (single boss fight).

Runtime data access:
- `BP_GameDataSubsystem` caches by ULID and slug and exposes lookup helpers.
- Validation pass after import to log missing ULIDs or enum mismatches.
- Enum and Struct source of truth: `UE5_Integration/UE5_Blueprint_Integration_Guide.txt` (do not duplicate or drift).

## 2. Input and Player Control
Enhanced Input mapping contexts:
- Movement: WASD / left stick, click-to-move optional.
- Camera: zoom, rotate, pan.
- Combat: basic attack, ability slots 1-4, interact.
- Targeting: next/prev, lock/unlock, aim-at-mouse optional.
- Companion commands: focus target, regroup, burst/ult.
- Debug: reset encounter, toggle hitboxes, toggle god mode.

Player control flow:
- `BP_PlayerController_Prototype` handles input routing.
- `BP_PlayerCharacter` consumes movement, facing, and ability requests.

## 3. Camera System (Top-Down)
- SpringArm + Camera rig with collision testing and lag tuning.
- Modes: follow (default), free pan (hold key), lock-on (optional).
- Helpers: `CursorToWorld`, `ScreenToWorld`, `GetMouseHit` for targeting.

## 4. Targeting System
- `BP_TargetingComponent` on the player controller or character to manage selection.
- `BPI_Targetable` interface and `BP_TargetableComponent` on actors.
- Target selection logic:
  - Soft target: nearest valid in cursor or cone.
  - Hard lock: cycle target list (next/prev) and keep until broken.
- Optional: range/LOS checks and highlight outline hook.

## 5. Combat System (Real-Time with Able)
Core components:
- `BP_CombatComponent`: central API for attack/ability requests and validation.
- `BP_StatsComponent` and `BP_HealthComponent` with events `OnStatsChanged` and `OnHealthChanged`.
- `BP_EffectResolver` + `BP_CombatFormulaLibrary` to apply `DamageSpec` (mitigation -> apply -> death).
- `BP_StatusComponent` for buffs, debuffs, and timed effects.

Able integration:
- `BP_AbleAbilityComponent` on combatants.
- Wrapper functions: `TryActivateAbility`, `CancelAbility`, `GetCooldownRemaining`.
- Ability context:
  - Instigator, target(s), target location, and source stats.
- Telegraphs:
  - `BP_TelegraphActor` spawned by ability and cleaned on execute/cancel.

Hit detection:
- Melee: traces or overlap volumes.
- Ranged: projectile or hitscan.

Status and tags:
- Minimal statuses: stun, slow, mark (optional).
- Tag events for AI behavior and UI cues.

## 6. Character Build Systems
Stats and attributes:
- Base stats loaded from `CombatProfile` and class data.
- Derived stats computed by `BP_StatsComponent`.
- Modifier stacking for gear, talents, buffs.

Talents:
- `BP_TalentManager` reads `TalentTree` and `TalentNodes`.
- Unlock state stored in SaveGame and applied as stat or ability mods.

Inventory and equipment:
- `BP_InventoryComponent` (slots, stacks).
- `BP_EquipmentComponent` (equip/unequip, stat modifiers).

## 7. AI and Encounter Flow
Encounter setup:
- `BP_EncounterDirector` spawns player, companions, and boss from `FEncounterData`.
- `FCombatProfileData` provides stats, abilities, and AI tags.

Boss AI:
- Behavior Tree or simple state machine.
- Phase thresholds driven by health percentage and data tags.

Companion AI:
- Follow, assist, and command states.
- Focus target and regroup logic tied to input commands.

## 8. UI (Prototype Level)
Minimum UI:
- Player HP/Resource bars and ability cooldowns.
- Target frame with name, HP, and status icons.
- Cast bar and telegraph indicators.
- Minimal inventory and talent panels for testing.

Debug UI:
- Toggle hitboxes, show targeting radius, show telegraph bounds.

## 9. Save and Load (Minimal)
- `BP_SaveGame_SoA` (prototype subset) stores:
  - Talents, gear, inventory, level, and current encounter state.
- Load applies stats and restores equipment and talent unlocks.

## 10. VFX and Audio Hooks (Minimal)
- `BPI_VFXHooks` and `BPI_AudioHooks` for hit, cast start, cast end, and telegraph.
- Placeholder assets acceptable for the prototype.

## 11. Dev and Debug Tools
- `BP_SoACheatManager` commands:
  - `GiveItem`, `SetLevel`, `SetTalent`, `SpawnBoss`, `ResetEncounter`.
- Encounter debug:
  - Force phase, reset fight, toggle AI.

## 12. Prototype Milestones
Phase 0: Data and framework
- DataTables import and `BP_GameDataSubsystem` caches.
- Base GameMode/Controller/Character.

Phase 1: Movement and camera
- Top-down movement, camera rig, input mapping contexts.

Phase 2: Targeting and Able
- Targetable system, Able ability activation, telegraphs.

Phase 3: Combat loop
- Damage pipeline, health, status, death, rewards.

Phase 4: Build systems
- Talents, gear modifiers, inventory and equipment.

Phase 5: Boss encounter
- Boss AI phases, companion commands, encounter reset.

Phase 6: UI and save
- HUD, target frame, minimal save/load.

## Quality Gates
- All DataTable imports succeed with zero warnings.
- Player can complete a full boss fight loop: engage, use abilities, survive, win/lose, reset.
- Ability cooldowns, cast times, and telegraphs are visible and consistent.
- Talent and gear changes affect stats and damage output.
- Debug commands allow fast iteration and reproducible tests.

With these pillars in place, the prototype supports a Mini Healer style fight flow while allowing any buildable main character in a real-time top-down combat loop.
