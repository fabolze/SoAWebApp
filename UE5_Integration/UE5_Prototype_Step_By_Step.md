# UE5 Prototype Step-by-Step (Blueprint-Only, Real-Time Top-Down)

This is a small-step guide to build the prototype described in `UE5_Integration_Plan.md` using the system boundaries in `UE5_Integration/UE5_Blueprint_Systems.md`. It assumes you know UE5 basics but have not shipped a game in UE5.

Source of truth for enums/structs: `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`.

---

## Working Rules (keep this short)
- One small task per session (20-45 minutes).
- Always keep a playable loop (move, target, ability, reset).
- Use debug commands early to avoid slow iteration.
- Do not add new canonical structs or enums outside the guide.

---

## Phase 0 - Project Skeleton (1-2 evenings)
Goal: You can press Play and move a pawn in a clean level.

Step 0.1 - Create folders
- Do: Create content folders: `/Game/Blueprints/Systems`, `/Game/Blueprints/Characters`, `/Game/UI`, `/Game/Data/Enums`, `/Game/Data/Structs`, `/Game/Data/Tables`.
- Done when: Content browser shows all folders.

Step 0.2 - Create GameMode and Controller
- Do: Create `BP_GameMode_Prototype`, `BP_GameState_Prototype`, `BP_PlayerController_Prototype`.
- Done when: Project Settings -> Maps and Modes uses `BP_GameMode_Prototype`.

Step 0.3 - Create Player Character
- Do: Create `BP_PlayerCharacter` from `Character` and add a SpringArm + Camera.
- Done when: Default Pawn Class is `BP_PlayerCharacter` and PIE spawns correctly.

Step 0.4 - Base level
- Do: Create a minimal arena level and set it as the Editor Startup Map.
- Done when: PIE loads the arena map every time.

---

## Phase 1 - Input and Top-Down Movement (2-3 evenings)
Goal: Move, rotate, and control camera reliably.

Step 1.1 - Enhanced Input setup
- Do: Create Input Actions for Move, Look (optional), CameraZoom, CameraPan, Ability1..4, TargetNext, TargetPrev, LockTarget, Interact.
- Done when: Input Mapping Context is added at BeginPlay in `BP_PlayerController_Prototype`.

Step 1.2 - Player movement
- Do: Implement WASD movement using `AddMovementInput` in `BP_PlayerCharacter`.
- Done when: You can move around the arena.

Step 1.3 - Facing logic
- Do: Rotate the character toward movement or toward cursor (pick one). Keep it simple.
- Done when: Facing is stable and matches your intended control feel.

Step 1.4 - Camera controls
- Do: Implement zoom (SpringArm length), optional rotate, and optional pan.
- Done when: Camera input feels usable; no clipping into the ground.

---

## Phase 2 - Data Imports (Core Only) (2-4 evenings)
Goal: Your `BP_GameDataSubsystem` can read a few DataTables and return data by id/slug.

Step 2.1 - Enums/Structs
- Do: Use the guide to create the Core structs and enums (Stats, Attributes, AttributeStatLink).
- Done when: DataTable imports succeed with zero warnings.

Step 2.2 - Minimal DataTables
- Do: Import small sample CSVs for stats and attributes.
- Done when: You can read a row by slug in a test Blueprint.

Step 2.3 - `BP_GameDataSubsystem`
- Do: Build cache maps and a simple lookup function (e.g., `GetStatBySlug`).
- Done when: PIE prints the expected stat data from the DataTable.

---

## Phase 3 - Targeting System (2-3 evenings)
Goal: Soft target + hard lock works in the arena.

Step 3.1 - Targetable interface
- Do: Create `BPI_Targetable` and `BP_TargetableComponent` for enemies.
- Done when: A test enemy can be flagged as targetable.

Step 3.2 - Targeting component
- Do: Add `BP_TargetingComponent` to controller or character. Implement FindNearest + Lock/Unlock.
- Done when: Target cycles and lock persists until broken.

Step 3.3 - Visual feedback
- Do: Add a simple outline or widget over the target.
- Done when: You can see which target is locked.

