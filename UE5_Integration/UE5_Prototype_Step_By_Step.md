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

## Returning After A Long Break
When you reopen the project and do not remember the exact state, do this before adding anything:

1. Press Play once.
2. Confirm the player spawns in the prototype arena.
3. Confirm movement/camera still work.
4. Confirm `BP_GameInstance_SoA` prints its init message once.
5. Confirm `BP_GameDataService` exists and has assigned DataTables.
6. Run the current smoke test for `GetGameDataService` and one stat lookup.
7. Open this document and continue from the first failed confirmation.

Do not continue into combat actors until the data service can be fetched from another Blueprint. The combat phases will depend on that habit even if the first enemy is manually placed.

### How To Read The Recommended Order
The numbered list near the bottom is a restart checklist, not a separate phase system. If you say you are "at step 5" in that list, that means:

- done already: the data service exists, stat/attribute caches work, and `BFL_SoAHelpers.GetGameDataService(self)` works from another Blueprint
- done already: `BP_BattleCharacter` exists and `BP_PlayerCharacter` has been reparented to it
- current task: create and manually place one `BP_EnemyCharacter` in the arena; see Step 3.2
- next task: add the fast reset path; see Step 3.3
- after that: build targeting in Phase 4, then health/basic damage in Phase 5

If you mean "Phase 5", start at the Phase 5 prerequisites and build the components in order: stats first, health second, resolver third, combat last. `BP_CombatComponent` depends on targeting and health already being callable.

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
- Why this exists:
  - Components, widgets, actors, and debug tools should not all repeat the same "get game instance, cast, get service" graph.
  - Later systems should not know where the service is stored. They should only know how to ask for it.
  - This keeps the codebase readable when you come back after a break.

#### Create the library asset
1. In Content Browser, go to `/Game/Blueprints/Core` or `/Game/Blueprints/Systems`.
2. Right-click -> Blueprint Class.
3. Open `All Classes`.
4. Search for `Blueprint Function Library`.
5. Name it `BFL_SoAHelpers`.

#### Function: `GetSoAGameInstance`
Create a function named `GetSoAGameInstance`.

Suggested signature:
- Input:
  - `WorldContextObject` (`Object Reference`)
- Outputs:
  - `Found` (`Boolean`)
  - `SoAGameInstance` (`BP_GameInstance_SoA Object Reference`)

Blueprint node flow:
1. Drag from `WorldContextObject`.
2. Use `Get Game Instance`.
3. `Cast To BP_GameInstance_SoA`.
4. On cast success:
   - set `Found = true`
   - return the cast result as `SoAGameInstance`
5. On cast failed:
   - set `Found = false`
   - return `None`
   - optional: `Print String` with `"GetSoAGameInstance failed"`

Notes:
- In a Blueprint Function Library, many UE nodes need a world context. Passing `WorldContextObject` explicitly makes the helper usable from actors, components, widgets, and debug code.
- If the function editor exposes advanced metadata such as `WorldContext`, you can use it later. For now, an explicit object input is easier to understand and debug.

#### Function: `GetGameDataService`
Create a function named `GetGameDataService`.

Suggested signature:
- Input:
  - `WorldContextObject` (`Object Reference`)
- Outputs:
  - `Found` (`Boolean`)
  - `GameDataService` (`BP_GameDataService Object Reference`)

Blueprint node flow:
1. Call `GetSoAGameInstance(WorldContextObject)`.
2. Branch on `Found`.
3. From `SoAGameInstance`, get variable `GameDataService`.
4. Check `Is Valid`.
5. If valid:
   - set `Found = true`
   - return `GameDataService`
6. If invalid:
   - set `Found = false`
   - return `None`
   - print `"GameDataService missing or not initialized"`

Done when:
- `BFL_SoAHelpers` compiles.
- From another Blueprint, you can call `GetGameDataService(self)`.
- The returned service is valid in PIE.
- No other Blueprint needs to manually cast the `GameInstance` just to read SoA data.

Common mistakes:
- Forgetting to pass a real world object as `WorldContextObject`. In an Actor or Component, `self` is fine.
- Returning the service without checking `Is Valid`.
- Putting gameplay state in the function library. Function libraries should stay stateless.

### Step 2.11 - Smoke test the service in PIE
- Create a temporary test call (Controller BeginPlay or debug key):
  - `GetGameDataService`
  - call `GetStatDataBySlug`
  - print the stat name/value
- Recommended location for the first smoke test:
  - `BP_PlayerController_Prototype` `BeginPlay`, or
  - a temporary debug input action such as `IA_DebugLookupRow`

Suggested test flow:
1. `BeginPlay`
2. `BFL_SoAHelpers.GetGameDataService(self)`
3. Branch on `Found`
4. Call `GetStatDataBySlug`
   - use one real row name from `DT_Stats`, for example `health` if that row exists
5. Branch on getter `Found`
6. Print a readable result:
   - success: `"Stat lookup OK: <display name or slug>"`
   - failure: `"Stat lookup failed"`

Done when:
- You see valid row data in PIE.
- A bad slug prints a controlled failure instead of causing a graph error.
- You can delete or disable the smoke test without affecting the data service itself.

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

## Sequencing Note For Combat Phases
- Build the first combat loop with one manually placed `BP_EnemyCharacter` in the arena.
- Do not block targeting/basic attacks on `DT_Characters`, `DT_CombatProfiles`, or `DT_Encounters`.
- Bring data-driven spawning online later in Encounter Flow, after the manual combat loop already works.

---

## Phase 3 - Combatant Foundation and Test Enemy (2-3 evenings)
Goal: Player and one enemy exist as combatants in the arena.

This phase is not full combat yet. It creates the shared actor shape that later targeting, health, stats, abilities, and UI will attach to.

### Before You Start Phase 3
You need these in place:
- `BP_PlayerCharacter` can move in the arena.
- `BP_GameMode_Prototype` spawns `BP_PlayerCharacter`.
- `BP_GameInstance_SoA` initializes without errors.
- `BFL_SoAHelpers.GetGameDataService(self)` works from another Blueprint.
- One prototype arena map opens reliably in PIE.

You do not need these yet:
- full character DataTables
- encounter spawning
- AI behavior trees
- final meshes or animations
- Able ability loadouts
- health bars or polished UI

### Step 3.1 - Create a shared combatant base
- Do: Create `BP_BattleCharacter` from `Character`.

#### Why this class exists
Both player and enemies will eventually need the same combat surface:
- a team/allegiance value
- a way to ask "can I be targeted?"
- a health/stat/combat component stack
- common debug labels
- common death/reset behavior

Putting that shared surface in `BP_BattleCharacter` prevents duplicating it in both `BP_PlayerCharacter` and `BP_EnemyCharacter`.

#### Create `BP_BattleCharacter`
1. Content Browser -> `/Game/Blueprints/Characters`.
2. Right-click -> Blueprint Class.
3. Pick `Character`.
4. Name it `BP_BattleCharacter`.
5. Open it and compile once before adding anything.

#### Add first variables
Add only simple variables now. Components come later unless you already know you need them.

Recommended variables:
- `TeamId` (`Integer`, default `0`)
  - `0` = neutral/debug
  - `1` = player side
  - `2` = enemy side
- `DisplayName` (`Text`, default `"Combatant"`)
- `bCanBeTargeted` (`Boolean`, default `true`)
- `bDefaultCanBeTargeted` (`Boolean`, default `true`)
  - restores targetability after death or arena reset
- `InitialTransform` (`Transform`)
  - useful for arena reset later
- `bIsDead` (`Boolean`, default `false`)

Recommended helper functions:
- `IsAlive() -> Boolean`
  - return `not bIsDead`
- `IsEnemyOf(OtherTeamId: Integer) -> Boolean`
  - return `TeamId != 0 and OtherTeamId != 0 and TeamId != OtherTeamId`
- `RememberInitialTransform()`
  - set `InitialTransform = GetActorTransform`
- `ResetPrototypeState()`
  - set `bIsDead = false`
  - set `bCanBeTargeted = bDefaultCanBeTargeted`
  - set actor transform to `InitialTransform`
  - later this will also reset health/cooldowns/statuses

Done when:
- `BP_BattleCharacter` compiles.
- The helper functions can be called from the graph.
- You have not moved player-specific camera/input logic into this class.

#### Reparent `BP_PlayerCharacter`
1. Open `BP_PlayerCharacter`.
2. Use `Class Settings`.
3. Change parent class from `Character` to `BP_BattleCharacter`.
4. Compile.
5. Fix any broken references if UE reports them.
6. Set player defaults:
   - `TeamId = 1`
   - `DisplayName = "Player"`
   - `bCanBeTargeted = false` for now, unless enemies already need to target the player
   - `bDefaultCanBeTargeted = false` for now, unless enemies already need to target the player

After reparenting, press Play and test:
- player still spawns
- movement still works
- camera still follows
- input mappings still fire
- no Blueprint runtime errors appear

Done when: Player control still works after the reparent.

If something breaks:
- Check `BP_GameMode_Prototype` still uses `BP_PlayerCharacter` as Default Pawn.
- Check the Player Controller still adds `IMC_Prototype`.
- Check camera components still exist on `BP_PlayerCharacter`.
- Check any cast to `Character` or old parent class still makes sense.

### Step 3.2 - Create a prototype enemy actor
- Do: Create `BP_EnemyCharacter` from `BP_BattleCharacter`.
- Keep the first version intentionally simple:
  - place it manually in the arena
  - use a visible placeholder mesh if needed
  - no full AI required yet

#### Create `BP_EnemyCharacter`
1. Content Browser -> `/Game/Blueprints/Characters`.
2. Right-click -> Blueprint Class.
3. Pick `BP_BattleCharacter` as the parent.
4. Name it `BP_EnemyCharacter`.
5. Open it and set defaults:
   - `TeamId = 2`
   - `DisplayName = "Training Enemy"`
   - `bCanBeTargeted = true`
   - `bDefaultCanBeTargeted = true`

