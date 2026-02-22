# UE5 Prototype Step-by-Step (Blueprint-Only, Real-Time Top-Down)

This is a practical build plan for the prototype described in `UE5_Integration_Plan.md`, using the boundaries in `UE5_Integration/UE5_Blueprint_Systems.md`.

It is written for a Blueprint-first workflow and assumes:
- you know UE5 basics (create BPs, add components, wire nodes),
- but you want more explicit implementation steps,
- especially for a central DataTable manager using a Blueprint `Object`.

Source of truth for enums/structs/tables:
- `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`

---

## Working Rules (short, enforceable)
- One small task per session (20-45 minutes).
- Always keep a playable loop (move, target, attack, reset).
- Do not add new canonical structs/enums outside the integration guide.
- DataTables are source data; runtime state lives in components/managers.
- Prefer typed Blueprint functions over generic "do everything" graphs.

---

## Core Blueprint Pattern (read once before Phase 0)

### What you are building
- `BP_GameInstance_SoA` = global runtime owner (survives map loads)
- `BP_GameDataService` = Blueprint `Object` that stores DataTable refs + cache maps + lookup functions
- `BFL_SoAHelpers` (optional) = stateless helper functions to fetch `BP_GameInstance_SoA` and `BP_GameDataService`

### Important UE distinction
- `Actor` -> use `Spawn Actor from Class`
- `Widget` -> use `Create Widget`
- `Object` -> use `Construct Object from Class`

### Constructor-like pattern (Blueprint Object)
Blueprint `Object` classes do not have normal `BeginPlay`.
Use this explicit flow:
1. `Construct Object from Class` (`BP_GameDataService`)
2. Save reference in `BP_GameInstance_SoA`
3. Call your own init function, e.g. `InitializeDataService`

This is your OOP-style "create instance + initialize" pattern.

---

## Phase 0 - Project Skeleton and Runtime Root (1-2 evenings)
Goal: You can press Play in a clean map, and the project already uses your custom `GameInstance`.

### Step 0.1 - Create folders
- Do: Create content folders:
  - `/Game/Blueprints/Core`
  - `/Game/Blueprints/Systems`
  - `/Game/Blueprints/Characters`
  - `/Game/Blueprints/UI`
  - `/Game/Data/Enums`
  - `/Game/Data/Structs`
  - `/Game/Data/Tables`
  - `/Game/Data/Debug`
- Done when: Content Browser shows all folders.

### Step 0.2 - Create root gameplay blueprints
- Do: Create:
  - `BP_GameInstance_SoA` (parent: `GameInstance`)
  - `BP_GameMode_Prototype`
  - `BP_GameState_Prototype`
  - `BP_PlayerController_Prototype`
- Do: In `Project Settings -> Maps & Modes`:
  - set `Game Instance Class` = `BP_GameInstance_SoA`
  - set default `GameMode` = `BP_GameMode_Prototype`
- Done when: PIE starts without warnings and uses your `GameMode`.

### Step 0.3 - Create player pawn
- Do: Create `BP_PlayerCharacter` from `Character`.
- Add:
  - `SpringArm`
  - `Camera`
- Do: Set `Default Pawn Class` in `BP_GameMode_Prototype`.
- Done when: PIE spawns the player reliably.

### Step 0.4 - Create a minimal arena map
- Do: Create one test map (flat floor, light, player start).
- Set as Editor Startup Map.
- Done when: PIE always opens the same map.

### Step 0.5 - Add startup logging (optional but useful)
- Do: In `BP_GameInstance_SoA`, add `Event Init` -> `Print String` ("GI Init").
- Done when: You can confirm `GameInstance` init fires once per PIE run.

---

## Phase 1 - Input and Top-Down Movement (2-3 evenings)
Goal: Move, rotate, and control camera reliably.

### Step 1.1 - Enhanced Input setup
- Do: Create Input Actions:
  - `IA_Move`
  - `IA_CameraZoom`
  - `IA_TargetNext`
  - `IA_TargetPrev`
  - `IA_LockTarget`
  - `IA_Ability1`..`IA_Ability4`
  - `IA_Interact`
- Do: Create one Input Mapping Context (`IMC_Prototype`).
- Do: In `BP_PlayerController_Prototype` BeginPlay:
  - get local player subsystem (Enhanced Input)
  - add mapping context
- Done when: Inputs fire print strings in PIE.

### Step 1.2 - Player movement
- Do: In `BP_PlayerCharacter`, bind move input to `AddMovementInput`.
- Keep this simple first:
  - forward/back on X
  - right/left on Y