---

## Phase 4 - Combat Scaffolding (3-5 evenings)
Goal: Basic damage works; health changes are visible.

Step 4.1 - Stats and Health components
- Do: Add `BP_StatsComponent` and `BP_HealthComponent` to player and enemy.
- Done when: Health changes fire `OnHealthChanged` events.

Step 4.2 - Combat component
- Do: Add `BP_CombatComponent` with a simple `ApplyDamage` flow and range check.
- Done when: You can reduce enemy HP via a test input.

Step 4.3 - Effect resolver hook
- Do: Add a minimal `BP_EffectResolver` function to apply a damage payload.
- Done when: Damage goes through the resolver, not direct HP subtraction.

---

## Phase 5 - Able Integration (3-6 evenings)
Goal: Ability activation, cooldowns, and telegraphs work.

Step 5.1 - Able component
- Do: Add `BP_AbleAbilityComponent` to player and enemy. Create one test ability.
- Done when: Ability activates via input and plays a timeline.

Step 5.2 - Ability wrapper
- Do: Create wrapper functions in `BP_CombatComponent` (`TryActivateAbility`, `CancelAbility`, `GetCooldownRemaining`).
- Done when: UI or input calls the wrapper, not the Able component directly.

Step 5.3 - Telegraph
- Do: Spawn `BP_TelegraphActor` from the ability timeline (pre-hit warning).
- Done when: Telegraph appears and disappears correctly.

---

## Phase 6 - Character Build Systems (3-6 evenings)
Goal: Gear and talents modify stats and damage output.

Step 6.1 - Inventory and equipment
- Do: Add `BP_InventoryComponent` and `BP_EquipmentComponent` to player.
- Done when: Equipping an item modifies stats via `BP_StatsComponent`.

Step 6.2 - Talent manager
- Do: Add `BP_TalentManager` and import a small TalentTree.
- Done when: Unlocking a talent applies a stat or ability modifier.

---

## Phase 7 - Encounter Flow (3-6 evenings)
Goal: Spawn boss + companions, fight, reset.

Step 7.1 - EncounterDirector
- Do: Implement `BP_EncounterDirector` to spawn player, companions, boss from `FEncounterData`.
- Done when: Encounter starts with correct actors and basic roles.

Step 7.2 - Boss AI
- Do: Simple AI (state machine) that uses 1-2 abilities.
- Done when: Boss attacks, phases if desired, and can be defeated.

Step 7.3 - Reset logic
- Do: Add a debug command or button to reset encounter.
- Done when: You can restart the fight in < 5 seconds.

---

## Phase 8 - UI (2-4 evenings)
Goal: Minimal UI supports combat and testing.

Step 8.1 - HUD
- Do: Add HP/resource bars and ability cooldowns.
- Done when: UI updates on health change and cooldown change.

Step 8.2 - Target frame
- Do: Add target name/HP frame for the locked target.
- Done when: Switching target updates the frame.

---

## Phase 9 - Save/Load (2-3 evenings)
Goal: Minimal persistence for build testing.

Step 9.1 - SaveGame
- Do: Add `BP_SaveGame_SoA` (prototype subset) for talents and gear.
- Done when: Save + load restores the build.

---

## Phase 10 - Debug Tools (ongoing)
Goal: Fast iteration without editor tweaks.

- Add cheat commands in `BP_SoACheatManager`:
  - `GiveItem`, `SetLevel`, `SetTalent`, `SpawnBoss`, `ResetEncounter`.
- Add a debug widget to toggle hitboxes, targeting radius, telegraph bounds.

---

## Daily Session Template
Use this at the top of your notes to stay focused:

```
Today:
One task (20-45m):
Done when:
Notes:
```

---

## Minimal Playable Loop Checklist
You are done with the first prototype when:
- You can move, target, cast, and defeat a boss in one arena.
- Talents or gear visibly change combat results.
- Encounter can be reset quickly for iteration.
- Imports are stable and no DataTable warnings appear.

If you want, I can add a short "What to do tonight" list based on where you are right now.
