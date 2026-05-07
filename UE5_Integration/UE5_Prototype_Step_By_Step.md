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

### Current Restart Point
If you are "at step 3" from the recommended order near the bottom, that means:

- done already: `BP_GameInstance_SoA` creates `BP_GameDataService`
- done already or nearly done: `DT_Stats` and `DT_Attributes` cache into maps
- next task: create `BFL_SoAHelpers.GetGameDataService`
- after that: start Phase 3 combatants (`BP_BattleCharacter`, `BP_EnemyCharacter`, reset path)

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
Goal: Soft target + hard lock works in the arena.

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
- final outline post-process materials

### Targeting Ownership Decision
Use this prototype default:
- Put `BP_TargetingComponent` on `BP_PlayerController_Prototype`.

Why:
- Targeting belongs to player intent, not the pawn body.
- If the player pawn is respawned or swapped, the controller can keep targeting state.
- Input already routes through `BP_PlayerController_Prototype`.

Acceptable alternative:
- Put it on `BP_PlayerCharacter` if your current input work already lives there.

Do not split ownership. Pick one owner and keep all current target state there.

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
- Do: Add `BP_TargetingComponent` to player controller or player character (pick one owner and keep it consistent).
- Implement:
  - `FindNearestTarget`
  - `LockTarget`
  - `UnlockTarget`
  - `CycleNextTarget`

#### Create `BP_TargetingComponent`
1. Content Browser -> `/Game/Blueprints/Systems`.
2. Create Blueprint Class -> `Actor Component`.
3. Name it `BP_TargetingComponent`.
4. Add it to `BP_PlayerController_Prototype`.

Recommended variables:
- `CurrentTarget` (`Actor Object Reference`)
- `SoftTarget` (`Actor Object Reference`)
- `SearchRadius` (`Float`, default `1800`)
- `bHasHardLock` (`Boolean`, default `false`)
- `TargetableActors` (`Array` of `Actor Object Reference`)
- `TargetObjectTypes` or collision channel settings if using sphere traces
- `OwnerController` (`BP_PlayerController_Prototype Object Reference`, optional)
- `OwnerPawn` (`Pawn Object Reference`, optional cached value)

Recommended event dispatchers:
- `OnTargetChanged(NewTarget: Actor, bHardLocked: Boolean)`
- `OnTargetCleared()`

#### Initialize the component
In `BP_TargetingComponent` `BeginPlay`:
1. Get owner.
2. Cast owner to `BP_PlayerController_Prototype`.
3. Store `OwnerController`.
4. Get controlled pawn.
5. Store `OwnerPawn`.
6. Optional: print `"Targeting ready"`.

If the component is on the player character instead, owner is already the pawn. Adjust the cached variables accordingly.

#### Implement `RefreshTargetList`
Create function `RefreshTargetList`.

Suggested signature:
- Inputs:
  - none for now
- Outputs:
  - `ValidTargets` (`Array` of `Actor Object Reference`)

Simple first node flow:
1. Clear `TargetableActors`.
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
   - compare team against player team if needed
   - add valid actor to `TargetableActors`
5. Return `TargetableActors`.

Prototype team rule:
- Player team is `1`.
- Valid enemy targets have `TeamId != 1` and `TeamId != 0`.

Do not add line-of-sight yet. A radius search is enough for the first lock-on loop.

#### Implement `FindNearestTarget`
Suggested signature:
- Inputs:
  - none
- Outputs:
  - `Found` (`Boolean`)
  - `Target` (`Actor Object Reference`)

Node flow:
1. Call `RefreshTargetList`.
2. If the list is empty:
   - return `Found = false`
   - return `None`
3. Get origin from owner pawn.
4. Loop over `TargetableActors`.
5. Compute distance from origin to target actor location.
6. Track the actor with the smallest distance.
7. Return it.

Done when a debug key can print the nearest enemy name.