- Done when: Movement is smooth and deterministic.

### Step 1.3 - Facing logic (pick one early)
- Option A: face movement direction (simpler)
- Option B: face mouse cursor (top-down shooter style)
- Do not implement both now.
- Done when: Facing direction is stable and predictable.

### Step 1.4 - Camera controls
- Do: Zoom by changing SpringArm length.
- Optional: add rotate/pan later if needed.
- Done when: Camera never clips badly and remains usable in combat.

---

## Phase 2 - Data Imports and Central Data Service (Core) (3-6 evenings)
Goal: `BP_GameInstance_SoA` owns one `BP_GameDataService` object that loads DataTables, builds caches, and serves typed lookup functions.

This phase is intentionally detailed because it becomes the foundation for stats, items, travel, encounters, and UI.

### Step 2.1 - Create Core data structs/enums (from guide)
- Do: Create the minimum Core enums/structs from `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`:
  - Stats
  - Attributes
  - AttributeStatLink
- Keep field names aligned exactly with imports.
- Done when: Structs compile and are selectable as DataTable row structs.

### Step 2.2 - Import minimal DataTables
- Do: Import small sample DataTables:
  - `DT_Stats`
  - `DT_Attributes`
  - `DT_AttributeStatLinks`
- Use only a few rows first (2-5 rows per table).
- Done when:
  - no import warnings,
  - rows are visible in editor,
  - row names are correct (slug or id, per your guide).

### Step 2.3 - Create the Blueprint Object class (`BP_GameDataService`)
- Do: Create Blueprint Class -> search for `Object` -> create `BP_GameDataService`.
- This is a plain object (not Actor, not Widget).
- Add variables:
  - `OwnerGameInstance` (`BP_GameInstance_SoA` reference, optional but helpful)
  - `DT_Stats` (`DataTable` object reference)
  - `DT_Attributes` (`DataTable` object reference)
  - `DT_AttributeStatLinks` (`DataTable` object reference)
- Add cache maps (typed):
  - `Map_StatsBySlug` (`Name -> FStatData`)
  - `Map_StatsById` (`String -> FStatData`)
  - `Map_AttributesBySlug` (`Name -> FAttributeData`)
  - `Map_AttributesById` (`String -> FAttributeData`)
- Done when: The object blueprint compiles and exposes variables/functions.

### Step 2.4 - Create the GameInstance-side service reference
- Do: In `BP_GameInstance_SoA`, add variables:
  - `GameDataService` (`BP_GameDataService` object reference)
  - `DT_Stats`
  - `DT_Attributes`
  - `DT_AttributeStatLinks`
- Assign the DataTable assets in `BP_GameInstance_SoA` Class Defaults.
- Why here: `GameInstance` is a stable owner and an easy place to set shared references.
- Done when: DataTables are visible and assigned in Class Defaults.

### Step 2.5 - Build the constructor-like init flow in `BP_GameInstance_SoA`
- In `BP_GameInstance_SoA` Event Graph, implement `Event Init`:
  1. `Construct Object from Class`
     - Class: `BP_GameDataService`
     - Outer: `self` (the `BP_GameInstance_SoA`)
  2. `Set GameDataService`
  3. Call `InitializeDataService` on `GameDataService`
     - pass `self`
     - pass `DT_Stats`, `DT_Attributes`, `DT_AttributeStatLinks`
  4. Optional: `Print String` success/failure info
- Done when:
  - `GameDataService` is not `None`,
  - no runtime errors in PIE,
  - init prints once.

### Step 2.6 - Add `InitializeDataService` in `BP_GameDataService`
- Create function: `InitializeDataService`
- Suggested inputs:
  - `InOwnerGameInstance` (`BP_GameInstance_SoA`)
  - `InDT_Stats` (`DataTable`)
  - `InDT_Attributes` (`DataTable`)
  - `InDT_AttributeStatLinks` (`DataTable`)
- Function body:
  1. Save inputs into object variables
  2. Validate tables are assigned (branch per table)
  3. Clear cache maps (important for re-init/reload)
  4. Call build functions:
     - `BuildStatsCache`
     - `BuildAttributesCache`
     - `BuildAttributeStatLinkCache` (optional if needed immediately)
  5. Set a bool like `bIsInitialized = true`
- Done when: A success print confirms cache counts are > 0.