#### Give it a visible placeholder
Use whichever is fastest:
- assign a basic mesh on the inherited `Mesh` component, or
- add a simple static mesh component such as a cube/capsule, or
- use the default character capsule plus a debug label

The only requirement is that you can identify it immediately in PIE.

#### Disable complexity for now
For the first enemy:
- no behavior tree
- no patrol
- no data-driven spawn
- no ability loadout
- no animation polish

This actor is a target dummy. Its job is to prove the arena and shared combatant base work.

#### Place the enemy
1. Open the prototype arena map.
2. Drag `BP_EnemyCharacter` into the level.
3. Place it a few meters away from the player start.
4. Rotate it toward the player if useful.
5. In the placed instance details, confirm `TeamId = 2`.

Optional but useful:
- In `BeginPlay` for `BP_BattleCharacter`, call `RememberInitialTransform`.
- Print `DisplayName` and `TeamId` once for placed combatants.

Done when:
- PIE always starts with at least one enemy actor present.
- The enemy is visible.
- Selecting the enemy in the Outliner shows it is a `BP_EnemyCharacter`.
- It inherits from `BP_BattleCharacter`.

If the enemy does not appear:
- Confirm it was placed in the map that PIE actually opens.
- Confirm it is not below the floor.
- Confirm hidden flags are not set.
- Confirm the mesh/material is visible, or rely on the capsule temporarily.

### Step 3.3 - Add a fast arena reset path
- Do: Add one reset path in Level Blueprint, `BP_GameMode_Prototype`, or a tiny `BP_PrototypeArenaDirector`.
- First version can:
  - respawn the test enemy, or
  - restore its transform/health
- Recommendation: create `BP_PrototypeArenaDirector`.
  - It keeps reset/debug arena logic out of the Level Blueprint.
  - It can later become the bridge to `BP_EncounterDirector`.
  - It is easier to find after a long break.

#### Create `BP_PrototypeArenaDirector`
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor`.
3. Name it `BP_PrototypeArenaDirector`.
4. Place one instance in the arena map.

Recommended variables:
- `EnemyClass` (`Class Reference` of `BP_EnemyCharacter`)
- `EnemySpawnTransform` (`Transform`)
- `CurrentEnemy` (`BP_EnemyCharacter Object Reference`)
- `PlayerStartTransform` (`Transform`, optional)

#### Choose reset approach A: restore placed enemy
This is simplest if the enemy is already placed manually.

Flow:
1. On `BeginPlay`, find the placed `BP_EnemyCharacter`.
2. Store it in `CurrentEnemy`.
3. Call `RememberInitialTransform` on it.
4. In `ResetArena`:
   - if `CurrentEnemy` is valid, call `ResetPrototypeState`
   - move player back to start if needed
   - print `"Arena reset"`

Use this approach first if you have exactly one target dummy.

#### Choose reset approach B: destroy and respawn enemy
This is better once death/destruction is involved.

Flow:
1. Set `EnemyClass = BP_EnemyCharacter`.
2. Set `EnemySpawnTransform` from a scene component, arrow component, or manually typed transform.
3. In `SpawnTestEnemy`:
   - if `CurrentEnemy` is valid, destroy it
   - `Spawn Actor from Class`
   - save return value to `CurrentEnemy`
   - call `RememberInitialTransform`
4. In `ResetArena`:
   - call `SpawnTestEnemy`
   - reset player position if needed
   - print `"Arena reset"`

Use this approach once enemies can die and be removed.

#### Bind reset to input
First simple option:
- Add `IA_ResetArena`.
- Map it to `R` or another debug key in `IMC_Prototype`.
- In `BP_PlayerController_Prototype`, on input:
  - find `BP_PrototypeArenaDirector`
  - call `ResetArena`

Acceptable temporary option:
- In Level Blueprint, bind a keyboard event and call the director.
- Replace it later when debug input is centralized.

Done when:
- You can reset the arena without manual repositioning in the editor.
- Reset works repeatedly in one PIE session.
- There is no need to stop PIE just to place the enemy again.
- The reset code has one obvious owner (`BP_PrototypeArenaDirector` or `BP_GameMode_Prototype`).

Common mistakes:
- Putting reset logic partly in Level Blueprint and partly in the enemy.
- Spawning multiple enemies because old `CurrentEnemy` was never destroyed.
- Resetting transform but forgetting future health/status state.
- Making reset depend on final encounter data too early.

### Phase 3 Exit Test
Before moving to targeting, verify:
- Player spawns, moves, and camera works.
- `BP_PlayerCharacter` parent is `BP_BattleCharacter`.
- `BP_EnemyCharacter` parent is `BP_BattleCharacter`.
- Player has `TeamId = 1`.
- Enemy has `TeamId = 2`.
- Enemy is visible in the arena.
- Reset can restore or respawn the enemy.
- `BFL_SoAHelpers.GetGameDataService(self)` still works after these changes.

If all are true, continue to Phase 4.

---

## Phase 4 - Targeting System (2-3 evenings)
Goal: enemy target, ally/support target, party focus target, and hard lock work in the arena.

This phase lets the player select the manual test enemy before real damage exists. Treat targeting as its own feature. Do not mix it with health, abilities, or AI yet.

### Before You Start Phase 4
You need these in place:
- Phase 3 exit test passes.
- `BP_PlayerCharacter` and `BP_EnemyCharacter` both inherit from `BP_BattleCharacter`.
- The arena contains one visible `BP_EnemyCharacter`.
- `BP_PlayerController_Prototype` owns input routing.
- You have input actions for target next/previous/lock, or you are ready to add them.

You do not need these yet:
- `BP_HealthComponent`
- `BP_CombatComponent`
- line-of-sight checks
- enemy AI
- real UI target frames
- final target marker meshes/materials

### Targeting Ownership Decision
Use this prototype default:
- Put `BP_TargetingComponent` on `BP_PlayerController_Prototype`.
- Let `BP_PlayerController_Prototype` own player-facing target intent.

Why:
- The player directly controls the main character, not every companion.
- Enemy targeting, ally/support targeting, party focus commands, and ground target confirmation are player intent.
- Input already routes through `BP_PlayerController_Prototype`.
- Keeping enemy and ally targets separate lets the player heal an ally without losing the current enemy target.

Shared logic:
- Do not duplicate player-facing targeting logic in player, companion, and enemy blueprints.
- Put target state and target switching functions in `BP_TargetingComponent`.
- Put targetable metadata on actors through `BPI_Targetable` and `BP_TargetableComponent`.
- Let companion/enemy AI keep local targets in their AI components if needed, influenced by `PartyFocusTarget`.

Ownership rule:
- `BP_PlayerController_Prototype`: owns input and click interpretation.
- `BP_TargetingComponent`: owns `CurrentEnemyTarget`, `CurrentAllyTarget`, `PartyFocusTarget`, optional `GroundTargetLocation`, soft enemy target, and lock state.
- `BP_PlayerCharacter`: reads controller target state for auto-basic attacks and player-triggered abilities.
- Companions: use AI and may consume `PartyFocusTarget`; the player does not normally possess companions directly.
- `BPI_Targetable`: exposes whether an actor can be targeted; it does not store who is targeting whom.

### Step 4.1 - Targetable interface and component
- Do: Create `BPI_Targetable`.
- Do: Create `BP_TargetableComponent` with basic metadata:
  - display name (optional)
  - target socket/bone (optional)
  - targetable enabled bool

#### Create `BPI_Targetable`
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Right-click -> Blueprints -> Blueprint Interface.
3. Name it `BPI_Targetable`.

Add interface functions:
- `CanBeTargeted() -> CanTarget(Boolean)`
- `GetTargetDisplayName() -> DisplayName(Text)`
- `GetTargetTeamId() -> TeamId(Integer)`
- `GetTargetLocation() -> TargetLocation(Vector)`
- `OnTargetLocked()`
- `OnTargetUnlocked()`

Keep these functions small. They expose target information; they do not choose targets.

#### Implement `BPI_Targetable` on `BP_BattleCharacter`
1. Open `BP_BattleCharacter`.
2. Class Settings -> Interfaces -> add `BPI_Targetable`.
3. Implement:
   - `CanBeTargeted`: return `bCanBeTargeted and IsAlive()`
   - `GetTargetDisplayName`: return `DisplayName`
   - `GetTargetTeamId`: return `TeamId`
   - `GetTargetLocation`: return `GetActorLocation`
   - `OnTargetLocked`: print or trigger a temporary visual
   - `OnTargetUnlocked`: clear the temporary visual

This makes every future battle character targetable through the same API. Individual child classes can override behavior later.

#### Create `BP_TargetableComponent` only if you want metadata separate
For this prototype, the interface on `BP_BattleCharacter` is enough.

Create `BP_TargetableComponent` if you prefer component-based metadata now:
- Parent class: `Actor Component`
- Variables:
  - `bTargetableEnabled` (`Boolean`, default `true`)
  - `DisplayNameOverride` (`Text`)
  - `TargetSocketName` (`Name`, optional)
  - `TargetRadius` (`Float`, default `80`)

If you add this component, add it to `BP_BattleCharacter` and have the interface read from it. If that feels like busywork, skip the component until visual target bounds matter.

Done when:
- `BP_BattleCharacter` implements `BPI_Targetable`.
- `BP_EnemyCharacter` returns `CanBeTargeted = true`.
- `BP_PlayerCharacter` returns `CanBeTargeted = false` for now, unless you need enemies to target the player.
- Calling `CanBeTargeted` on the placed enemy returns true in PIE.

Common mistakes:
- Implementing target search inside the interface.
- Making only `BP_EnemyCharacter` implement the interface, then forgetting future companions/bosses.
- Letting dead or reset-disabled actors remain targetable.

### Step 4.2 - Targeting component
- Do: Add `BP_TargetingComponent` to `BP_PlayerController_Prototype`.
- Implement:
  - `FindNearestEnemyTarget`
  - `SetEnemyTarget`
  - `SetAllyTarget`
  - `SetPartyFocusTarget`
  - `ClearEnemyTarget`
  - `CycleNextEnemyTarget`
  - `CyclePreviousEnemyTarget` as a prototype wrapper, or leave previous input unbound until you need true previous order

#### Create `BP_TargetingComponent`
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor Component`.
3. Name it `BP_TargetingComponent`.
4. Add it to `BP_PlayerController_Prototype`.

