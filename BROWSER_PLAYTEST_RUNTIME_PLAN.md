# Browser Playtest Runtime Plan

Status: proposed implementation plan  
Source prototype: `UE5_Integration/UE5_Prototype_Step_By_Step.md`  
Target stack: the existing Flask, SQLite, React, and TypeScript application  
Last reviewed: 2026-07-18

## Executive Decision

Translate the Unreal prototype into a **Browser Playtest Runtime** inside this repository.

The result should be a small real-time, top-down arena that runs in the existing React application and consumes the same canonical content that the authoring workspaces edit. It should not be a second game database, a renamed version of the existing heuristic Simulation Sandbox, or a browser imitation of Unreal classes.

The implementation should have three explicit layers:

1. The existing Flask/SQLite application remains the canonical content source.
2. A read-only backend compiler validates an encounter and produces a versioned runtime bundle.
3. A deterministic TypeScript runtime owns temporary play state and presents it through a React/SVG playtest surface.

This gives the project an executable reference consumer for its authored data. Unreal export can remain available, but Unreal is no longer required to verify the first playable loop.

## 1. What The Project Is Today

The repository is primarily a local, single-user RPG authoring application.

### Canonical content and persistence

- Flask exposes the content API.
- SQLAlchemy models in `backend/app/models` define the persisted records.
- SQLite is the active local database.
- JSON schemas in `backend/app/schemas` drive validation and much of the frontend editing UI.
- Source CSV is the portable recovery format.
- UE CSV is a generated handoff format, not the only useful runtime representation.
- Atomic bundle routes already exist for relationship-heavy workspaces such as dialogues, encounters, abilities, quests, and the story timeline.

The important design rule is already present throughout the project: save canonical facts and derive views, warnings, simulations, and presentations from those facts.

### Frontend authoring application

The React application in `soa-editor` has two complementary authoring styles:

- Generic schema editors provide complete access to model fields.
- Immersive authoring workspaces provide domain-specific workflows for characters, abilities, encounters, items, quests, dialogues, world building, progression, and story structure.

The main route registry is `soa-editor/src/AppRoot.tsx`. Shared API access is in `soa-editor/src/lib/api.ts`. The project already uses local drafts, dirty-state protection, bundle review, deterministic helpers, Vitest, and Playwright.

### Existing simulation

`soa-editor/src/simulation` is an authoring estimator. It scores entities under abstract scenarios and produces useful comparisons and ability traces.

It explicitly does not model:

- continuous movement;
- target ownership;
- current health and death;
- real-time cooldowns and casts;
- enemy or companion decisions;
- encounter victory or defeat;
- a persistent player build.

That boundary should remain. The Simulation Sandbox answers, “How does this content compare under a heuristic model?” The Browser Playtest Runtime answers, “What actually happens when this content is executed under the reference runtime rules?”

### Authored game domains

The completed authoring system is intended to connect these domains:

| Domain | Canonical role | Runtime consumer |
|---|---|---|
| Stats and attributes | Definitions, class bases/growth, derived links, modifiers | Stat assembly and formulas |
| Characters and classes | Identity, level, class, faction, starting build | Combatant construction |
| Combat profiles | Overrides, ability loadout, behavior, rewards, status defenses | Enemy/companion setup and AI |
| Abilities, effects, statuses | Targeting, timing, scaling, payload, lifecycle | Ability scheduler and effect resolver |
| Items and talents | Equipment, modifiers, granted abilities, progression | Player build assembly |
| Encounters | Cast, sides, gates, rewards, outcome policy | Encounter setup and resolution |
| Requirements, flags, reputation | World-state conditions and consequences | Availability checks and session state |
| Locations and routes | World graph, travel cost, placements | Later travel runtime |
| Dialogues, events, quests | Playable narrative and state changes | Later narrative runtime |
| Content packs and timelines | Scope and chronology | Later campaign selection and validation |

### Intended end-to-end behavior

Once the broader project is fully implemented, the expected flow is:

1. An author creates connected game content in the web workspaces.
2. Backend routes validate and atomically persist the canonical records.
3. Health and dependency tools identify incomplete or contradictory content.
4. The author can run heuristic comparisons for quick balance feedback.
5. The author launches a playable encounter using the current saved content, or later a reviewed unsaved draft overlay.
6. The runtime compiler resolves relationships into a self-contained, validated bundle.
7. The browser runtime executes the encounter deterministically and explains its decisions through a debug trace.
8. The author returns directly to the owning workspace to fix a content or runtime-readiness issue.
9. Source CSV remains the recovery source, while UE CSV and runtime bundles are generated consumers of the same truth.
10. Later runtime modules can execute travel, dialogue, events, quests, rewards, flags, and world-state transitions using the same pattern.

The Browser Playtest Runtime is the first executable slice of steps 5–7. It is not the entire campaign runtime in its first release.