### Step 2.7 - Implement `BuildStatsCache` (typed, explicit)
- Create function: `BuildStatsCache`
- Node pattern:
  1. `Clear` `Map_StatsBySlug`
  2. `Clear` `Map_StatsById`
  3. `Get Data Table Row Names` (`DT_Stats`)
  4. `ForEachLoop` row names
  5. `Get Data Table Row` (RowStruct = `FStatData`)
  6. If found:
     - add `RowName -> RowData` to `Map_StatsBySlug`
     - add `RowData.id -> RowData` to `Map_StatsById`
  7. If not found:
     - print warning with row name
- Done when:
  - map sizes match the table row count,
  - missing rows print warnings instead of silently failing.

### Step 2.8 - Implement `BuildAttributesCache`
- Repeat the same pattern as `BuildStatsCache`.
- Keep function names and behavior consistent.
- Done when: Attribute lookups work by both slug and id.

### Step 2.9 - Implement typed getter functions (first API pass)
- In `BP_GameDataService`, create:
  - `GetStatDataBySlug(RowSlug: Name) -> Found(bool), StatData(FStatData)`
  - `GetStatDataById(StatId: String) -> Found(bool), StatData(FStatData)`
  - `GetAttributeDataBySlug(RowSlug: Name) -> Found(bool), AttributeData(FAttributeData)`
- Getter pattern:
  1. `Map Find`
  2. Return `Found`
  3. Return row struct (default struct if not found)
  4. Optional: `Print String` on miss (debug builds only)
- Done when: No caller needs direct `Get Data Table Row` for these domains.

### Step 2.10 - Add one helper function library (stateless only)
- Create `BFL_SoAHelpers` (Blueprint Function Library).
- Add:
  - `GetSoAGameInstance(WorldContextObject) -> BP_GameInstance_SoA`
  - `GetGameDataService(WorldContextObject) -> BP_GameDataService`
- Function flow:
  - `Get Game Instance`
  - cast to `BP_GameInstance_SoA`
  - get `GameDataService`
- Done when: Components/widgets can fetch the service in one call.

### Step 2.11 - Smoke test the service in PIE
- Create a temporary test call (Controller BeginPlay or debug key):
  - `GetGameDataService`
  - call `GetStatDataBySlug`
  - print the stat name/value
- Done when: You see valid row data in PIE.

### Step 2.12 - Add a simple reload/debug path (optional, but worth it)
- Add `RebuildAllCaches` in `BP_GameDataService`
  - clears all caches
  - rebuilds all caches
- Add `DebugPrintCacheCounts`
- Done when: You can quickly verify cache counts after imports.

### Common mistakes in this phase (avoid early)
- Forgetting to set `Game Instance Class` in project settings.
- Creating `BP_GameDataService` as an `Actor` instead of `Object`.
- Expecting `BeginPlay` on `BP_GameDataService` (it will not behave like an Actor).
- Calling `Get Data Table Row` all over the codebase instead of using typed getters.
- Building caches before assigning DataTable references.

---

## Phase 3 - Targeting System (2-3 evenings)
Goal: Soft target + hard lock works in the arena.

### Step 3.1 - Targetable interface and component
- Do: Create `BPI_Targetable`.
- Do: Create `BP_TargetableComponent` with basic metadata:
  - display name (optional)
  - target socket/bone (optional)
  - targetable enabled bool
- Done when: A test enemy can implement/contain targetable behavior.

### Step 3.2 - Targeting component
- Do: Add `BP_TargetingComponent` to player controller or player character (pick one owner and keep it consistent).
- Implement:
  - `FindNearestTarget`
  - `LockTarget`
  - `UnlockTarget`
  - `CycleNextTarget`
- Done when: Target cycles and lock persists until target invalidates.

### Step 3.3 - Visual feedback
- Do: Add simple target indicator (widget or outline).
- Done when: You can always tell which target is locked.

---

## Phase 4 - Combat Scaffolding (3-5 evenings)
Goal: Basic damage works and health changes are visible.

### Step 4.1 - Stats and health components
- Add `BP_StatsComponent` and `BP_HealthComponent` to player and enemy.
- Start with a very small API:
  - `SetBaseStats`
  - `ApplyFlatModifier` (optional)
  - `ApplyDamage`
- Done when: `OnHealthChanged` fires and UI/debug prints react.

### Step 4.2 - Combat component
- Add `BP_CombatComponent`.
- Implement one basic attack path:
  - validate target
  - range check
  - produce damage payload
  - call resolver
- Done when: Player can damage a test enemy.