Recommended variables:
- `CurrentEnemyTarget` (`Actor Object Reference`)
- `CurrentAllyTarget` (`Actor Object Reference`)
- `PartyFocusTarget` (`Actor Object Reference`)
- `SoftEnemyTarget` (`Actor Object Reference`)
- `GroundTargetLocation` (`Vector`)
- `bHasPendingGroundTarget` (`Boolean`, default `false`)
- `SearchRadius` (`Float`, default `1800`)
- `bHasHardLock` (`Boolean`, default `false`)
- `EnemyTargetableActors` (`Array` of `Actor Object Reference`)
- `AllyTargetableActors` (`Array` of `Actor Object Reference`)
- `RecentEnemyTargets` (`Array` of `Actor Object Reference`)
  - small cycle history used by `CycleNextEnemyTarget`
- `RecentEnemyTargetLimit` (`Integer`, default `2`)
  - keep this low so Tab can move through targets without making the nearest enemy hard to return to
- `TargetObjectTypes` or collision channel settings if using sphere traces
- `OwnerController` (`BP_PlayerController_Prototype Object Reference`)
- `OwnerPawn` (`Pawn Object Reference`, optional cached value)

Recommended event dispatchers:
- `OnEnemyTargetChanged(NewTarget: Actor, bHardLocked: Boolean)`
- `OnAllyTargetChanged(NewTarget: Actor)`
- `OnPartyFocusChanged(NewTarget: Actor)`
- `OnEnemyTargetCleared()`
- `OnAllyTargetCleared()`
- optional: `OnPartyFocusCleared()`

#### Initialize the component
In `BP_TargetingComponent` `BeginPlay`:
1. Get owner.
2. Cast owner to `BP_PlayerController_Prototype`.
3. Store `OwnerController`.
4. Get controlled pawn.
5. Store `OwnerPawn`.
6. Optional: print `"Targeting ready"`.

#### Implement `RefreshTargetLists`
Create function `RefreshTargetLists`.

Suggested signature:
- Inputs:
  - none for now
- Outputs:
  - `EnemyTargets` (`Array` of `Actor Object Reference`)
  - `AllyTargets` (`Array` of `Actor Object Reference`)
  - optional: `bFoundEnemy` (`Boolean`)
  - optional: `bFoundAlly` (`Boolean`)

Simple first node flow:
1. Clear `EnemyTargetableActors` and `AllyTargetableActors`.
2. Get search origin:
   - if `OwnerPawn` valid: `OwnerPawn.GetActorLocation`
   - otherwise: controlled pawn location
3. Use `Sphere Overlap Actors`
   - origin: owner pawn location
   - radius: `SearchRadius`
   - class filter: `BP_BattleCharacter` if available, otherwise `Actor`
4. For each overlapped actor:
   - skip self/owner pawn
   - check `Does Implement Interface` -> `BPI_Targetable`
   - call `CanBeTargeted`
   - call `GetTargetTeamId`
   - compare team against player team
   - add enemies to `EnemyTargetableActors`
   - add allies to `AllyTargetableActors`
5. Return both arrays.
6. If using the optional bool outputs:
   - `bFoundEnemy = EnemyTargetableActors Length > 0`
   - `bFoundAlly = AllyTargetableActors Length > 0`

The optional bool outputs are only readability helpers. Keep them derived from the array lengths at the end of the function so they cannot get out of sync with the actual target arrays.

Prototype team rule:
- Player/friendly team is `1`.
- Enemy team is `2`.
- Valid enemy targets have `TargetTeamId != 1` and `TargetTeamId != 0`.
- Valid ally/support targets have `TargetTeamId == 1`.
- Friendly fire is off by default. Offensive abilities affect enemies, and healing/support abilities affect allies unless an ability explicitly defines mixed behavior.

Do not add line-of-sight yet. A radius search is enough for the first lock-on loop.

#### Implement `FindNearestEnemyTarget`
Suggested signature:
- Inputs:
  - none
- Outputs:
  - `Found` (`Boolean`)
  - `Target` (`Actor Object Reference`)

Node flow:
1. Call `RefreshTargetLists`.
2. If `EnemyTargetableActors` is empty:
   - return `Found = false`
   - return `None`
3. Get origin from `OwnerPawn`.
4. Loop over `EnemyTargetableActors`.
5. Compute distance from origin to target actor location.
6. Track the actor with the smallest distance.
7. Return it.

Done when a debug key can print the nearest enemy name.

If cycling only switches after you move closer to another enemy, debug `RefreshTargetLists` first:
- print `EnemyTargetableActors Length` before the cycle candidate loop
- confirm the other enemy is inside `SearchRadius`
- confirm the overlap object/channel settings include that enemy's capsule or collision component
- confirm the enemy implements `BPI_Targetable`, returns `CanBeTargeted = true`, and has enemy team id

Tab cycling can only choose actors currently returned by `RefreshTargetLists`. If you want Tab to cycle through all enemies in the active encounter regardless of player distance, use a wider `CycleSearchRadius` or an encounter-owned enemy list for cycling, and keep attack/ability range checks separate in `BP_CombatComponent`.

#### Implement `SetEnemyTarget`
Suggested signature:
- Input:
  - `Target` (`Actor Object Reference`)
- Output:
  - `Success` (`Boolean`)

Node flow:
1. If `CurrentEnemyTarget` is valid and different from `Target`, call `OnTargetUnlocked` on old target.
2. Validate new target:
   - is valid
   - implements `BPI_Targetable`
   - `CanBeTargeted` returns true
   - target team is enemy team
3. Set `CurrentEnemyTarget = Target`.
4. Set `bHasHardLock = true`.
5. Call `OnTargetLocked` on target.
6. Broadcast `OnEnemyTargetChanged`.
7. Return success.

Manual enemy targeting rule:
- Manual clicks and cycle input always override auto-targeting.
- Do not auto-switch away from `CurrentEnemyTarget` because of range.
- Keep the selected enemy for UI information such as health, casting, status, and "return to fight" behavior.
- Clear or replace `CurrentEnemyTarget` only when the target is destroyed, no longer valid as a gameplay target, manually cleared, or the player chooses another enemy.

#### Implement `SetAllyTarget`
Suggested signature:
- Input:
  - `Target` (`Actor Object Reference`)
- Output:
  - `Success` (`Boolean`)

Node flow:
1. Validate target:
   - is valid
   - implements `BPI_Targetable`
   - `CanBeTargeted` returns true
   - target team is player/friendly team
2. Set `CurrentAllyTarget = Target`.
3. Broadcast `OnAllyTargetChanged`.
4. Return success.

Important:
- Setting `CurrentAllyTarget` must not clear `CurrentEnemyTarget`.
- This lets the player keep attacking Wolf A while healing a companion.

#### Implement `SetPartyFocusTarget`
Suggested signature:
- Input:
  - `Target` (`Actor Object Reference`)
- Output:
  - `Success` (`Boolean`)

Node flow:
1. Validate target is targetable and alive.
2. Set `PartyFocusTarget = Target`.
3. Broadcast `OnPartyFocusChanged`.
4. Companion AI reads this value and prioritizes it.

If the focus target dies or becomes invalid, clear it and let companions return to default AI.

#### Implement `ClearEnemyTarget`
Node flow:
1. If `CurrentEnemyTarget` is valid, call `OnTargetUnlocked`.
2. Set `CurrentEnemyTarget = None`.
3. Set `bHasHardLock = false`.
4. Broadcast `OnEnemyTargetCleared`.

#### Implement `ClearAllyTarget`
Node flow:
1. Set `CurrentAllyTarget = None`.
2. Broadcast `OnAllyTargetCleared`.

#### Implement `ClearPartyFocusTarget`
Node flow:
1. Set `PartyFocusTarget = None`.
2. Broadcast `OnPartyFocusChanged(None)`.
3. Optional: also broadcast `OnPartyFocusCleared` if you created that dispatcher.

#### Implement `AutoSelectEnemyTarget`
This is the input-friendly wrapper:
1. If `CurrentEnemyTarget` is valid, do nothing.
2. Call `FindNearestEnemyTarget`.
3. If found, call `SetEnemyTarget`.
4. If not found, call `ClearEnemyTarget` or print `"No enemy target found"`.

Auto-target priority:
1. Closest valid enemy inside the targeting search radius.
2. Closest visible enemy if line-of-sight rules exist later.
3. No target if no valid enemies exist.

Range note:
- Auto-selection can use `SearchRadius` to discover a first target.
- Once selected, the target should not be cleared just because the player moves out of attack range or outside the search radius.
- Combat and UI should handle range separately, for example by disabling the attack, showing "Out of range", or moving the player toward the target later.

#### Implement `CycleNextEnemyTarget`
Use nearest-not-recent cycling instead of relying on overlap order.

Intent:
- first Tab press selects the nearest valid enemy
- next Tab press selects the nearest valid enemy that was not just selected
- a short recent-target history prevents immediately bouncing back to the same target
- the history stays small so nearby enemies can become selectable again quickly

Recommended history settings:
- `RecentEnemyTargets` stores the last selected enemy targets
- `RecentEnemyTargetLimit = 2`
- treat the array like a queue:
  - index `0` is the oldest entry
  - the last index is the newest entry

Node flow:
1. Call `RefreshTargetLists`.
2. If `EnemyTargetableActors` is empty:
   - clear `RecentEnemyTargets`
   - if `CurrentEnemyTarget` is valid, keep it selected and optionally print `"No cycle candidates"`
   - if `CurrentEnemyTarget` is not valid, call `ClearEnemyTarget`
   - return
3. Get origin:
   - if `OwnerPawn` valid: `OwnerPawn.GetActorLocation`
   - otherwise use `OwnerController.GetControlledPawn.GetActorLocation`