## 2. Product Scope

### First useful release

The first release is a real-time top-down combat playtest with:

- one controlled player combatant;
- one manually configured training enemy, followed by a saved encounter;
- keyboard movement and click targeting;
- separate enemy, ally, and party-focus target state;
- automatic basic attacks while a selected enemy is in range;
- four manually triggered ability slots;
- health, resource, cooldown, cast, effect, status, death, victory, defeat, and reset state;
- simple deterministic enemy and companion behavior;
- a readable HUD, target frame, target marker, telegraphs, and event log;
- a versioned local playtest save for build selections and settings;
- seed-based replay and debug controls.

### Deliberate non-goals for the first release

- Production-quality art, animation, audio, physics, navigation meshes, or networking.
- A general-purpose browser game engine.
- A full ECS framework or a large rendering dependency.
- Writing combat results into the authoring database.
- Treating Encounter Stage card position as tactical spawn position. Its current design explicitly says stage position is visual only.
- Claiming that every authored effect or narrative action is executable before its runtime support is implemented and tested.
- Replacing the existing heuristic Simulation Sandbox.
- Full world travel, dialogue, quests, shops, or campaign persistence in the first combat milestone.

## 3. Architecture

```text
Canonical SQLite records
        |
        v
Flask playtest bundle compiler ----> readiness errors and warnings
        |
        v
Versioned RuntimeEncounterBundle
        |
        v
Pure TypeScript runtime engine
  command queue -> fixed-step systems -> events -> snapshot
        |                                  |
        v                                  v
React/SVG arena and HUD              debug/replay trace
```

### Why this fits the repository

- Flask already owns relationship validation and database access.
- React already owns all interactive application surfaces.
- TypeScript already contains deterministic simulation helpers and unit-test infrastructure.
- The app has no frontend state framework that needs to be adopted for this feature.
- SVG is sufficient for a small 1–4 combatant arena and keeps target elements inspectable, clickable, scalable, and accessible.
- A renderer adapter leaves room for Canvas or WebGL later without coupling combat rules to React.

### Runtime ownership rules

- Authoring models describe definitions and relationships.
- The bundle compiler resolves and normalizes definitions.
- The TypeScript engine owns current health, position, target, resource, cooldown, status, AI, and encounter state.
- React renders snapshots and emits commands. React components do not calculate damage or mutate combatant state directly.
- `requestAnimationFrame` renders; it does not define game time.
- The engine emits domain events. UI, logs, and tests observe those events.
- Runtime results never silently update canonical records.

## 4. Unreal-To-Web Responsibility Map

| UE prototype concept | Browser implementation | Notes |
|---|---|---|
| `BP_GameInstance_SoA` | Playtest session store | Owns the loaded bundle, engine instance, settings, and reset lifecycle for one route session. |
| `BP_GameDataService` | Compiled `RuntimeCatalog` plus indexed maps | The backend resolves database relationships; the frontend creates typed `Map` indexes once per bundle. |
| `BFL_SoAHelpers` | Typed selectors and lookup helpers | Stateless functions; no React imports. |
| GameMode/GameState | `EncounterRuntime` and `EncounterSystem` | Own encounter phase, clock, seed, victory, defeat, and reset. |
| PlayerController | Input adapter and `TargetingSystem` | Converts keyboard/pointer intent into runtime commands. |
| Battle/Player/Enemy Character | `CombatantState` plus capabilities | Data-oriented state rather than an inheritance tree. |
| Actor components | Focused runtime systems | Stats, health, targeting, ability, status, combat, and AI remain separate modules. |
| Blueprint interfaces | TypeScript capability predicates | For example `isTargetable`, `canReceiveEffect`, and `getTargetPoint`. |
| Enhanced Input | Keyboard/pointer bindings | Bindings live outside the engine and can be remapped later. |
| SpringArm/Camera | SVG `viewBox` and arena transform | Fixed top-down view first; zoom/pan later. |
| Sphere overlap and traces | Pure geometry queries | Circle distance and arena bounds are enough for the first release. |
| Target ring/outline | SVG marker layer | Driven only by target state changes. |
| `BP_StatsComponent` | `StatSystem` | Builds final numeric stat maps and emits stat-change events. |
| `BP_HealthComponent` | `HealthSystem` | Sole owner of current/max health and death transitions. |
| `BP_EffectResolver` | `EffectSystem` | Applies supported normalized effects and returns an explainable resolution record. |
| `BP_CombatComponent` | `CombatSystem` | Validates action, target, range, timing, and delegates effects. |
| Able ability component | `AbilitySystem` and scheduler | Internal adapter API remains stable if the scheduler changes later. |
| Telegraph actor | Telegraph state rendered in SVG | Created during cast and removed on impact, cancellation, or reset. |
| Enemy/companion brain | Deterministic state machine | Uses the same public command/action APIs as the player path. |
| Encounter director | Backend bundle compiler plus `SpawnSystem` | Data resolution belongs on the backend; runtime instantiation belongs in TypeScript. |
| UMG HUD | React playtest components | Event-driven where practical; snapshots are safe for display. |
| SaveGame | Versioned localStorage playtest save | Stores IDs and player choices, not copied definitions. |
| Cheat/debug manager | Debug dock and command palette | Pause, step, seed, reset, inspect, damage, heal, and AI toggles. |