### Step 4.3 - Effect resolver hook
- Create a minimal `BP_EffectResolver` function library.
- One function first:
  - `ApplyDamageEffect(Source, Target, Payload)`
- Done when: Damage no longer directly subtracts HP in random places.

---

## Phase 5 - Able Integration (3-6 evenings)
Goal: Ability activation, cooldowns, and telegraphs work.

### Step 5.1 - Able component setup
- Add `BP_AbleAbilityComponent` to player and enemy.
- Create one test ability (single target or small AOE).
- Done when: Ability can activate from input.

### Step 5.2 - Wrap the plugin behind your own API
- In `BP_CombatComponent`, add wrapper functions:
  - `TryActivateAbility`
  - `CancelAbility`
  - `GetCooldownRemaining`
- Done when: UI/input call your wrapper, not plugin nodes directly.

### Step 5.3 - Telegraph
- Add `BP_TelegraphActor` or component.
- Spawn during pre-hit timing.
- Done when: Telegraph appears/disappears correctly and is easy to iterate.

---

## Phase 6 - Character Build Systems (3-6 evenings)
Goal: Gear and talents modify stats and combat output.

### Step 6.1 - Inventory and equipment
- Add `BP_InventoryComponent` and `BP_EquipmentComponent` to player.
- Use `BP_GameDataService` lookups for item data (no direct table reads in components).
- Done when: Equip/unequip changes stats via `BP_StatsComponent`.

### Step 6.2 - Talent manager
- Add `BP_TalentManager` (GameInstance-owned manager or `BP_GameInstance_SoA` function group).
- Import a tiny talent dataset.
- Done when: Unlocking a talent changes a stat or grants an ability.

---

## Phase 7 - Encounter Flow (3-6 evenings)
Goal: Spawn boss + companions, fight, and reset fast.

### Step 7.1 - Encounter director
- Implement `BP_EncounterDirector` using `FEncounterData`.
- Resolve data through `BP_GameDataService`:
  - encounter -> participants
  - participant -> character/combat profile
- Done when: Encounter spawns the right actors and teams.

### Step 7.2 - Boss AI
- Add a simple state machine or behavior logic in `BP_EnemyBrain`.
- Start with 1-2 abilities.
- Done when: Boss attacks and can be defeated.

### Step 7.3 - Reset loop
- Add one reset path (debug key/button/cheat).
- Done when: You can reset encounter in under 5 seconds.

---

## Phase 8 - UI (2-4 evenings)
Goal: Minimal UI supports combat and testing.

### Step 8.1 - HUD
- Add HP/resource bars and ability cooldowns.
- Bind to component events where possible (avoid per-frame polling first).
- Done when: UI visibly reacts to damage and cooldown changes.

### Step 8.2 - Target frame
- Add target name/HP frame.
- Done when: Switching targets updates the target frame reliably.

---

## Phase 9 - Save/Load (2-3 evenings)
Goal: Minimal persistence for build testing.

### Step 9.1 - SaveGame
- Add `BP_SaveGame_SoA` (prototype subset only).
- Save:
  - equipped items
  - learned talents
  - maybe player level/currency
- Do not save DataTable rows themselves; save IDs/row names.
- Done when: Save/load restores the build state.

---

## Phase 10 - Debug Tools (ongoing)
Goal: Fast iteration without editor-only tweaking.

### First debug commands to add
- `GiveItem`
- `SetTalent`
- `SpawnBoss`
- `ResetEncounter`
- `DebugLookupRow`
- `RebuildDataCaches`

### First debug UI toggles to add
- target radius
- telegraph bounds
- current target info
- cache counts (stats/items/etc.)

Done when: You can validate core systems without manually editing blueprints every session.

---

## Daily Session Template
Use this at the top of your notes:

```txt
Today:
One task (20-45m):
Done when:
Blocked by:
Notes:
```

---

## "What To Do First" (recommended order for your next sessions)
1. Finish `BP_GameInstance_SoA` + `BP_GameDataService` object construction flow.
2. Build `DT_Stats` + `DT_Attributes` caches and typed getters.
3. Add `BFL_SoAHelpers.GetGameDataService`.
4. Prove one component/widget can read data without touching DataTables directly.
5. Only then expand into items/talents/encounters.

---

## Minimal Playable Loop Checklist
You are done with the first prototype loop when:
- You can move, target, cast, and defeat a boss in one arena.
- Gear or talents visibly change combat results.
- Encounter can be reset quickly.
- Imports are stable (no DataTable warnings).
- Runtime systems read through `BP_GameDataService` instead of ad-hoc table lookups.