#### Implement `LockTarget`
Suggested signature:
- Input:
  - `Target` (`Actor Object Reference`)
- Output:
  - `Success` (`Boolean`)

Node flow:
1. If `CurrentTarget` is valid and different from `Target`, call `OnTargetUnlocked` on old target.
2. Validate new target:
   - is valid
   - implements `BPI_Targetable`
   - `CanBeTargeted` returns true
3. Set `CurrentTarget = Target`.
4. Set `bHasHardLock = true`.
5. Call `OnTargetLocked` on target.
6. Broadcast `OnTargetChanged`.
7. Return success.

#### Implement `UnlockTarget`
Node flow:
1. If `CurrentTarget` is valid, call `OnTargetUnlocked`.
2. Set `CurrentTarget = None`.
3. Set `bHasHardLock = false`.
4. Broadcast `OnTargetCleared`.

#### Implement `LockNearestTarget`
This is the input-friendly wrapper:
1. Call `FindNearestTarget`.
2. If found, call `LockTarget`.
3. If not found, call `UnlockTarget` or print `"No target found"`.

#### Implement `CycleNextTarget`
First version:
1. Call `RefreshTargetList`.
2. If no targets: `UnlockTarget`.
3. If no current target: lock the nearest target.
4. Find current target index in `TargetableActors`.
5. Add 1, wrap around with modulo.
6. Lock the actor at the new index.

For `CyclePreviousTarget`, subtract 1 and wrap.

Sorting note:
- `Sphere Overlap Actors` order may be inconsistent.
- For the prototype, this is acceptable.
- Later, sort by screen position or angle around the player if cycling feels random.

#### Validate the current target
Create function `ValidateCurrentTarget`.

Call it:
- before basic attacks
- before ability activation
- after arena reset
- optionally on a slow timer, not every tick unless needed

Node flow:
1. If `CurrentTarget` is not valid: clear lock.
2. If target no longer implements `BPI_Targetable`: clear lock.
3. If `CanBeTargeted` returns false: clear lock.
4. If distance is greater than `SearchRadius * 1.25`: clear lock.

Done when:
- Target cycles and lock persists until target invalidates.
- Resetting the arena does not leave a stale destroyed target reference.
- The component exposes a clean `CurrentTarget` for Phase 5 combat.

Common mistakes:
- Using `Get All Actors Of Class` every frame. It is okay for a debug key, but not as the final repeated search.
- Storing target state in both controller and character.
- Forgetting to unlock the old target before locking a new one.
- Assuming a target is valid just because the reference variable is set.

### Step 4.3 - Visual feedback
- Do: Add simple target indicator (widget or outline).

Use the cheapest clear visual first. You are not building final UI yet.

#### Option A: print strings only
Fastest smoke test:
- On lock: print `"Locked target: <DisplayName>"`
- On unlock: print `"Target cleared"`

This proves the logic works but is not enough to leave Phase 4.

#### Option B: target ring actor
Recommended first real visual.

Create `BP_TargetIndicator`:
1. Parent class: `Actor`.
2. Add a simple mesh:
   - torus, flat cylinder, decal, or plane with material
3. Give it a bright debug material.
4. Disable collision.
5. Add function `AttachToTarget(TargetActor)`.

In `BP_TargetingComponent`:
- variable `TargetIndicator` (`BP_TargetIndicator Object Reference`)
- on `LockTarget` success:
  - spawn indicator if missing
  - attach it to target actor, or set its location to target location
  - show it
- on `UnlockTarget`:
  - hide it or destroy it

Simple placement rule:
- Put the ring at target actor location.
- Add small Z offset if it z-fights with the floor.

#### Option C: custom depth outline
Better later, but optional now:
- Enable custom depth on the target mesh when locked.
- Disable custom depth when unlocked.
- Requires project/post-process setup, so avoid this until the ring works.