## 5. Runtime Bundle Contract

### Proposed endpoints

Add a read-only playtest API rather than making the frontend call many generic entity endpoints and reconstruct relationships itself.

- `GET /api/playtest/encounters`
  - Returns combat encounter summaries and runtime-readiness status.
- `GET /api/playtest/encounters/<encounter_id>/bundle?controlled_character_id=<id>&seed=<seed>`
  - Returns a fully resolved bundle or a structured 422 readiness response.
- `POST /api/playtest/encounters/compile`
  - Later phase only: compiles a reviewed unsaved Encounter Stage draft overlay without persisting it.

The endpoints must not mutate game content or rewards.

### Proposed bundle shape

The precise TypeScript and Python types should be introduced together. The first contract should contain at least:

```ts
interface RuntimeEncounterBundle {
  schemaVersion: "1.0";
  source: {
    encounterId: string;
    contentDigest: string;
    compiledAt: string;
  };
  seed: number;
  arena: RuntimeArenaSpec;
  tuning: RuntimeTuning;
  encounter: RuntimeEncounterSpec;
  combatants: RuntimeCombatantSpec[];
  abilitiesById: Record<string, RuntimeAbilitySpec>;
  effectsById: Record<string, RuntimeEffectSpec>;
  statusesById: Record<string, RuntimeStatusSpec>;
  itemsById: Record<string, RuntimeItemSpec>;
  warnings: RuntimeReadinessIssue[];
}
```

The bundle should be self-contained. Once combat begins, generic CRUD endpoints and the database should not be consulted.

### Identity rules

- Canonical ULIDs/IDs remain the reference identity in bundles and saves.
- Slugs are readable aliases for inspection and semantic stat bindings.
- Display names are never used as keys.
- Runtime-spawned instances receive deterministic instance IDs such as `<character-id>:<slot-index>`.
- A bundle content digest lets a save or replay detect that source content changed.

### Side and controlled-character rules

The current encounter model knows `Friendly`, `Hostile`, and `Neutral`, but does not identify the controlled participant.

For V1:

- The playtest launcher requires an explicit controlled character selection.
- The selected character becomes the player team even if the encounter currently marks it Neutral.
- `Hostile` participants become the enemy team.
- `Friendly` participants become AI allies unless selected as the controlled character.
- Other Neutral participants are ignored by combat unless a later interaction rule activates them.
- Spawn positions are generated deterministically by side and participant order. They are runtime presentation, not saved encounter truth.

This supports existing encounter data without pretending that visual Encounter Stage placement is tactical data.

### Runtime readiness result

Compilation should return issues with stable codes, severity, entity/path, message, and suggested owning workspace.

Examples:

- `missing_character`
- `missing_character_class`
- `missing_combat_profile`
- `missing_health_stat`
- `missing_basic_ability`
- `missing_effect`
- `unsupported_effect_type`
- `ambiguous_effect_formula`
- `missing_ability_range`
- `invalid_timing`
- `no_hostile_participant`
- `controlled_character_not_in_encounter`

Errors block launch. Warnings allow launch but remain visible in the debug dock.

## 6. Canonical Data Decisions Required Before Data-Driven Combat

The repository is rich enough to build the runtime, but the current seed and schema evidence exposes several semantic gaps. Resolve them explicitly instead of hiding them behind frontend defaults.

### Use the existing stat vocabulary

The seed data uses these relevant slugs:

- `health`
- `mana`
- `physical_attack`
- `physical_protection`
- `magic_attack`
- `magic_protection`
- `attack_speed`
- `precision`
- `evasion`
- `crit_chance`
- `crit_damage`
- `speed`

The UE step-by-step examples use `max_health`, `attack_power`, `basic_attack_range`, and `basic_attack_cooldown`. Do not add duplicate stats merely to match those example names.

The browser runtime should bind to the existing semantic slugs. Basic attack cadence comes from the chosen basic ability and `attack_speed`; range comes from the ability/equipment contract rather than a duplicate stat.

### Define real-time units

Current descriptions mix “turns or seconds,” “abstract turns,” and seconds. Before runtime-backed abilities are accepted:

- standardize cooldown, cast time, recovery time, duration, and tick interval as seconds for executable combat;
- update schema descriptions and authoring copy;
- keep the Ability Test Bench explicitly heuristic, converting seconds to its abstract trace steps when needed;
- reject negative or non-finite timing values during compilation.