4. Find the nearest candidate that is not recently selected:
   - set local `BestCandidate = None`
   - set local `BestDistance = 999999999.0`
   - loop over `EnemyTargetableActors`
   - skip the actor if it equals `CurrentEnemyTarget`
   - skip the actor if `RecentEnemyTargets Contains` it
   - compute `Vector Distance` from origin to actor location
   - if distance is smaller than `BestDistance`, store this actor as `BestCandidate`
5. If `BestCandidate` is not valid:
   - clear `RecentEnemyTargets`
   - repeat the nearest-candidate loop, but only skip `CurrentEnemyTarget`
   - this lets the nearest enemies become selectable again after the short history is exhausted
6. If `BestCandidate` is still not valid:
   - call `FindNearestEnemyTarget`                        
   - if found, use that target as `BestCandidate`
   - this handles the one-enemy case by keeping or reselecting the only valid enemy
7. If `BestCandidate` is valid:
   - call `SetEnemyTarget(BestCandidate)`
   - if success, add `BestCandidate` to `RecentEnemyTargets`
   - while `RecentEnemyTargets Length > RecentEnemyTargetLimit`, remove index `0`

Example with `RecentEnemyTargetLimit = 2`:
- enemy distances are `A = 300`, `B = 700`, `C = 1200`
- Tab presses select `A`, then `B`, then `C`, then `A`
- with four or more enemies, this still favors nearby targets instead of forcing a full long cycle before returning to the nearest enemy

#### Implement `CyclePreviousEnemyTarget`
Do not implement a true previous order yet unless you have a stable sorted list.

Prototype node flow:
1. Call `CycleNextEnemyTarget`.
2. Optional: print `"CyclePreviousEnemyTarget uses prototype cycle behavior"`.

This keeps `IA_TargetPrev` callable without pretending the system already has a stable previous ordering. Later, replace this wrapper with screen-angle sorting or encounter-list ordering.

Do not let `SetEnemyTarget` manage `RecentEnemyTargets`. Keep cycle history inside cycle functions so manual clicks, ability targeting, and UI selection do not unexpectedly change Tab behavior.

#### Validate the current target
Create functions `ValidateEnemyTarget`, `ValidateAllyTarget`, and `ValidatePartyFocusTarget`.

Call it:
- before basic attacks
- before ability activation
- after arena reset
- optionally on a slow timer, not every tick unless needed

Shared validation rule:
- clear a stored target only when it is not valid anymore as a gameplay target
- do not clear stored targets because of distance
- range belongs to combat, ability, and UI checks, not to target ownership

`ValidateEnemyTarget` node flow:
1. If `CurrentEnemyTarget` is not valid: call `ClearEnemyTarget` and return `false`.
2. If it no longer implements `BPI_Targetable`: call `ClearEnemyTarget` and return `false`.
3. If `CanBeTargeted` returns false because the target is dead, destroyed, hidden from combat, or otherwise not a legal target anymore: call `ClearEnemyTarget` and return `false`.
4. If the target team is not an enemy team anymore: call `ClearEnemyTarget` and return `false`.
5. Do not clear because of distance.
6. Return `true`.
7. If `CurrentEnemyTarget` was cleared for a true invalidation reason, call `AutoSelectEnemyTarget` only if auto-targeting is allowed.

`ValidateAllyTarget` node flow:
1. If `CurrentAllyTarget` is not valid: call `ClearAllyTarget` and return `false`.
2. If it no longer implements `BPI_Targetable`: call `ClearAllyTarget` and return `false`.
3. If `CanBeTargeted` returns false because the target is dead, destroyed, hidden from combat, or otherwise not a legal support target anymore: call `ClearAllyTarget` and return `false`.
4. If the target team is not the player/friendly team anymore: call `ClearAllyTarget` and return `false`.
5. Do not clear because of distance.
6. Return `true`.

`ValidatePartyFocusTarget` node flow:
1. If `PartyFocusTarget` is not valid: call `ClearPartyFocusTarget` and return `false`.
2. If it no longer implements `BPI_Targetable`: call `ClearPartyFocusTarget` and return `false`.
3. If `CanBeTargeted` returns false because the target is dead, destroyed, hidden from combat, or otherwise not a legal focus target anymore: call `ClearPartyFocusTarget` and return `false`.
4. Do not clear because of distance.
5. Return `true`.

Keep range validation separate:
- target validation answers "does this selected target still exist and make sense as this kind of target?"
- ability/basic attack range checks answer "can this action currently reach the target?"
- UI can still display the selected target while showing an out-of-range state.

Done when:
- Enemy target cycles and lock persists through moving in and out of range.
- Ally target can change without clearing enemy target.
- Party focus target can be set for companions.
- Resetting the arena does not leave a stale destroyed target reference.
- The component exposes clean target getters for Phase 5 combat.

Common mistakes:
- Using `Get All Actors Of Class` every frame. It is okay for a debug key, but not as the final repeated search.
- Storing player-facing target state in both controller and character.
- Forgetting to unlock the old target before locking a new one.
- Assuming a target is valid just because the reference variable is set.

### Step 4.3 - Visual feedback
- Do: Add a visible target ring mesh for the locked enemy target.

The ring is visual feedback only. `BP_TargetingComponent` still owns target state, and targetable actors still expose visual hooks through `BPI_Targetable.OnTargetLocked` and `BPI_Targetable.OnTargetUnlocked`.

Use a mesh marker for the prototype. A ring actor is easy to debug, easy to scale per enemy, does not need renderer settings, and works even when the target uses placeholder meshes.

#### Create the target ring asset
Use whichever is fastest:
- a thin torus static mesh,
- a flat ring mesh imported from DCC,
- a simple circular decal if you already prefer decals,
- or a flat plane with a transparent ring material.

Recommended first version:
1. Create or choose a flat ring mesh that sits on the ground plane.
2. Create `M_TargetRing_Enemy`.
3. Give it an obvious emissive color, for example yellow/cyan.
4. Set the material to unlit if you want it readable in any arena lighting.
5. If using transparency, set Blend Mode to `Translucent` or `Masked`.

Keep the first material simple and obvious. The goal is a reliable selection marker, not final art.

#### Create `BP_TargetRingActor`
Create a small actor that owns the visual marker.