Done when:
- You can always tell which target is locked.
- Switching targets moves the visual to the new target.
- Unlocking removes or hides the visual.
- Resetting the arena does not leave the visual attached to an invalid actor.

### Step 4.4 - Wire targeting input
If not already done in Phase 1, create or confirm:
- `IA_TargetNext`
- `IA_TargetPrev`
- `IA_LockTarget`

In `BP_PlayerController_Prototype`:
1. Ensure it has `BP_TargetingComponent`.
2. On `IA_LockTarget`:
   - if `bHasHardLock` is true, call `UnlockTarget`
   - otherwise call `LockNearestTarget`
3. On `IA_TargetNext`:
   - call `CycleNextTarget`
4. On `IA_TargetPrev`:
   - call `CyclePreviousTarget`

Suggested keys:
- Tab: target next
- Shift+Tab or Q: target previous
- Middle Mouse or T: lock/unlock

Done when:
- You can lock a target without using editor-only calls.
- You can cycle targets from input.
- Inputs still work after arena reset.

### Step 4.5 - Add targeting debug helpers
Add these to `BP_TargetingComponent`:
- `DebugPrintTargets`
  - prints target count, current target, hard lock state
- `DebugDrawSearchRadius`
  - optional: draw debug sphere around player
- `GetCurrentTarget() -> Target, Found`
  - Phase 5 combat will call this

Done when:
- You can quickly answer "why is nothing targetable?"
- Combat code can ask for the current target without reading component internals.

### Phase 4 Exit Test
Before moving to health/combat:
- Press Play.
- Enemy is visible.
- Press lock key.
- Enemy becomes current target.
- Visual target indicator appears.
- Press lock key again.
- Target clears and indicator disappears.
- Press target next/previous.
- Target changes or stays stable if only one enemy exists.
- Press reset.
- Target reference clears or retargets cleanly.
- `GetCurrentTarget` returns the locked enemy while locked.

If all are true, continue to Phase 5.

---

## Phase 5 - Combat Scaffolding (3-5 evenings)
Goal: Basic damage works and health changes are visible.

### Step 5.1 - Stats and health components
- Add `BP_StatsComponent` and `BP_HealthComponent` to `BP_BattleCharacter` if possible, otherwise to both player and enemy.
- Start with a very small API:
  - `SetBaseStats`
  - `ApplyFlatModifier` (optional)
  - `ApplyDamage`
- Done when:
  - both player and enemy expose the same health API,
  - `OnHealthChanged` fires and UI/debug prints react.

### Step 5.2 - Combat component
- Add `BP_CombatComponent` to `BP_BattleCharacter` or both combatant children.
- Implement one basic attack path:
  - validate target
  - range check
  - produce damage payload
  - call resolver
- Done when: Player can damage a test enemy.

### Step 5.3 - Effect resolver hook
- Create a minimal `BP_EffectResolver` function library.
- One function first:
  - `ApplyDamageEffect(Source, Target, Payload)`
- Done when: Damage no longer directly subtracts HP in random places.

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
Goal: Spawn boss + companions, fight, and reset fast.

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
- Done when: Encounter spawns the right actors and teams.

### Step 8.3 - Boss AI
- Add a simple state machine or behavior logic in `BP_EnemyBrain`.
- Start with 1-2 abilities.
- Done when: Boss attacks and can be defeated.

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
7. Build targeting, health, and one basic attack against that manual enemy. See Phases 4-5.
8. Only then expand into items, talents, and data-driven encounters.

---

## Minimal Playable Loop Checklist
You are done with the first prototype loop when:
- You can move, target, basic-attack, and defeat a test enemy in one arena.
- The arena can be reset quickly.
- Able abilities can be triggered through your combat wrapper.
- Encounter data can later spawn the same fight without hand-placing enemies.
- Gear or talents visibly change combat results.
- Imports are stable (no DataTable warnings).
- Runtime systems read through `BP_GameDataService` instead of ad-hoc table lookups.