This is preferable to having the same number mean different things in the estimator and runtime.

### Add explicit reach fields

Abilities currently express target shape but not sufficient spatial reach. Add engine-agnostic combat fields to the ability contract:

- `range`: maximum source-to-target distance;
- `area_radius`: required for Area effects and optional otherwise;
- later, only when needed: `projectile_speed` and `telegraph_lead_time`.

Use a documented abstract combat unit, rendered consistently in the browser and convertible by any external engine. Item `weapon_range` should use the same unit.

### Define effect formula precedence

Effects contain `value`, `value_type`, `calculation_basis`, `scaling_stat_id`, and `scaling_multiplier`; abilities also contain scaling links. Their combination needs one versioned formula contract.

For the first executable support matrix:

- support flat Damage and Heal effects;
- support additive ability stat scaling;
- support one optional effect-level scaling stat;
- define protection mitigation in one formula module;
- define crit, precision, and evasion only after the deterministic basic loop passes;
- reject or warn on formula combinations that the runtime cannot interpret honestly;
- include an explanation record for every resolved amount.

Do not use the Simulation Sandbox’s 0–100 metric scores as combat values.

### Make encounter multiplicity explicit

The current route rejects duplicate `character_id` values in participants, but the intended runtime supports two or more instances of the same creature.

Add `quantity` to encounter participant entries, defaulting to `1`, before data-driven waves need repeated character types. Instance identity remains runtime-generated.

### Treat attributes as derived input, not a second stat store

The attributes API serializes `results_in` from the `attribute_stat_links` relationship even though there is no standalone frontend schema for that link table. The runtime compiler should consume the relationship through backend models/services and normalize it into the bundle.

The stat assembly order should be documented and tested:

1. stat definition default;
2. class base stats;
3. class level growth;
4. combat-profile overrides;
5. attribute-to-stat contributions;
6. equipped item flat modifiers;
7. talent flat modifiers;
8. additive percentage modifiers;
9. multiplicative modifiers;
10. temporary status modifiers;
11. min/max clamping from the stat definition.

The implementation may defer steps 5–10, but it must preserve this extension order.

### Current seed readiness observations

The checked-in seed content is useful but is not yet a guaranteed playable encounter fixture:

- The starting encounter has a main character and a hostile boar.
- The boar has a combat profile and a basic-tagged ability.
- The main character’s class currently has no starting ability in the checked-in seed row.
- The encounter marks the main character Neutral, so the launcher must explicitly select control or the authoring data must later be corrected.
- The checked-in stats use `health` and `physical_attack`, not the UE example slugs.

Phase 1 should therefore use a small contract-conforming training fixture. Phase 2 must make a saved encounter pass readiness without hidden synthetic abilities.

## 7. Runtime Design

### Engine shape

Use an “ECS-light” data model: ID-keyed state records plus focused systems. Do not introduce a generic ECS library.

Suggested state partitions:

- `encounter`: phase, elapsed time, seed, winner, reset count;
- `combatantsById`: identity, side, position, radius, alive/targetable state;
- `statsByCombatantId`: base, modifiers, final values;
- `resourcesByCombatantId`: current/max health and mana;
- `targetsByControllerId`: enemy, ally, party focus, ground point, lock state;
- `abilitiesByCombatantId`: loadout, cooldowns, cast/recovery state;
- `statusesByCombatantId`: active status instances and tick schedules;
- `brainsByCombatantId`: state, goal, decision cooldown;
- `telegraphsById`: shape, owner, timing, affected side;
- `eventLog`: bounded explainable domain events.

### Commands

All player, AI, debug, and test actions should enter through commands:

- `set_move_intent`
- `set_enemy_target`
- `set_ally_target`
- `set_party_focus_target`
- `clear_target`
- `activate_ability`
- `confirm_ground_target`
- `cancel_action`
- `pause`
- `step`
- `reset_encounter`

This gives tests and replays the same control path as the UI.

### Events

Systems should emit domain events rather than calling UI code:

- `target_changed`
- `attack_started`
- `ability_cast_started`
- `telegraph_created`
- `effect_resolved`
- `health_changed`
- `resource_changed`
- `status_applied`
- `status_removed`
- `combatant_died`
- `encounter_won`
- `encounter_lost`
- `reward_previewed`
- `runtime_warning`

Events need sequence number and simulation timestamp. Random outcomes should include the roll and threshold in debug detail.

### Clock and determinism

- Run systems at a fixed 20 Hz initially (`50 ms` steps).
- Use `requestAnimationFrame` only to accumulate real time and render/interpolate snapshots.
- Cap catch-up work per frame to avoid a tab-resume spiral.
- Pause automatically when the page becomes hidden.
- Use one seeded PRNG owned by the runtime.
- Never call `Math.random()` inside runtime systems.
- Sort ID-derived iteration before it can affect decisions or random consumption.
- Reset restores the initial compiled bundle and original seed.