1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor`.
3. Name it `BP_TargetRingActor`.
4. Add components:
   - `SceneRoot`
   - `RingMesh` (`Static Mesh Component`)
5. Assign the ring mesh and `M_TargetRing_Enemy` to `RingMesh`.

Recommended component settings:
- Collision Enabled: `No Collision`
- Cast Shadows: `false`
- Hidden In Game: `false`
- Mobility: `Movable`
- Relative Location: `(0, 0, 2)` or just above the floor
- Relative Rotation: align the ring flat to the ground

Recommended variables:
- `TargetActor` (`Actor Object Reference`)
- `TargetAnchor` (`Scene Component Object Reference`, optional)
- `FollowGroundZOffset` (`Float`, default `2.0`)
- `RingScale` (`Float`, default `1.0`)
- `bFollowTarget` (`Boolean`, default `true`)

At this point the actor only has data and a visible mesh. It does not follow anything yet. The follow behavior is added in the next function.

Create function `AttachToTarget`.

Suggested signature:
- Input:
  - `InTarget` (`Actor Object Reference`)
  - `InTargetAnchor` (`Scene Component Object Reference`, optional)

Node flow:
1. Set `TargetActor = InTarget`.
2. Set `TargetAnchor = InTargetAnchor`.
3. If `TargetActor` is not valid, hide the actor and return.
4. Set actor hidden in game to `false`.
5. Set ring location:
   - if `TargetAnchor` is valid, use `TargetAnchor.GetWorldLocation + (0, 0, FollowGroundZOffset)`
   - otherwise use `TargetActor.GetActorLocation + (0, 0, FollowGroundZOffset)`
6. Set the visible mesh scale:
   - call `SetRelativeScale3D` on `RingMesh`
   - value = `(RingScale, RingScale, 1.0)`

For the first prototype, do not make this more mathematical than it needs to be. The ring only has to be readable and roughly fit the target.

Why `Z = 1.0`:
- the ring is a flat ground marker
- changing X and Y makes the circle wider
- changing Z can make a torus/mesh look vertically stretched or oddly thick

Optional later: if you want large enemies to size automatically, replace `RingScale` with a radius-based setup:
- add `TargetRingRadius` on `BP_BattleCharacter`
- add `RingMeshRadiusAtScale1` on `BP_TargetRingActor`
- compute `DesiredScale = TargetRingRadius / RingMeshRadiusAtScale1`
- call `SetRelativeScale3D` on `RingMesh` with `(DesiredScale, DesiredScale, 1.0)`

Only add this later if you have enemies with meaningfully different footprint sizes. Until then, one manually tuned `RingScale` is enough.

#### Add a ring anchor to `BP_BattleCharacter`
Add a `Scene Component` to `BP_BattleCharacter`:
- Name: `TargetRingAnchor`
- Parent: capsule/root component
- Relative Location: near the character's feet

For a default `Character` capsule, start with:
- `X = 0`
- `Y = 0`
- `Z = -CapsuleHalfHeight + 2`

The exact Z value can be adjusted visually in the viewport. The anchor exists so the target ring sits on the floor instead of floating at the character capsule center.

#### Add marker ownership to `BP_BattleCharacter`
Create variables on `BP_BattleCharacter`:
- `TargetRingClass` (`Class Reference` of `BP_TargetRingActor`, default `BP_TargetRingActor`)
- `ActiveTargetRing` (`BP_TargetRingActor Object Reference`)

Create function `SetTargetRingEnabled`.

Suggested signature:
- Input:
  - `bEnabled` (`Boolean`)

Node flow:
1. If `bEnabled` is true:
   - if `ActiveTargetRing` is not valid:
     - spawn `TargetRingClass` at `GetActorLocation`
     - save the return value to `ActiveTargetRing`
   - call `AttachToTarget(self, TargetRingAnchor)`
2. If `bEnabled` is false:
   - if `ActiveTargetRing` is valid, destroy it
   - set `ActiveTargetRing = None`

Alternative component version:
- Add `TargetRingMesh` directly to `BP_BattleCharacter`.
- Assign the ring mesh/material.
- Attach it to `TargetRingAnchor`.
- Set it hidden by default.
- In `SetTargetRingEnabled`, only toggle `Set Hidden In Game`.

Use the actor version if you want one reusable marker class with its own follow/scale logic. Use the component version if you want the fewest moving parts. Do not implement both in the prototype.

Wire the interface:
- `OnTargetLocked`
  - call `SetTargetRingEnabled(true)`
- `OnTargetUnlocked`
  - call `SetTargetRingEnabled(false)`

#### Make the ring follow its target
Add this after `AttachToTarget`, `TargetRingAnchor`, and `SetTargetRingEnabled` exist.

The simplest prototype approach is to update the ring location on `Tick` while `bFollowTarget` is true. This is acceptable here because there is only one active selected-target marker most of the time.

In `BP_TargetRingActor` Event Graph:
1. If `TargetAnchor` is valid, set ring actor location to anchor location plus Z offset.
2. Else if `TargetActor` is valid, set ring actor location to target location plus Z offset.
3. If `TargetActor` is not valid, destroy the ring actor or hide it.

Later, if the marker should be cheaper or more deterministic, attach it to the target actor instead of ticking:
- `Attach Actor To Actor`
- Parent: target actor
- Location Rule: `Keep World` or `Snap to Target`
- then set relative location to the ground offset

#### First visual test
Only test this after `BP_TargetRingActor`, `TargetRingAnchor`, `SetTargetRingEnabled`, and the interface wiring above exist.

1. Set `RingScale = 1.0` on `BP_TargetRingActor`.
2. Press Play.
3. Lock the enemy target.
4. Look at the ring from the gameplay camera.
5. If it is too small, try `1.25`, `1.5`, or `2.0`.
6. If it is too large, try `0.75`.

This is intentionally visual tuning. The exact value depends on the mesh you chose, the camera angle, and how large the enemy appears in game.

#### Optional: support different marker types
Do not add this until the enemy lock marker works.

The current `OnTargetLocked` / `OnTargetUnlocked` interface is enough for one enemy lock marker. It does not say what kind of marker should be shown. If you need ally, focus, and hover markers later, add a slightly more general marker function on `BP_BattleCharacter`.

Keep this visual-only. Do not make a new canonical gameplay enum unless the integration guide adds one later.

Implementation order:
1. Make material instances for each marker style.
2. Add `SetMarkerStyle` to `BP_TargetRingActor`.
3. Add `SetTargetMarkerState` to `BP_BattleCharacter`.
4. Convert `SetTargetRingEnabled` into a wrapper for the enemy lock style.
5. Update `SetAllyTarget`, `SetPartyFocusTarget`, and hover code to call `SetTargetMarkerState` directly.

Recommended simple setup:
1. Create material instances:
   - `MI_TargetRing_EnemyHardLock`: yellow/cyan
   - `MI_TargetRing_AllyTarget`: green/blue
   - `MI_TargetRing_PartyFocus`: orange/white
   - `MI_TargetRing_HoverSoftTarget`: dim/thin
2. In `BP_TargetRingActor`, add variables:
   - `MI_EnemyHardLock` (`Material Instance`)
   - `MI_AllyTarget` (`Material Instance`)
   - `MI_PartyFocus` (`Material Instance`)
   - `MI_HoverSoftTarget` (`Material Instance`)
3. In `BP_TargetRingActor`, create function `SetMarkerStyle`.

Suggested `SetMarkerStyle` signature:
- Input:
  - `MarkerStyle` (`Name`)

Node flow:
1. Switch on `MarkerStyle`.
2. If `EnemyHardLock`, set `RingMesh` material to `MI_EnemyHardLock`.
3. If `AllyTarget`, set `RingMesh` material to `MI_AllyTarget`.
4. If `PartyFocus`, set `RingMesh` material to `MI_PartyFocus`.
5. If `HoverSoftTarget`, set `RingMesh` material to `MI_HoverSoftTarget`.
6. Optional: set a different `RingScale` for hover/focus if needed.

Use exact `Name` values for the prototype:
- `EnemyHardLock`
- `AllyTarget`
- `PartyFocus`
- `HoverSoftTarget`

Then, in `BP_BattleCharacter`, create `SetTargetMarkerState`.

Suggested signature:
- Inputs:
  - `bEnabled` (`Boolean`)
  - `MarkerStyle` (`Name`, default `EnemyHardLock`)

Node flow:
1. If `bEnabled` is true:
   - if `ActiveTargetRing` is not valid:
     - spawn `TargetRingClass` at `GetActorLocation`
     - save the return value to `ActiveTargetRing`
   - call `SetMarkerStyle(MarkerStyle)` on `ActiveTargetRing`
   - call `AttachToTarget(self, TargetRingAnchor)` on `ActiveTargetRing`
2. If `bEnabled` is false:
   - if `ActiveTargetRing` is valid, destroy it
   - set `ActiveTargetRing = None`

After this exists, `SetTargetRingEnabled` can become a tiny wrapper:
- if `bEnabled` is true, call `SetTargetMarkerState(true, EnemyHardLock)`
- if `bEnabled` is false, call `SetTargetMarkerState(false, EnemyHardLock)`

This keeps the existing interface wiring working:
- `OnTargetLocked` still calls `SetTargetRingEnabled(true)`
- `OnTargetUnlocked` still calls `SetTargetRingEnabled(false)`

For other marker types, call `SetTargetMarkerState` from the system that owns that state:
- `SetAllyTarget`: call `SetTargetMarkerState(true, AllyTarget)` on the new ally target, and clear the previous ally marker first
- `SetPartyFocusTarget`: call `SetTargetMarkerState(true, PartyFocus)` on the focus target, and clear the previous focus marker first
- hover/soft target: call `SetTargetMarkerState(true, HoverSoftTarget)` only when hover changes, and clear the previous hover marker

This simple setup supports one active marker actor per combatant. If the same actor can be both enemy lock and party focus at the same time, pick a prototype priority:
- `EnemyHardLock` wins over `PartyFocus`
- `PartyFocus` wins over `HoverSoftTarget`
- `AllyTarget` wins over `HoverSoftTarget`

Do not support stacked rings yet unless you truly need it. Stacked rings require separate marker actors/components per marker layer, such as `ActiveEnemyRing`, `ActiveFocusRing`, and `ActiveHoverRing`.

Keep this driven by target state changes, not by every frame of input.

#### Keep target switching clean
In `BP_TargetingComponent.SetEnemyTarget`:
1. If `CurrentEnemyTarget` is valid and different from the new target, call `OnTargetUnlocked` on the old target.
2. Validate the new target.
3. Set `CurrentEnemyTarget`.
4. Set `bHasHardLock = true`.
5. Call `OnTargetLocked` on the new target.
6. Broadcast `OnEnemyTargetChanged`.

In `ClearEnemyTarget`:
1. If `CurrentEnemyTarget` is valid, call `OnTargetUnlocked`.
2. Set `CurrentEnemyTarget = None`.
3. Set `bHasHardLock = false`.
4. Broadcast `OnEnemyTargetCleared`.

This order matters. Most marker bugs in this phase come from spawning a new ring while leaving the old target's ring alive.

#### Debug checklist
If the ring does not show:
- Confirm `OnTargetLocked` and `OnTargetUnlocked` are firing with print strings.
- Confirm `TargetRingClass` is assigned on `BP_BattleCharacter`.
- Confirm `BP_TargetRingActor` has a mesh assigned to `RingMesh`.
- Confirm `TargetRingAnchor` is near the target's feet.
- Confirm the material is not fully transparent.
- Confirm the ring is above the floor and not z-fighting.
- Confirm `SetTargetRingEnabled(true)` saves the spawned actor into `ActiveTargetRing`.
- Temporarily set the ring scale larger, for example `2.0`.
- Temporarily disable shadowing and collision on `RingMesh`.

Things to watch:
- A ring attached to the character root may float if the character capsule origin is high. Prefer `TargetRingAnchor` for ground markers.
- Large enemies may need their own `BP_TargetRingActor` default `RingScale`, or the optional radius-based setup described above.
- If enemies can die or be destroyed, call `OnTargetUnlocked` or `SetTargetRingEnabled(false)` before destruction/reset.
- Do not clear a target just because the ring is not visible. Visibility and target validity are separate systems.

Done when:
- You can always tell which enemy target is locked.
- Switching targets removes the ring from the old target and applies it to the new target.
- Unlocking removes the ring.
- Resetting the arena does not leave a stale ring actor in the level.



### Step 4.4 - Wire targeting input
If not already done in Phase 1, create or confirm:
- `IA_TargetNext`
- `IA_TargetPrev`
- `IA_LockTarget`
- optional later: `IA_SelectOrTargetClick`

In `BP_PlayerController_Prototype`:
1. Ensure it has `BP_TargetingComponent`.
2. On enemy click:
   - call `SetEnemyTarget`
3. On ally or party UI click:
   - call `SetAllyTarget`
   - do not clear `CurrentEnemyTarget`
4. On focus command input plus enemy click:
   - call `SetPartyFocusTarget`
5. On `IA_LockTarget`:
   - if `bHasHardLock` is true, call `ClearEnemyTarget`
   - otherwise call `AutoSelectEnemyTarget`
6. On `IA_TargetNext`:
   - call `CycleNextEnemyTarget`
7. On `IA_TargetPrev`:
   - call `CyclePreviousEnemyTarget`
8. For ground-target abilities:
   - enter pending ground target mode
   - show targeting circle later in Phase 6
   - on ground click, set `GroundTargetLocation` and activate/confirm the ability
   - on right-click or Escape, cancel pending ground target

Suggested keys:
- Tab: target next
- Shift+Tab or Q: target previous
- Middle Mouse or T: lock/unlock
- Dedicated command key + click: set party focus target
- Right-click or Escape: cancel pending ground target

Done when:
- You can lock a target without using editor-only calls.
- You can cycle enemy targets from input.
- Clicking an ally changes support target without changing enemy target.
- Setting party focus gives companion AI a target to prioritize later.
- Inputs still work after arena reset.

### Step 4.5 - Add targeting debug helpers
Add these to `BP_TargetingComponent`:
- `DebugPrintTargets`
  - prints enemy target count, ally target count, current enemy target, current ally target, party focus target, and hard lock state
- `DebugDrawSearchRadius`
  - optional: draw debug sphere around player
- `GetCurrentEnemyTarget() -> Target, Found`
- `GetCurrentAllyTarget() -> Target, Found`
- `GetPartyFocusTarget() -> Target, Found`
  - companion AI and later ability logic will call this

Done when:
- You can quickly answer "why is nothing targetable?"
- Combat code can ask for the needed target without reading component internals.

### Phase 4 Exit Test
Before moving to health/combat:
- Press Play.
- Enemy is visible.
- Press lock key.
- Enemy becomes current target.
- Target ring appears on or under the enemy.
- Click an ally or party UI test actor.
- Ally target changes and enemy target remains unchanged.
- Set party focus target.
- Debug print shows party focus target.
- Press lock key again.
- Target clears and target ring disappears.
- Press target next/previous.
- Target changes or stays stable if only one enemy exists.
- Move away from the selected enemy.
- Target remains selected, but combat/range checks can report it as out of range.
- Press reset.
- Target reference clears or retargets cleanly.
- `GetCurrentEnemyTarget` returns the locked enemy while locked.

If all are true, continue to Phase 5.

---

## Phase 5 - Combat Scaffolding (3-5 evenings)
Goal: Basic damage works and health changes are visible.

This phase should stay prototype-simple, but the boundaries matter. The components you create here are the first real combat API that later Able abilities, items, talents, AI, and UI will call.

### Before You Start Phase 5
You need these in place:
- Phase 4 exit test passes.
- `BP_BattleCharacter` has `TeamId`, `DisplayName`, `bCanBeTargeted`, `bIsDead`, `IsAlive`, and reset helpers.
- `BP_PlayerController_Prototype` has `BP_TargetingComponent`.
- `BP_TargetingComponent.GetCurrentEnemyTarget() -> Target, Found` exists.
- Enemy target locking does not clear just because the player moves out of attack range.

You do not need these yet:
- Able abilities
- full ability/effect DataTables
- item/talent modifiers
- enemy AI attacks
- final health bars
- mitigation, crits, resistances, or damage types

### Combat Ownership Decision
Use this prototype default:
- Put `BP_StatsComponent`, `BP_HealthComponent`, and `BP_CombatComponent` on `BP_BattleCharacter`.
- Let `BP_PlayerCharacter` and `BP_EnemyCharacter` inherit those components.
- Put player target choice in `BP_TargetingComponent`, not in `BP_CombatComponent`.
- Put damage application in `BP_EffectResolver`, not directly inside input, targeting, or ability graphs.

Why:
- `BP_BattleCharacter` is the shared combatant base, so both player and enemy should expose the same stat, health, and combat API.
- `BP_TargetingComponent` answers "what does the player intend to target?"
- `BP_CombatComponent` answers "can this actor attack that target right now?"
- `BP_EffectResolver` answers "what actually happens when damage/healing/effects are applied?"
- `BP_HealthComponent` owns current health and death notification.
- After `BP_HealthComponent` exists, it is the source of truth for health/death. `BP_BattleCharacter.bIsDead` remains a simple shared flag for targeting, reset, and debug checks.

Important data distinction:
- `FStatData` from `DT_Stats` describes a stat definition: id, slug, display name, min/max, value type.
- `BP_StatsComponent` stores this actor's current numeric stat values.
- `BP_HealthComponent` stores current health. Do not store current health in the DataTable.
- For the first prototype, key runtime stat values by stat slug (`Name`) because your `DT_Stats` row names are slugs and they are readable in Blueprints.
- Later, when character/combat-profile imports are wired, you can add id-based setters that resolve `stat_id` strings through `BP_GameDataService`.

Recommended prototype stat slugs:
- `max_health`
- `attack_power`
- `basic_attack_range`
- `basic_attack_cooldown`

If your `DT_Stats` uses different row names, use those exact slugs. Do not invent a second name for the same stat.

### Step 5.1 - Create `BP_StatsComponent`
Create an Actor Component:
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor Component`.
3. Name it `BP_StatsComponent`.
4. Add it to `BP_BattleCharacter`.

Recommended variables:
- `OwnerCombatant` (`BP_BattleCharacter Object Reference`)
- `BaseStatsBySlug` (`Name -> Float` map)
- `FlatModifiersBySlug` (`Name -> Float` map)
- `FinalStatsBySlug` (`Name -> Float` map)
- `bStatsInitialized` (`Boolean`, default `false`)
- `DefaultMaxHealth` (`Float`, default `100`)
- `DefaultAttackPower` (`Float`, default `10`)
- `DefaultBasicAttackRange` (`Float`, default `300`)
- `DefaultBasicAttackCooldown` (`Float`, default `1.0`)

Recommended event dispatchers:
- `OnStatsChanged`

#### Initialize the stats component
In `BP_StatsComponent.BeginPlay`:
1. Get owner.
2. Cast owner to `BP_BattleCharacter`.
3. Store `OwnerCombatant`.
4. If `bStatsInitialized` is false, call `InitializePrototypeStats`.

Create function `InitializePrototypeStats`.

Node flow:
1. Clear `BaseStatsBySlug`.
2. Add `max_health -> DefaultMaxHealth`.
3. Add `attack_power -> DefaultAttackPower`.
4. Add `basic_attack_range -> DefaultBasicAttackRange`.
5. Add `basic_attack_cooldown -> DefaultBasicAttackCooldown`.
6. Call `RecalculateFinalStats`.
7. Set `bStatsInitialized = true`.

Set different defaults on child Blueprint instances if needed:
- `BP_PlayerCharacter`: `DefaultMaxHealth = 120`, `DefaultAttackPower = 12`
- `BP_EnemyCharacter`: `DefaultMaxHealth = 50`, `DefaultAttackPower = 6`

#### Add stat functions
Create function `SetBaseStat`.

Suggested signature:
- Inputs:
  - `StatSlug` (`Name`)
  - `Value` (`Float`)

Node flow:
1. Add or update `BaseStatsBySlug[StatSlug] = Value`.
2. Call `RecalculateFinalStats`.

Create function `ApplyFlatModifier`.

Suggested signature:
- Inputs:
  - `StatSlug` (`Name`)
  - `Delta` (`Float`)

Node flow:
1. Find current modifier value in `FlatModifiersBySlug`.
2. If not found, use `0`.
3. Set `FlatModifiersBySlug[StatSlug] = Current + Delta`.
4. Call `RecalculateFinalStats`.

Create function `GetStatValue`.

Suggested signature:
- Inputs:
  - `StatSlug` (`Name`)
  - `FallbackValue` (`Float`, default `0`)
- Outputs:
  - `Found` (`Boolean`)
  - `Value` (`Float`)

Node flow:
1. `Find` in `FinalStatsBySlug`.
2. If found, return `Found = true` and the value.
3. If not found, return `Found = false` and `FallbackValue`.

Create function `RecalculateFinalStats`.

Node flow:
1. Clear `FinalStatsBySlug`.
2. For each entry in `BaseStatsBySlug`:
   - get matching flat modifier from `FlatModifiersBySlug`, or `0`
   - set `FinalStatsBySlug[StatSlug] = BaseValue + ModifierValue`
3. For any modifier key that does not exist in `BaseStatsBySlug`, optionally add `ModifierValue` as the final value.
4. Broadcast `OnStatsChanged`.

Keep this additive only for now. Percent modifiers, derived attributes, and scaling formulas belong later after the first damage loop works.

Done when:
- `BP_BattleCharacter` has `BP_StatsComponent`.
- Player and enemy can have different default stat values.
- A debug print can call `GetStatValue(max_health)` and get a number.
- `OnStatsChanged` fires when `SetBaseStat` or `ApplyFlatModifier` changes a value.

Common mistakes:
- Treating `DT_Stats.default_value` as every character's current stat. It is a definition fallback, not character runtime state.
- Keying one graph by slug and another by display name. Use slugs only here.
- Recomputing health current value inside `BP_StatsComponent`. Current HP belongs to `BP_HealthComponent`.