### Movement and arena

V1 movement is intentionally small:

- WASD/arrow input produces a normalized move vector.
- Movement speed reads the `speed` stat.
- Combatants are circles constrained to a rectangular arena.
- Collision is circle separation between combatants; no obstacles or pathfinding.
- Facing is derived from movement or current target for presentation only.
- The arena uses a stable logical coordinate system and responsive SVG `viewBox`.

Later movement can add click-to-move, obstacles, navigation, projectiles, and camera pan without changing combat formulas.

### Targeting

Keep the UE ownership semantics because they are good domain boundaries:

- enemy target, ally target, and party focus are separate values;
- selecting an ally never clears the enemy target;
- a manual enemy target persists while out of range;
- distance is an action-validity concern, not target-validity concern;
- death, destruction, side change, or targetability loss clears a target;
- Tab selects the nearest non-recent valid enemy with a bounded recent history;
- pointer selection takes precedence over auto-selection;
- the target marker is presentation derived from target state.

### Stats and health

- `StatSystem` is the only module that assembles final stat values.
- `HealthSystem` is the only module that changes current health and determines death.
- Current health is runtime state, never written into a stat definition or combat profile.
- Stats changes emit a recalculation event. Max-health changes need an explicit policy: preserve percentage by default, with a tested override if design changes.
- Reset restores initial resources, targetability, positions, cooldowns, statuses, and AI state.

### Basic attacks

- A basic attack is a normal runtime ability marked by the canonical `basic` tag.
- The controlled character automatically requests it against the current enemy target.
- The request fails cleanly while dead, casting, recovering, out of range, on cooldown, or missing a valid target.
- Failure never clears a valid selected target merely because it is out of range.
- Attack speed modifies cadence through a documented formula rather than directly mutating authored cooldown data.
- Phase 1’s training fixture may define a basic ability in fixture data. Data-driven phases may not synthesize one silently.

### Abilities and telegraphs

The public API should remain small:

- `tryActivateAbility(actorId, abilityId, targetIntent)`
- `cancelAbility(actorId, reason)`
- `getCooldownRemaining(actorId, abilityId)`
- `getAbilityAvailability(actorId, abilityId)`

The scheduler owns cast, impact, aftermath, active, deactivate, cooldown, and recovery timing. Timed `effect_links` should be normalized during compilation and executed in stable `turn_offset`/`sort_order` order, with the canonical timing unit interpreted as seconds.

Telegraphs are runtime state with shape, center, radius, start time, impact time, and affected side. SVG only renders them.

### Effects and statuses

- `EffectSystem` resolves target filters before amounts.
- Friendly fire is off by default.
- Damage and healing delegate final resource changes to `HealthSystem`.
- Status lifecycle belongs to `StatusSystem`.
- Profile `status_rules` are compiled into deterministic specificity order.
- Unsupported effect types appear as readiness warnings or blockers; they are never treated as successful no-ops without disclosure.
- Resolution events include source values, scaling terms, mitigation, clamping, and final applied amount.

### Enemy and companion AI

Start with an inspectable state machine:

- `idle`
- `acquire_target`
- `approach`
- `attack`
- `cast`
- `recover`
- `dead`

Enemy target policy starts with nearest alive opposing combatant. Companion policy prioritizes a valid party focus, then protects/supports the controlled character, then chooses a local target. AI submits the same ability commands used by player input.

Decision intervals should be fixed and deterministic. No per-render-frame scoring.

### Encounter flow and rewards

Encounter states:

- `loading`
- `ready`
- `running`
- `won`
- `lost`
- `paused`

Victory occurs when no hostile combatants remain alive. Defeat occurs when the controlled combatant dies; companion-only continuation can be a later policy.

Rewards are resolved into a **preview** in the playtest session. V1 does not write inventory, currency, reputation, flags, quest state, or canonical encounter state to SQLite.

Reset must take less than one interaction and restore the same deterministic initial state. “New seed” is a separate explicit action.

### UI

Add routes:

- `/playtest`
- `/playtest/encounters/:id`

The playtest surface should contain:

- encounter and controlled-character launcher;
- SVG arena;
- player health/resource frame;
- enemy target frame;
- optional ally target and party-focus frames;
- ability bar with key, cost, cast, cooldown, and unavailable reason;
- target rings and telegraphs;
- encounter result/reset panel;
- collapsible debug dock.

The first surface should work with keyboard alone where practical. Pointer targets need accessible labels. Reduced-motion mode should disable nonessential interpolation/pulses while keeping timing readable.

### Save, replay, and debug

Use separate versioned storage keys:

- `soa.playtest.settings.v1`
- `soa.playtest.build.v1`
- `soa.playtest.replay.v1`

Store only IDs, ranks, quantities, selected loadout, settings, source digest, seed, and command trace. Do not copy complete item/ability definitions into the save.

The debug dock should show:

- engine time, tick, seed, and content digest;
- current targets and recent target history;
- selected combatant stats/resources/cooldowns/statuses/AI state;
- readiness warnings;
- bounded event log with formula explanations;
- pause, single-step, 0.5x/1x/2x, reset, and new-seed controls;
- optional damage, heal, kill, revive, AI toggle, range overlay, and hit-radius overlay controls.

## 8. Proposed Code Layout

Names can change during implementation, but responsibilities should remain separated.

```text
backend/app/routes/r_playtest.py
backend/app/services/playtest_bundle.py
backend/app/services/playtest_readiness.py
backend/tests/test_playtest_bundle_contracts.py
backend/tests/test_playtest_readiness.py

soa-editor/src/playtest/
  api.ts
  contract.ts
  contractGuards.ts
  fixtures/trainingDuel.ts
  runtime/
    createRuntime.ts
    clock.ts
    commands.ts
    events.ts
    rng.ts
    selectors.ts
    state.ts
    systems/
      movement.ts
      targeting.ts
      stats.ts
      health.ts
      effects.ts
      statuses.ts
      abilities.ts
      combat.ts
      ai.ts
      encounter.ts
  react/
    PlaytestSessionProvider.tsx
    PlaytestArena.tsx
    PlaytestHud.tsx
    AbilityBar.tsx
    TargetFrames.tsx
    DebugDock.tsx
  storage.ts

soa-editor/src/pages/PlaytestLauncherPage.tsx
soa-editor/src/pages/EncounterPlaytestPage.tsx
soa-editor/src/playtest/**/*.test.ts
soa-editor/tests/playtest-runtime.spec.ts
```

Do not place authoritative playtest rules in `components/simulation`, Encounter Stage components, or page components.

## 9. Implementation Phases

Each phase must leave a runnable, testable loop. A phase is complete only when its exit gate passes.

### Phase 0 — Contract RFC and readiness audit

Deliverables:

- Approve this architecture and the separation from the heuristic simulator.
- Define `RuntimeEncounterBundle` in Python response tests and TypeScript types.
- Decide the real-time unit contract.
- Add ability `range` and `area_radius` schema/model/route/export support, or explicitly approve a temporary bundle-only policy.
- Define the first effect formula support matrix and precedence.
- Define controlled-character and Neutral-side behavior.
- Add encounter participant `quantity` if repeated actors are part of the first saved encounter.
- Create readiness issue codes and a checked-in training-duel bundle fixture.

Exit gate:

- The fixture validates in TypeScript.
- The formula examples have golden expected results.
- No field has two undocumented runtime meanings.
- Known unsupported mechanics have named readiness outcomes.

### Phase 1 — Deterministic training arena

Deliverables:

- Add the playtest routes and lazy-loaded pages.
- Build the fixed-step clock, seeded RNG, command queue, event log, and reset.
- Render a responsive SVG arena from the training fixture.
- Add controlled movement, one player, one static enemy, arena bounds, and circle separation.
- Add enemy target click, lock/unlock, cycle, marker, and debug state.
- Add pause, step, reset, and seed display.

Exit gate:

- The player can move and target the enemy.
- Ally selection does not clear enemy selection in a fixture containing an ally.
- Moving out of discovery/range does not invalidate a selected living target.
- Reset returns byte-equivalent initial runtime state for the same bundle and seed.
- A unit test replaying the same commands produces the same final state and event sequence.

### Phase 2 — Backend bundle compiler

Deliverables:

- Add read-only encounter selector and bundle endpoints.
- Resolve encounter participants, characters, classes, profiles, stats, abilities, effects, statuses, and relevant starting items.
- Normalize enum values and relationship lists into the runtime contract.
- Build deterministic instance IDs and spawn specs.
- Return structured readiness blockers/warnings.
- Add content digest and bundle schema version.
- Make one saved training encounter launch without frontend data patching.

Exit gate:

- The frontend performs one bundle fetch to start a saved encounter.
- Missing references produce a 422 with stable issue paths.
- The saved encounter bundle is deterministic apart from `compiledAt`.
- Compiler contract tests cover missing profile, missing ability/effect, unsupported formula, side mapping, and quantity.

### Phase 3 — Stats, health, effects, and automatic basic attack

Deliverables:

- Implement class base/growth and combat-profile stat assembly.
- Bind runtime semantics to existing stat slugs.
- Add health/resources and death.
- Add range, cooldown, recovery, attack-speed adjustment, and action availability.
- Implement the first supported Damage/Heal formulas and explanation records.
- Add automatic basic attack against the current enemy target.
- Add HUD and target health frame.