### Step 5.2 - Create `BP_HealthComponent`
Create an Actor Component:
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor Component`.
3. Name it `BP_HealthComponent`.
4. Add it to `BP_BattleCharacter`.

Recommended variables:
- `OwnerCombatant` (`BP_BattleCharacter Object Reference`)
- `StatsComponent` (`BP_StatsComponent Object Reference`)
- `CurrentHealth` (`Float`)
- `MaxHealth` (`Float`)
- `bIsDead` (`Boolean`, default `false`)
  - mirrors `BP_BattleCharacter.bIsDead`; the health component drives the value after Phase 5

Recommended event dispatchers:
- `OnHealthChanged(CurrentHealth: Float, MaxHealth: Float, Delta: Float)`
- `OnDeath(SourceActor: Actor)`

#### Initialize health from stats
In `BP_HealthComponent.BeginPlay`:
1. Get owner.
2. Cast owner to `BP_BattleCharacter`.
3. Store `OwnerCombatant`.
4. Get `BP_StatsComponent` from owner.
5. Call `InitializeHealthFromStats`.

Create function `InitializeHealthFromStats`.

Node flow:
1. If `StatsComponent` is valid:
   - call `GetStatValue(max_health, 100)`
   - set `MaxHealth` to returned value
2. If `StatsComponent` is not valid:
   - set `MaxHealth = 100`
3. Set `CurrentHealth = MaxHealth`.
4. Set `bIsDead = false`.
5. If `OwnerCombatant` is valid:
   - set `OwnerCombatant.bIsDead = false`
   - set `OwnerCombatant.bCanBeTargeted = OwnerCombatant.bDefaultCanBeTargeted`
6. Broadcast `OnHealthChanged(CurrentHealth, MaxHealth, 0)`.

If component BeginPlay order causes health to initialize before stats, call `InitializeHealthFromStats` from `BP_BattleCharacter.BeginPlay` after stats initialization. In child Blueprints, always call parent `BeginPlay` before child-specific startup logic.

#### Add health functions
Create function `ApplyDamage`.

Suggested signature:
- Inputs:
  - `Amount` (`Float`)
  - `SourceActor` (`Actor Object Reference`)
- Outputs:
  - `AppliedDamage` (`Float`)
  - `Killed` (`Boolean`)

Node flow:
1. If `bIsDead` is true, return `AppliedDamage = 0`, `Killed = false`.
2. Clamp `Amount` to at least `0`.
3. Store `OldHealth = CurrentHealth`.
4. Set `CurrentHealth = Clamp(CurrentHealth - Amount, 0, MaxHealth)`.
5. Set `AppliedDamage = OldHealth - CurrentHealth`.
6. Broadcast `OnHealthChanged(CurrentHealth, MaxHealth, -AppliedDamage)`.
7. If `CurrentHealth <= 0`:
   - set `bIsDead = true`
   - if `OwnerCombatant` is valid, set `OwnerCombatant.bIsDead = true`
   - if `OwnerCombatant` is valid, set `OwnerCombatant.bCanBeTargeted = false`
   - if `OwnerCombatant` has `SetTargetRingEnabled`, call `SetTargetRingEnabled(false)`
   - broadcast `OnDeath(SourceActor)`
   - return `Killed = true`
8. Otherwise return `Killed = false`.

Create function `Heal`.

Suggested signature:
- Inputs:
  - `Amount` (`Float`)
  - `SourceActor` (`Actor Object Reference`)
- Outputs:
  - `AppliedHealing` (`Float`)

Node flow:
1. If `bIsDead` is true, return `0` for now.
2. Clamp `Amount` to at least `0`.
3. Store `OldHealth = CurrentHealth`.
4. Set `CurrentHealth = Clamp(CurrentHealth + Amount, 0, MaxHealth)`.
5. Set `AppliedHealing = CurrentHealth - OldHealth`.
6. Broadcast `OnHealthChanged(CurrentHealth, MaxHealth, AppliedHealing)`.

Create function `ResetHealth`.

Node flow:
1. Call `InitializeHealthFromStats`.
2. If `OwnerCombatant` is valid, set `OwnerCombatant.bIsDead = false`.

Create function `IsAlive`.

Output:
- `Alive` (`Boolean`) = `not bIsDead and CurrentHealth > 0`

Done when:
- Player and enemy both have `BP_HealthComponent`.
- A debug call to `ApplyDamage(10)` lowers enemy health.
- `OnHealthChanged` prints the current/max health.
- Death sets `bIsDead = true`, disables targetability, and removes the target ring.

Common mistakes:
- Subtracting health directly in `BP_CombatComponent`.
- Forgetting to broadcast `OnHealthChanged` on initialization and reset.
- Letting a dead enemy stay targetable.
- Resetting actor transform but not resetting health.

### Step 5.3 - Create the minimal `BP_EffectResolver`
Create a Blueprint Function Library:
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Blueprint Function Library`.
3. Name it `BP_EffectResolver`.

For now, do not create a new canonical damage struct. The integration guide already defines ability/effect data for later, and the prototype only needs a direct function call.

Create function `ApplyDamageEffect`.

Suggested signature:
- Inputs:
  - `SourceActor` (`Actor Object Reference`)
  - `TargetActor` (`Actor Object Reference`)
  - `RawDamage` (`Float`)
  - `DebugReason` (`Name`, default `BasicAttack`)
- Outputs:
  - `Success` (`Boolean`)
  - `AppliedDamage` (`Float`)
  - `Killed` (`Boolean`)

Node flow:
1. Validate `TargetActor`.
2. Get component by class from `TargetActor`: `BP_HealthComponent`.
3. If missing:
   - return `Success = false`, `AppliedDamage = 0`, `Killed = false`
   - optional: print `"ApplyDamageEffect failed: target has no BP_HealthComponent"`
4. Clamp `RawDamage` to at least `0`.
5. Call `BP_HealthComponent.ApplyDamage(RawDamage, SourceActor)`.
6. Return `Success = true`, plus `AppliedDamage` and `Killed` from the health component.

Later expansion path:
- Add `BP_CombatFormulaLibrary` for mitigation, crit, resistance, and scaling.
- Add an effect-data overload that accepts `FEffectData` or ability effect row data.
- Keep the final health change routed through `BP_HealthComponent.ApplyDamage`.

Done when:
- No combat graph directly subtracts `CurrentHealth`.
- A debug call to `BP_EffectResolver.ApplyDamageEffect(Player, Enemy, 10)` damages the enemy.
- Missing health components fail gracefully instead of throwing Blueprint runtime errors.

### Step 5.4 - Create `BP_CombatComponent`
Create an Actor Component:
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor Component`.
3. Name it `BP_CombatComponent`.
4. Add it to `BP_BattleCharacter`.

Recommended variables:
- `OwnerCombatant` (`BP_BattleCharacter Object Reference`)
- `StatsComponent` (`BP_StatsComponent Object Reference`)
- `HealthComponent` (`BP_HealthComponent Object Reference`)
- `CachedTargetingComponent` (`BP_TargetingComponent Object Reference`, player only)
- `bAutoBasicAttackEnabled` (`Boolean`, default `true` on player, `false` on enemy for now)
- `BasicAttackCheckInterval` (`Float`, default `0.1`)
- `LastBasicAttackTime` (`Float`, default `-999`)
- `bDebugCombat` (`Boolean`, default `true`)

Recommended event dispatchers:
- `OnBasicAttackStarted(Source: Actor, Target: Actor)`
- `OnBasicAttackLanded(Source: Actor, Target: Actor, Damage: Float)`
- `OnBasicAttackFailed(Reason: Name)`

#### Initialize the combat component
In `BP_CombatComponent.BeginPlay`:
1. Get owner.
2. Cast owner to `BP_BattleCharacter`.
3. Store `OwnerCombatant`.
4. Get `BP_StatsComponent` from owner and store it.
5. Get `BP_HealthComponent` from owner and store it.
6. If owner is player-controlled, call `FindPlayerTargetingComponent`.
7. If `bAutoBasicAttackEnabled` is true, call `StartAutoBasicAttack`.

Create function `FindPlayerTargetingComponent`.

Node flow:
1. Get owner pawn or owner actor.
2. If it is a pawn, get controller.
3. Cast controller to `BP_PlayerController_Prototype`.
4. Get component by class: `BP_TargetingComponent`.
5. Store result in `CachedTargetingComponent`.

If this fails on BeginPlay because possession is not complete yet, call it again inside `TryAutoBasicAttack` when `CachedTargetingComponent` is not valid.

#### Add attack control functions
Create function `StartAutoBasicAttack`.

Node flow:
1. Set `bAutoBasicAttackEnabled = true`.
2. Use `Set Timer by Function Name` or `Set Timer by Event`.
3. Timer interval = `BasicAttackCheckInterval`.
4. Looping = true.
5. Timer calls `TryAutoBasicAttack`.

Create function `StopAutoBasicAttack`.

Node flow:
1. Set `bAutoBasicAttackEnabled = false`.
2. Clear the auto-basic timer.

Create function `TryAutoBasicAttack`.

Node flow:
1. If `bAutoBasicAttackEnabled` is false, return.
2. If `HealthComponent` is valid and `HealthComponent.IsAlive` is false, return.
3. If `CachedTargetingComponent` is not valid, call `FindPlayerTargetingComponent`.
4. If still not valid:
   - broadcast `OnBasicAttackFailed(NoTargetingComponent)`
   - return
5. Call `CachedTargetingComponent.GetCurrentEnemyTarget`.
6. If not found:
   - broadcast `OnBasicAttackFailed(NoEnemyTarget)`
   - return
7. Call `CanBasicAttackTarget(Target)`.
8. If false, return.
9. Call `PerformBasicAttack(Target)`.

Create function `CanBasicAttackTarget`.

Suggested signature:
- Inputs:
  - `TargetActor` (`Actor Object Reference`)
- Outputs:
  - `CanAttack` (`Boolean`)
  - `FailReason` (`Name`)

Node flow:
1. Validate `OwnerCombatant` and `TargetActor`.
2. If target does not implement `BPI_Targetable`, return `false`, `NotTargetable`.
3. Call `CanBeTargeted` on the target. If false, return `false`, `TargetInvalid`.
4. Get target team through `BPI_Targetable.GetTargetTeamId`.
5. If owner team and target team are not enemies, return `false`, `WrongTeam`.
6. Call `IsTargetInBasicAttackRange`. If false, return `false`, `OutOfRange`.
7. Call `IsBasicAttackCooldownReady`. If false, return `false`, `Cooldown`.
8. Return `true`, `None`.

Range rule:
- Being out of range must not call `ClearEnemyTarget`.
- The selected target remains selected for UI, movement, and later approach behavior.

Create function `IsTargetInBasicAttackRange`.

Suggested signature:
- Inputs:
  - `TargetActor` (`Actor Object Reference`)
- Outputs:
  - `InRange` (`Boolean`)
  - `Distance` (`Float`)

Node flow:
1. Get `basic_attack_range` from `StatsComponent` with fallback `300`.
2. Compute `Vector Distance` from owner location to target location.
3. Return `Distance <= basic_attack_range`.

Create function `IsBasicAttackCooldownReady`.

Output:
- `Ready` (`Boolean`)

Node flow:
1. Get `basic_attack_cooldown` from `StatsComponent` with fallback `1.0`.
2. Get current game time in seconds.
3. Return `CurrentTime - LastBasicAttackTime >= basic_attack_cooldown`.

Create function `PerformBasicAttack`.

Suggested signature:
- Input:
  - `TargetActor` (`Actor Object Reference`)

Node flow:
1. Broadcast `OnBasicAttackStarted(OwnerCombatant, TargetActor)`.
2. Get `attack_power` from `StatsComponent` with fallback `10`.
3. Set `RawDamage = attack_power`.
4. Call `BP_EffectResolver.ApplyDamageEffect(OwnerCombatant, TargetActor, RawDamage, BasicAttack)`.
5. If success:
   - set `LastBasicAttackTime = current game time in seconds`
   - broadcast `OnBasicAttackLanded(OwnerCombatant, TargetActor, AppliedDamage)`
   - optional print: `"Basic attack hit <target> for <damage>"`
6. If failed:
   - broadcast `OnBasicAttackFailed(ResolverFailed)`

Done when:
- `BP_BattleCharacter` has `BP_CombatComponent`.
- Player auto-basic is enabled.
- Enemy auto-basic is disabled for now unless you intentionally add enemy attacks.
- Player combat can read `CurrentEnemyTarget` through `BP_TargetingComponent`.
- Moving out of range stops attacks but does not clear target selection.
- Moving back into range resumes attacks after cooldown.

Common mistakes:
- Adding `BP_TargetingComponent` to `BP_BattleCharacter`. Keep it on the player controller for this prototype.
- Calling `GetCurrentEnemyTarget` from the player character when the component lives on the controller, then wondering why the component is missing.
- Clearing the target when range fails.
- Letting the timer keep attacking after the owner dies.

### Step 5.5 - Wire health, death, reset, and debug prints
Add the first debug wiring before building UI.

In `BP_BattleCharacter.BeginPlay`:
1. Call `RememberInitialTransform`.
2. Ensure stats are initialized.
3. Ensure health is initialized from stats.
4. Bind `BP_HealthComponent.OnHealthChanged` to a simple print or debug event.
5. Bind `BP_HealthComponent.OnDeath` to `HandlePrototypeDeath`.

Create function `HandlePrototypeDeath` on `BP_BattleCharacter`.

Suggested signature:
- Input:
  - `SourceActor` (`Actor Object Reference`)

Node flow:
1. Set `bIsDead = true`.
2. Set `bCanBeTargeted = false`.
3. Call `SetTargetRingEnabled(false)` if the target ring function exists.
4. Optional: stop movement.
5. Optional: hide or ragdoll later; for now, a print is enough.

Update `ResetPrototypeState` on `BP_BattleCharacter`:
1. Set actor transform to `InitialTransform`.
2. Set `bIsDead = false`.
3. Set `bCanBeTargeted = bDefaultCanBeTargeted`.
4. Call `BP_HealthComponent.ResetHealth`.
5. Call `SetTargetRingEnabled(false)`.

Update the arena reset path from Step 3.3:
- Clear or validate current targets on `BP_TargetingComponent`.
- Reset all placed `BP_BattleCharacter` actors.
- Do not leave `CurrentEnemyTarget` pointing at a dead or destroyed actor.

Done when:
- Damage prints readable health values.
- Death prints once.
- Dead enemies stop being targetable.
- Reset restores enemy health and targetability.
- Reset removes stale target rings.

### Step 5.6 - Ability target-resolution rules for later
Do not implement full abilities in this phase, but keep the target rules clear now:
- automatic basic attack uses `CurrentEnemyTarget`
- offensive single-target ability uses `CurrentEnemyTarget`
- heal, shield, or buff uses `CurrentAllyTarget`, or self fallback if that ability allows it
- party-focus target is for companion AI commands, not necessarily the player's current attack target
- ground-target ability uses confirmed `GroundTargetLocation`
- none of these should clear the enemy target just because an ally/support target changes

Phase 6 will plug Able activation into this same combat API. Do not wire Able directly into health subtraction.

### Phase 5 Exit Test
Before moving to Able:
- Press Play.
- Lock the placed enemy.
- Stand in basic attack range.
- The player damages the selected enemy every cooldown.
- Enemy health prints as current/max.
- Move out of range.
- Attacks stop, but the enemy remains selected.
- Move back into range.
- Attacks resume.
- Enemy reaches zero health.
- Enemy death prints once.
- Enemy becomes untargetable and its target ring disappears.
- Press reset.
- Enemy health returns to max.
- Enemy becomes targetable again.
- `BP_TargetingComponent` no longer holds a stale dead target.

If all are true, continue to Phase 6.

---

## Phase 6 - Able Integration (3-6 evenings)
Goal: Ability activation, cooldowns, and telegraphs work.

### Step 6.1 - Able component setup
- Add `BP_AbleAbilityComponent` to player and enemy.
- Create one test ability (single target or small AOE).
- Keep this phase prototype-driven:
  - assign the first ability directly in Blueprint if that is faster,
  - do not wait for data-driven loadout assembly yet
- Done when: Ability can activate from input.

### Step 6.2 - Wrap the plugin behind your own API
- In `BP_CombatComponent`, add wrapper functions:
  - `TryActivateAbility`
  - `CancelAbility`
  - `GetCooldownRemaining`
- Done when: UI/input call your wrapper, not plugin nodes directly.

### Step 6.3 - Telegraph
- Add `BP_TelegraphActor` or component.
- Spawn during pre-hit timing.
- Done when: Telegraph appears/disappears correctly and is easy to iterate.

---

## Phase 7 - Character Build Systems (3-6 evenings)
Goal: Gear and talents modify stats and combat output.

### Step 7.1 - Minimal build data import
- Import only the smallest item/talent dataset needed for the prototype.
- Extend `BP_GameDataService` with the typed getters those systems need before wiring UI.
- Done when: Inventory/equipment/talent logic stops hardcoding item or talent definitions.

### Step 7.2 - Inventory and equipment
- Add `BP_InventoryComponent` and `BP_EquipmentComponent` to player.
- Use `BP_GameDataService` lookups for item data (no direct table reads in components).
- Done when: Equip/unequip changes stats via `BP_StatsComponent`.

### Step 7.3 - Talent manager
- Add `BP_TalentManager` (GameInstance-owned manager or `BP_GameInstance_SoA` function group).
- Import a tiny talent dataset.
- Done when: Unlocking a talent changes a stat or grants an ability.

---

## Phase 8 - Encounter Flow (3-6 evenings)
Goal: Spawn small readable encounters, optional companions, fight, and reset fast.

Start encounter scale small:
- simple encounter: 1 enemy
- normal encounter: 2-3 enemies
- special encounter: 1 stronger enemy plus 1-2 weaker enemies
- boss encounter: 1 boss, optionally with limited adds

### Step 8.1 - Character and encounter data prerequisites
- Import the minimum data needed for data-driven combat:
  - `characters`
  - `combat_profiles`
  - `encounters`
- Extend `BP_GameDataService` with typed caches/getters for:
  - characters by id/slug
  - combat profile by character id
  - encounter by id or slug
- Done when: `BP_EncounterDirector` can resolve a participant without direct table reads.

### Step 8.2 - Encounter director
- Implement `BP_EncounterDirector` using `FEncounterData`.
- Resolve data through `BP_GameDataService`:
  - encounter -> participants
  - participant -> character/combat profile
- Done when: Encounter spawns the right actors and teams for 1-3 enemy fights.

### Step 8.3 - Enemy and companion AI
- Add a simple state machine or behavior logic in `BP_EnemyBrain`.
- Enemies move toward their target, try to enter attack range, and reposition if blocked.
- Use simple avoidance first. Slight overlap is acceptable if combat remains readable.
- Add companion AI later through a small command set: focus enemy, protect ally, support character, regroup.
- Done when: Enemies attack, companions can consume `PartyFocusTarget`, and the fight remains readable.

### Step 8.4 - Reset loop
- Add one reset path (debug key/button/cheat).
- Done when: You can reset encounter in under 5 seconds.

---

## Phase 9 - UI (2-4 evenings)
Goal: Minimal UI supports combat and testing.

### Step 9.1 - HUD
- Add HP/resource bars and ability cooldowns.
- Bind to component events where possible (avoid per-frame polling first).
- Done when: UI visibly reacts to damage and cooldown changes.

### Step 9.2 - Target frame
- Add target name/HP frame.
- Done when: Switching targets updates the target frame reliably.

---

## Phase 10 - Save/Load (2-3 evenings)
Goal: Minimal persistence for build testing.

### Step 10.1 - SaveGame
- Add `BP_SaveGame_SoA` (prototype subset only).
- Save:
  - equipped items
  - learned talents
  - maybe player level/currency
- Do not save DataTable rows themselves; save IDs/row names.
- Done when: Save/load restores the build state.

---

## Phase 11 - Debug Tools (ongoing)
Goal: Fast iteration without editor-only tweaking.

### First debug commands to add
- `GiveItem`
- `SetTalent`
- `SpawnTestEnemy`
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
1. Finish `BP_GameInstance_SoA` + `BP_GameDataService` object construction flow. See Steps 2.3-2.6.
2. Build `DT_Stats` + `DT_Attributes` caches and typed getters. See Steps 2.7-2.9.
3. Add `BFL_SoAHelpers.GetGameDataService`. See Step 2.10, then smoke test with Step 2.11.
4. Create `BP_BattleCharacter` and reparent `BP_PlayerCharacter`. See Step 3.1.
5. Place one `BP_EnemyCharacter` in the arena. See Step 3.2.
6. Add a fast reset path. See Step 3.3.
7. Build targeting, health, and automatic basic attack against that manual enemy. See Phases 4-5.
8. Only then expand into items, talents, and data-driven encounters.

---

## Minimal Playable Loop Checklist
You are done with the first prototype loop when:
- You can move, target, basic-attack, and defeat a test enemy in one arena.
- Clicking an ally/support target does not clear the enemy target.
- A party focus target can be assigned for companion AI later.
- The arena can be reset quickly.
- Able abilities can be triggered through your combat wrapper.
- Encounter data can later spawn the same fight without hand-placing enemies.
- Gear or talents visibly change combat results.
- Imports are stable (no DataTable warnings).
- Runtime systems read through `BP_GameDataService` instead of ad-hoc table lookups.