Exit gate:

- In range, the player repeatedly damages the selected enemy according to cooldown.
- Out of range, attacks stop and the target remains selected.
- Returning to range resumes attacks.
- Death occurs once, clears targetability/markers, and ends the encounter when appropriate.
- Reset restores health, cooldowns, targetability, position, event sequence, and AI state.
- Formula unit tests use canonical IDs/slugs and exact expected values.

### Phase 4 — Active abilities, telegraphs, and statuses

Deliverables:

- Implement four ability slots and availability explanations.
- Add resource cost, cast, cancel, impact, recovery, cooldown, and timed effect links.
- Add Self, Single, Allies, Enemies, and Area target resolution for supported effects.
- Add ground-target confirmation if Area abilities require a point.
- Add telegraph state/rendering.
- Implement a minimal status set and lifecycle using canonical status rules.

Exit gate:

- A single-target ability, heal/support ability, and telegraphed area ability execute deterministically.
- Changing ally target does not disturb the enemy target.
- Cooldown/resource/cast failures are visible and testable.
- Reset/cancel removes telegraphs and scheduled payloads.
- Unsupported authored effects remain disclosed rather than silently ignored.

### Phase 5 — Data-driven encounters, enemy AI, and companions

Deliverables:

- Spawn all combat participants using side and quantity.
- Add deterministic enemy approach/attack behavior.
- Add one companion and party-focus behavior.
- Add victory, defeat, pause, reward preview, and fast reset.
- Add simple overlap avoidance and target revalidation.

Exit gate:

- A saved 1–3 enemy encounter can be won or lost.
- Enemies enter range and act without render-frame dependence.
- A companion consumes party focus and falls back cleanly when it becomes invalid.
- Same bundle, seed, and command trace produce the same result.
- Reset takes one click/key and completes immediately.

### Phase 6 — Gear, talents, and playtest persistence

Deliverables:

- Assemble starting equipment and selected playtest equipment.
- Apply item stat/attribute modifiers in the documented stack order.
- Apply talent ranks, prerequisites, stat modifiers, and granted abilities.
- Add a small playtest-only build panel.
- Persist versioned build choices and settings by canonical ID.
- Validate saves against bundle version/content digest and report stale references.

Exit gate:

- Equipping an item changes an exact final stat and combat result.
- Learning a talent changes a stat or ability loadout.
- Reload restores choices without storing copied canonical definitions.
- Removed IDs produce a recoverable warning, not a broken route.

### Phase 7 — Authoring integration and debug quality

Deliverables:

- Add “Playtest” from Encounter Stage.
- Add “Test in encounter” from Ability Spellcraft Lab.
- Link readiness issues back to owning records/workspaces.
- Add reviewed draft-overlay compilation for unsaved encounter/ability changes.
- Finish keyboard, focus, contrast, reduced-motion, responsive, empty, loading, and error behavior.
- Add replay export/import and event-log copy.

Exit gate:

- An author can edit, launch, identify a content issue, return to its owner, fix it, and relaunch without losing context.
- Draft playtest is visibly marked and never persisted without the normal authoring save flow.
- Runtime support claims are backed by a contract test and a playtest case.

### Phase 8 — Optional broader browser runtime

Only after the combat loop is reliable:

- requirements, flags, reputation, and reward application to session state;
- event sequencing and typed gameplay actions;
- dialogue playthrough with canonical resume/replay protection;
- quest state transitions;
- world graph travel and deterministic encounter injection;
- shops, inventory transactions, lore unlocks, and campaign save;
- verified transition of `runtime_support` values where the browser consumer truly implements the contract.

This phase should reuse the same compiler → deterministic runtime → React adapter pattern rather than expanding the combat engine into a universal manager.

## 10. Testing Strategy

### Pure TypeScript unit tests

- fixed-step clock and visibility pause;
- seeded RNG sequences;
- command ordering;
- target selection/cycle/history;
- range versus target validity;
- stat stack order and clamps;
- exact damage/heal/mitigation calculations;
- cooldown/cast/recovery transitions;
- status reapplication/expiry/ticks;
- AI transitions;
- victory/defeat/reset;
- same input trace, same result.

### Backend contract tests

- complete bundle resolution;
- stable bundle version and digest inputs;
- missing/dangling relationships;
- enum normalization;
- controlled-character and side mapping;
- class/profile/item/talent stat assembly inputs;
- participant quantity;
- unsupported ability/effect readiness;
- no database mutation during compile.

### React component tests

- snapshot subscription and teardown;
- keyboard and pointer commands;
- target marker and frames;
- unavailable ability reasons;
- result/reset UI;
- debug dock and accessibility labels;
- localStorage migrations and stale content warnings.

### Playwright flow

Create one deterministic golden duel:

1. Open a fixture or seeded saved encounter.
2. Select the controlled character.
3. Start the encounter.
4. Move into range.
5. Lock the enemy.
6. Observe health decrease.
7. Trigger an ability.
8. Move out of range and verify target persistence.
9. Return, defeat the enemy, and see victory.
10. Reset and verify initial health/positions/cooldowns.

The E2E test should assert visible state and selected debug event IDs, not animation pixel timing.

### Performance budget

V1 target:

- 20 Hz simulation with up to 8 combatants;
- bounded event log;
- no full-dataset fetches during combat;
- no React state update per individual system mutation;
- one published snapshot per simulation step at most;
- no `Get All Actors` equivalent or repeated relationship scans in the hot loop.

## 11. Risks And Mitigations

### Risk: the heuristic simulator becomes accidental runtime truth

Keep `src/simulation` and `src/playtest` separate. Share only small, explicitly extracted formula helpers with exact tests.

### Risk: authoring fields have ambiguous executable semantics

Block or warn during bundle compilation. Resolve unit, range, formula, and targeting semantics in Phase 0 before broad content support.

### Risk: browser rendering concerns leak into combat rules

The engine exposes commands, events, and snapshots only. Geometry uses logical coordinates, never DOM elements.

### Risk: a large engine dependency overwhelms the authoring app

Start with pure TypeScript and SVG. Adopt Canvas/WebGL only after measured need, behind a renderer interface.

### Risk: local play state is mistaken for canonical game state

Use playtest-specific storage keys, visible “session only” copy, content digests, and no write endpoints for encounter results in V1.

### Risk: content changes during a playtest

Each session runs from an immutable bundle. Refreshing content requires an explicit reload/reset and produces a new digest.

### Risk: the runtime claims support it does not have

Maintain a versioned feature support matrix. A mechanic is “runtime verified” only after compiler, engine, and integration tests pass.

### Risk: combat work displaces the authoring product

Keep the first vertical slice narrow, lazy-load its routes, and make its primary value author feedback and data validation.

## 12. Milestone Mapping Back To The UE Document

| UE phase | Browser plan |
|---|---|
| Project skeleton/runtime root | Phase 1 route, session store, clock, fixture, and arena |
| Input and movement | Phase 1 input adapter and MovementSystem |
| Data imports/data service | Phase 0 contract plus Phase 2 backend compiler and RuntimeCatalog |
| Combatant foundation/reset | Phase 1 state model and deterministic reset |
| Targeting | Phase 1 TargetingSystem and SVG markers |
| Combat scaffolding | Phase 3 Stats/Health/Effect/Combat systems |
| Able integration | Phase 4 internal AbilitySystem/scheduler |
| Character build systems | Phase 6 items, talents, modifiers, and build save |
| Encounter flow/AI | Phase 5 compiler-driven spawn and AI systems |
| UI | Phases 3–7 React HUD and debug surfaces |
| Save/load | Phase 6 versioned local playtest save |
| Debug tools | Present from Phase 1 and completed in Phase 7 |

## 13. Definition Of Done For The First Playable Loop

The browser translation has reached UE prototype parity when all of the following are true:

- A saved combat encounter compiles from canonical records with no hidden frontend patches.
- The player can move, target, basic-attack, activate abilities, defeat enemies, lose, and reset.
- Enemy, ally, and party-focus targets remain independent.
- Range failure never clears an otherwise valid target.
- Stats, health, cooldowns, effects, statuses, death, and encounter outcome have single authoritative owners.
- One enemy and one companion use deterministic AI.
- Gear or a talent produces a measurable, explained combat change.
- A target frame, ability bar, telegraph, result state, and debug trace make the loop understandable.
- Same bundle, seed, and commands reproduce the same state and events.
- Runtime readiness directs unsupported or broken content back to the correct authoring workspace.
- The existing Simulation Sandbox still works and remains labeled as an estimator.
- Backend tests, frontend unit tests, build, lint, and the golden Playwright duel pass.

## 14. Recommended First Implementation Sessions

1. Write the runtime contract and readiness codes; add golden formula examples.
2. Resolve time units, ability reach, controlled-character behavior, and effect precedence.
3. Add a typed `trainingDuel` fixture with player, ally, and enemy.
4. Build the deterministic clock, RNG, commands, events, snapshot, and reset tests.
5. Render the fixture in SVG and add movement.
6. Add enemy/ally/focus targeting and marker tests.
7. Add the Flask bundle compiler and make one saved encounter pass readiness.
8. Add stats, health, effect resolution, and automatic basic attack.
9. Add one active ability and one telegraph.
10. Add enemy AI, encounter outcome, and the golden E2E duel.

Do not begin items, talents, broad effect coverage, or narrative runtime until the saved one-enemy encounter passes the deterministic Phase 3 exit gate.
