# Narrative-First Creation Flow And “Then…” Composer Plan

Status: product and implementation draft; awaiting exemplary workflow review before schema approval

Drafted: 2026-07-15

Proposed primary surface: embedded **Then…** composer plus a focused Creation Flow workspace

Likely implementation hosts: Dialogue Scene Room, Encounter Stage, Quest Journey Board, Shop Authoring, World Builder, Story Timeline, and the existing Progression Flow infrastructure

## Implementation Tracker

| Area | Status | Exit condition |
|---|---|---|
| Workflow corpus | In progress; two examples plus first behavior review captured | Representative linear, branching, persistent-state, reward, encounter, shop, quest, and world-change workflows are written in author language |
| Semantic vocabulary | Drafted here | Product wording distinguishes immediate actions, future availability, persistent state, and story placement without requiring technical vocabulary |
| Current-model capability map | Drafted here | Every proposed gesture is classified as supported, compilable, story-only, or canonically unsupported |
| Capture-only prototype | Not started | An author can preserve a mixed-content sequence locally without creating flags, requirements, beats, or records |
| Existing-record compiler | Not started | Supported steps compile deterministically into reviewed existing records and links |
| Canonical runtime extension decision | Partially decided | Typed choice/outcome/action transitions are confirmed; remaining review decides grouping, return, defeat, persistence, and whether a first-class playable-sequence model is necessary |
| Embedded Then… composer | Not started | Dialogue choices/endings and encounter/quest outcomes can open a scoped composer without route switching |
| Standalone Creation Flow workspace | Not started | Larger sequences and scoped story constellations can be shaped, resolved, rehearsed/traced, and committed from one focused workspace |
| Runtime/export contract | Gated | UE/runtime behavior for completion, branching, repeatability, shop opening, quest activation, and damage is documented and tested |
| Writer evaluation | Pending external evaluation | Representative authors complete the workflow corpus with materially less interruption than the current multi-workspace path |

## Executive Decision

The product should add a narrative-first authoring layer where the author records **what happens next** before defining how the database represents it.

The proposed interaction is a small, contextual **Then…** composer:

```text
Dialogue ends
  → Open Mara's shop now
  → Give the player the Ashblade
  → Play the portal explosion
  → Start Portal Raiders encounter
      → On victory
          → Greyhaven becomes Damaged
          → Make After the Ashes quest available
          → Place the aftermath in the story timeline
```

The authoring layer translates supported intentions into the existing event, reward, flag, requirement, story-placement, and entity records. Technical artifacts remain inspectable in **Implementation details**, but they are not the primary authoring language.

This should not begin as a universal graph editor or as an autonomous natural-language generator. It should begin as:

1. A fast, loss-resistant capture surface.
2. A small typed sequence and branch editor.
3. A deterministic compiler into honest canonical records.
4. One rollback-only preview and atomic commit for the entire authored idea.
5. Explicit unresolved steps whenever the current game model cannot honestly represent the idea.

The initial architectural recommendation is to reuse and modestly extend the existing event model rather than immediately create a universal flow schema. A first-class playable-sequence model should be introduced only if the exemplary workflows demonstrate that event payloads, follow-up links, and a small transition extension cannot express the required runtime behavior clearly.

The first two exemplary workflows also show that the capture layer needs two related shapes: a temporal **Then…** sequence for what happens next, and a scoped **Story Seed / Expand this place** constellation for the people, factions, lore, places, objects, conflicts, and playable packages that grow from one idea. Both shapes can compile into existing canonical records, but only a sequence claims runtime order.

## Confirmed Product Decisions From Author Review

The following behavior was confirmed on 2026-07-15. These are product requirements, not tentative implementation suggestions.

| Topic | Confirmed author expectation | Implementation consequence |
|---|---|---|
| Dialogue choice: open shop | Selecting a trade option closes the dialogue and immediately opens the selected shop UI | Add an executable shop action/event; an unlock flag alone is incorrect |
| Dialogue choice: start encounter | Selecting the encounter option closes the dialogue and starts the encounter immediately | Choice-specific executable transitions and stable choice identity are required |
| Retreat before encounter | Where retreat makes narrative sense, the dialogue offers **Retreat for now** or **Look for an exit** | Retreat is a dialogue branch that ends the interaction and returns to its origin; it is not an encounter outcome |
| Forced encounter | A forced boss encounter may omit retreat when retreat would be implausible, but the player should have had prior warning and an earlier opportunity to save/prepare | Authoring health should distinguish intentional lock-in from an accidentally inescapable transition |
| Encounter outcomes in V1 | Only victory and defeat are required | Limit the first transition contract to these two outcomes; negotiation/interruption/flee outcomes are later scope |
| Return after retreat | End the dialogue and return to the originating map, POI, character, item, or other interaction view; the player may interact again later | Runtime flow must preserve an origin/return context and keep the interaction repeatable unless separately completed |
| Quest surfacing | A quest may be discovered from prior knowledge, offered by an NPC, and/or accompanied by a visible map marker | Model these as distinct author actions; do not collapse “quest appears” into one flag |
| Collection progress | “Collect five wood” means five required items are currently in inventory | Typed inventory-count objectives and live inventory evaluation are required |
| Important quest items | Quest items are normally non-consumable and non-sellable, so current possession is meaningful | `ItemType.Quest` exists, but runtime/schema rules for consumption and sale protection must be explicit |
| Companion joins | A dialogue choice commonly causes the character to join the party | Add a dialogue-triggered companion-join runtime action; a story `joins` placement alone is insufficient |
| Damaged city | A city can have at least intact and damaged presentations with different description, shops/inventory, inhabitants, and POIs | Add location-state variants or an equivalent stable-identity override model; duplicating unrelated city records would break continuity |
| Timeline | World history and the playable story belong to one overall timeline; the player occupies one part and can discover earlier history | Provide one unified chronology with history/playable/discovery lenses; runtime execution order remains separate |

These decisions make a typed transition/action contract mandatory for the complete release. A pure flag-and-requirement compiler cannot satisfy the confirmed shop, encounter, companion, inventory-objective, or city-variant behavior.

## Why This Work Is Needed

The current app has the necessary low-level pieces, but it asks the author to manually compile one creative sentence into several technical records.

“After this dialogue, the shop opens” currently means:

1. Save the shop.
2. Create a persistent flag.
3. Create a requirement that consumes that flag.
4. Attach the requirement to the shop.
5. Return to the dialogue.
6. Attach the flag to the correct line or choice.
7. Review the dialogue consequence separately from the shop gate.

That representation is reasonable for runtime state, but it is not a reasonable first interface for a writer. The author is forced to leave the narrative sequence, choose technical naming, and remember cross-workspace intent before the idea is safely captured.

The repository already establishes the right general rule in `AUTHORING_WORKSPACES_GAME_DESIGN.md`: when one authoring thought spans normalized records, it should be composed and committed as one linked authoring packet. Creation Flow applies that rule to mixed-content narrative sequences.

## Goals

### Primary goals

- Let an author record a chain of ideas at the speed of the idea.
- Keep dialogue, encounters, shops, rewards, scripted moments, quests, world changes, and timeline placement in one temporary creative context.
- Ask only semantic questions that change game behavior.
- Generate flags and requirements only when persistent state or conditional availability actually requires them.
- Make immediate execution different from future availability.
- Preserve unsupported ideas as explicit unresolved steps instead of silently dropping them or encoding them in tags.
- Preview every generated or changed canonical record before one atomic commit.
- Embed the workflow where the author naturally discovers the next step.
- Keep the advanced dependency, gate, consequence, and timeline tools available for inspection and refinement.

### Secondary goals

- Reuse existing entities without making the author copy ids or slugs.
- Allow lightweight placeholder creation when an idea names content that does not exist yet.
- Make branch-specific consequences visually obvious.
- Support local rehearsal of sequence order and temporary state.
- Make generated implementation details readable enough that a technical designer can audit them.
- Produce a versioned intermediate format that can later support deterministic text import or carefully bounded model assistance.

## Non-Goals

- Do not replace the specialized Dialogue, Encounter, Quest, Shop, World, or Timeline workspaces.
- Do not duplicate every schema field inside Creation Flow.
- Do not create a canonical global player path.
- Do not infer that story-timeline order is executable runtime order.
- Do not treat a story lifecycle link as proof that runtime world state changed.
- Do not generate hidden flags for every step.
- Do not mutate a shared requirement merely because its wording appears to match.
- Do not save visual layout as canonical sequence order.
- Do not pretend that “damage the city” is implemented gameplay state if only a story note or location lifecycle placement exists.
- Do not require AI. Fast structured authoring and plain-text capture must work deterministically without a provider.
- Do not commit partially understood executable chains by default.

## Product Principles

### Capture before structure

The author can always add another plain-language step. Missing references, runtime fields, flags, requirements, and story placement never prevent initial capture.

### Intent before machinery

The primary card says **Open shop now**, not `EventType.Shop`. It says **Available after this**, not `requirements_id` plus `required_flags`.

### Ask behavioral questions, not schema questions

Good question:

> Should Mara's shop open immediately, or merely become available when the player speaks to Mara later?

Bad question:

> Should this create an event payload or attach a requirement id?

### Preserve uncertainty

An unresolved step is valid draft content. The product must not force an early false choice merely to satisfy a save schema.

### One authored idea, one review

A supported chain may touch many canonical records, but the author previews and commits it as one packet.

### Reveal implementation on demand

The author can expand a step to see generated event, flag, requirement, reward, transition, or story-link changes. Technical designers retain full control without making those details the default view.

### Runtime truth and story meaning stay separate

- Runtime order determines what the game executes.
- Persistent state determines what remains true later.
- Requirements determine what is available.
- Story placement explains where something matters in authored narrative order.

One gesture may intentionally create more than one of these, but the UI must name each effect.

## Author-Facing Vocabulary

| Author-facing term | Meaning | Technical implementation may include |
|---|---|---|
| **Then** | Continue immediately after the current step resolves | Event follow-up or a typed transition |
| **When** | Run only for a named outcome or condition | Dialogue choice, victory/defeat outcome, or requirement-backed transition |
| **Do now** | Execute content or an action immediately | Dialogue, encounter, shop, reward, teleport, or scripted-scene event |
| **Make available** | Allow later access; do not launch immediately | Persistent state plus a requirement attached to content |
| **Remember this** | Save a fact that later logic may inspect | Flag or future richer state record |
| **Change the world** | Record persistent gameplay state, story lifecycle state, or both | Flag, affected-entity runtime state, and/or `adventure_beat_link` |
| **Place in story** | Annotate where the step matters narratively | Adventure beat and lifecycle-aware beat links |
| **Note only** | Preserve direction that is not executable yet | Local draft note or later shared planning draft |
| **Implementation details** | Generated and reused canonical machinery | Events, flags, requirements, rewards, links, ids, and stale-write snapshots |

The UI should avoid using **beat** for every step. A Creation Flow step is executable or authoring intent. An adventure beat is optional story organization. A character story beat is a character-specific narrative record. These concepts may be linked, but they are not interchangeable.

## Using The Exemplary Workflows

The author's workflow examples are the source of truth for product scope. They should not be rewritten into flags and requirements before evaluation.

The growing corpus, including original author wording, semantic fixtures, current-model capability maps, and acceptance scenarios, lives in `NARRATIVE_CREATION_FLOW_WORKFLOWS.md`.

Each example should be stored in two forms:

1. **Author narrative:** the original plain-language sequence.
2. **Semantic fixture:** a reviewed interpretation used for design and tests.

Suggested fixture template:

```text
Title:
Creative setup:
Starting context:
What happens, in author language:
Branches or outcomes:
What should happen immediately:
What should remain true later:
What should merely become available:
What belongs on the story timeline:
Repeatability expectations:
Failure/cancel expectations:
Content that already exists:
Content that should be created as a placeholder:
Expected authoring experience:
```

The author should only need to fill the lines that matter. Product/design review can derive the semantic fixture collaboratively.

Each workflow becomes:

- A product acceptance scenario.
- A compiler golden fixture.
- A backend preview/commit contract test.
- A frontend interaction test.
- A runtime/export integration scenario when executable behavior exists.

The initial corpus should deliberately include:

- A linear dialogue-to-shop handoff.
- A dialogue choice that unlocks a shop without opening it immediately.
- A dialogue-to-encounter immediate transition.
- A reward before a fight and a reward after victory.
- A scripted scene between dialogue and combat.
- A world state change with both runtime and story meaning.
- A quest becoming available versus starting immediately.
- A branch with different aftermath.
- A repeatable interaction and a one-shot sequence.
- A sequence containing an intentionally unsupported idea such as targeted gameplay damage.

### Current workflow-corpus finding: two creative shapes

Workflow 1 is primarily temporal: quest offer, acceptance, travel, encounters, boss choice, reward, return, and follow-up. Workflow 2 begins from an underdeveloped place and grows lore, characters, factions, enemies, a dungeon, a companion, a relic, historical context, farming sources, and chapter appearances in parallel.

The capture layer should therefore support:

- **Sequence:** “What happens next?” with ordered steps, branches, outcomes, and runtime compilation.
- **Constellation:** “What belongs to this idea/place?” with one scoped story seed and parallel related ideas.
- **Hybrid:** a constellation whose selected branch is promoted into a playable sequence, or a sequence that creates new constellation ideas as consequences.

Constellation relationships are authoring intent until they resolve through real entity fields, links, placements, events, rewards, or other canonical contracts. Visual proximity and local relation labels do not become canonical facts automatically.

## Target Author Experience

### 1. Capture

From a dialogue line, choice, terminal line, encounter result, quest objective, event, shop, location, or story beat, the author selects **Then…**.

The composer opens inline or as a side tray without navigating away. Focus lands in a single input:

> What happens next?

The author can type free text or choose a common action. Pressing Enter creates another step and immediately focuses it.

Capture mode requires no ids, flags, requirements, placement, or complete target records. It autosaves after every meaningful change.

### 2. Shape

The author converts free-text steps into typed intentions using plain actions:

- Continue with dialogue
- Start encounter
- Open shop now
- Make content available
- Give reward
- Play scripted moment
- Change character/location/faction/item state
- Start or reveal quest
- Teleport
- Reveal lore
- Place in story
- Add a note

Typing remains allowed. A deterministic suggestion may propose a type, but it never silently changes the step.

### 3. Resolve

The composer resolves references against current content. For each target the author may:

- Reuse an existing record.
- Create a lightweight local placeholder.
- Open the specialized workspace in a protected side flow and return to the same sequence.
- Leave the reference unresolved.

Only behavior-changing ambiguities interrupt resolution. Questions stay attached to the affected card rather than appearing as a long wizard.

Examples:

- **Open now or unlock for later?**
- **After every ending or only this choice?**
- **Grant the weapon immediately or after victory?**
- **Does “city damaged” change gameplay availability, story presentation, or both?**
- **May this repeat, or should completion make it one-shot?**

### 4. Rehearse

The local rehearsal shows:

- The ordered steps taken.
- The branch or outcome chosen.
- Rewards granted.
- Temporary state gained.
- Content newly available.
- Story-only changes separately from runtime changes.
- The first unresolved or unsupported step.

Rehearsal never saves player state and must say so explicitly.

### 5. Review implementation

Before commit, the author sees two synchronized summaries.

**Story summary**

```text
Talk to Mara → Open shop → Receive Ashblade → Portal explosion
→ Fight Portal Raiders → Greyhaven damaged → After the Ashes available
```

**Implementation summary**

```text
Creates 3 events, 1 transition, 1 flag, 1 requirement, and 2 story links
Changes 1 shop, 1 quest, and 1 encounter reward
Leaves 1 scripted damage note unresolved
```

Implementation details expand per step. Existing shared-use impact is shown before any shared flag or requirement is reused or edited.

### 6. Commit

Preview is rollback-only. Commit is atomic. If any required existing record is stale, the entire executable bundle is rejected with navigation to the affected step.

After commit, the author remains in the original workspace and sees a compact consequence strip. They may open Creation Flow for the full chain or inspect the generated records in their owning workspaces.

## Primary Product Surfaces

### Embedded Then… composer

This is the primary feature. It should appear at points where “what happens next?” is natural:

- Dialogue terminal line.
- Dialogue choice.
- Selected ordinary dialogue line when a mid-scene consequence is valid.
- Encounter victory/result area.
- Quest objective completion.
- Quest completion.
- Event outcome.
- Shop interaction or purchase milestone if later supported.
- Location POI interaction.
- Story beat content tray.

The embedded version edits one small branch. It should not display the full project graph.

### Embedded Expand this place composer

World Builder should offer **Expand this place** for a selected city, location, or scoped region. It opens a local story seed rather than an executable chain.

The seed inherits the selected place and can collect:

- Lore prose and historical moments.
- Character, faction, item/relic, place, dungeon, quest, dialogue, encounter, creature-role, companion, and chapter placeholders.
- Existing related content from the selected context.
- Local relationships such as mentioned in, opposes, seeks, died at, found at, leads, inhabits, and reappears in.
- Playable branches that can be promoted into **Then…** sequences.

This remains a scoped creation packet, not a universal world graph. Only relationships with an honest owning schema or link table compile as canonical relationships.

### Creation Flow workspace

Proposed route: `/author/creation-flow`.

This is a focused workspace for longer mixed-content sequences. It should evolve or reuse the existing Progression Flow infrastructure rather than duplicate its catalogs, dependency analysis, gate handling, and bundle patterns.

Recommended layout:

- Searchable flow/draft library in a collapsible drawer.
- Central readable sequence outline as the default canvas.
- Optional topology view for branches.
- Context dock for the selected step.
- Compact story/state/implementation lenses.
- Rehearsal and issue navigation.
- Sticky local-draft and project-commit status.

Like Dialogue Flow, Script/outline view should be the creative default and graph view should be structural/debugging support.

### Capture inbox

If user testing shows ideas often begin outside a specific entity, add a minimal project capture inbox. It stores unshaped local flow drafts and opens them in Creation Flow later.

This should follow the embedded prototype, not precede it. The first validation target is preserving momentum from an existing dialogue or encounter.

## Step And Transition Semantics

### Step families

| Family | Author action | Current canonical mapping | Initial disposition |
|---|---|---|---|
| Dialogue | Continue with or run a dialogue | `events.type = Dialogue` plus `dialogue_id` | Supported through existing event model |
| Encounter | Start an encounter | `events.type = Encounter` plus `encounter_id` | Supported through existing event model |
| Item reward | Give one or more items | Event, encounter, or quest reward fields depending on timing | Supported; composer must make timing explicit |
| Currency/XP/reputation | Grant payoff | Existing event, encounter, or quest reward fields | Supported where a valid source exists |
| Lore reveal | Reveal lore | `events.type = LoreDiscovery` plus `lore_id` | Supported through existing event model |
| Teleport | Move the player | `events.type = Teleport`; exact payload contract must be verified | Partially modeled; block commit until destination semantics are complete |
| Scripted moment | Play explosion/cutscene direction | `events.type = ScriptedScene`; no rich scene payload currently exists | Capture and event shell supported; detailed execution unresolved |
| Shop now | Close dialogue and immediately open a shop | No current `Shop` event payload | Confirmed required canonical/runtime extension |
| Shop later | Make a shop available later | Flag + requirement + `shops.requirements_id` | Compilable with existing records |
| Quest available | Make a quest discoverable/eligible | Flag + requirement + `quests.requirements_id` | Compilable with existing records |
| Quest discovery/offer/marker | Discover from knowledge, receive an NPC offer, and/or reveal a map marker | No single current action contract | Confirmed as distinct actions; journal activation remains unresolved |
| Inventory-count objective | Require a current quantity of a quest item | Quest objective currently stores prose, requirement, and completion flags | Confirmed required typed objective/runtime inventory check |
| Companion join | Add a dialogue character to the active party | Story lifecycle supports `joins`, but party membership action is absent | Confirmed required runtime action/state contract |
| Persistent fact | Remember that something happened | Existing flag | Supported, but generate only when later logic needs it or one-shot behavior requires it |
| Location/character/item/faction story state | Mark introduced, injured, damaged, destroyed, obtained, restored, etc. | Lifecycle-aware `adventure_beat_links` | Supported as story meaning; not automatically runtime state |
| Location variant | Switch one logical place between intact/damaged presentations | No canonical location-variant contract | Confirmed need for stateful description/shop/inhabitant/POI overrides |
| Gameplay world state | Change collision, services, population, visuals, routes, etc. | Varies; often flag-gated content, sometimes no field | Resolve per target; never claim generic support |
| Gameplay damage/effect | Damage party, character, structure, or area | No shared narrative action contract | Preserve as unresolved until a target/effect runtime contract exists |
| Timeline placement | Put this moment in a timeline/arc | `adventure_beats` and `adventure_beat_links` | Supported and optional |
| Note | Preserve creative direction | Local draft note | Always supported as draft, never silently executable |

### Transition families

| Author wording | Meaning | Current support |
|---|---|---|
| Then | Continue after successful completion | `events.next_event_id` supports one linear follow-up |
| When player chooses X | Branch from a specific dialogue choice | Not canonically represented as an event transition |
| Open shop | Close the dialogue and immediately display the shop | Confirmed behavior; typed shop action/event is absent |
| Start encounter | Close the dialogue and immediately enter the encounter | Confirmed behavior; choice-specific transition contract is absent |
| Retreat for now | End dialogue, return to the originating interaction view, and allow later re-entry | Confirmed behavior; origin/return context needs a runtime contract |
| On victory | Continue after encounter victory | Confirmed V1 outcome; typed transition is absent |
| On defeat | Continue after encounter defeat | Confirmed V1 outcome; exact defeat aftermath remains open |
| When shop closes | Continue after interaction completion | Depends on future shop event/runtime contract |
| If state is true | Conditional transition | Requirements can gate content, but transition-specific conditions need a contract |
| Otherwise | Fallback branch | Not represented |
| Stop here | Intentional end | Event chain may end without `next_event_id`; author-facing terminal meaning should be explicit |

Linear **Then** chains can use current `next_event_id`. Branch-specific, outcome-specific, and fallback transitions must not be simulated through naming conventions or tags.

## Immediate Action Versus Persistent Availability

This distinction is central and should be tested directly.

### Open shop now

```text
Dialogue event
  → completion transition
  → Shop event for Mara's Forge
```

This is runtime order. It should not require a shop-unlock flag unless the shop also needs to remain available later.

Confirmed interaction behavior:

1. The player selects the trade dialogue choice.
2. The dialogue closes.
3. The referenced shop opens immediately.
4. What happens when the shop closes remains a runtime return-context decision.

### Start encounter now

```text
Dialogue choice
  → close dialogue
  → start selected encounter immediately
      → victory transition
      → defeat transition
```

Where the player may decline, **Retreat for now** is a separate dialogue choice that closes the dialogue and returns to the originating view. It does not start and then flee the encounter. A deliberately forced encounter may omit retreat when the fiction supports that lock-in, but should be foreshadowed with an earlier preparation/save opportunity.

### Make shop available later

```text
Selected dialogue line or choice
  → sets Mara's Forge available state
  → generated/reused requirement consumes that state
  → shop uses the requirement
```

This is persistent availability. It should not immediately open the shop UI.

### Open now and keep available

The composer may intentionally create both effects. The review must list both plainly:

- Opens Mara's Forge immediately after the dialogue.
- Makes Mara's Forge available for future interactions.

## Capture Draft Contract

The frontend needs a versioned intermediate representation independent of canonical schemas. A provisional TypeScript shape is:

```ts
type CreationFlowDraft = {
  format: "SOA-CREATION-FLOW/1";
  id: string;
  title: string;
  shape: "sequence" | "constellation" | "hybrid";
  origin?: {
    kind: "dialogue" | "dialogue_node" | "dialogue_choice" | "encounter" |
      "quest" | "quest_objective" | "event" | "location" | "story_beat";
    id: string;
    subId?: string;
  };
  entryStepId?: string;
  steps: CreationFlowStep[];
  transitions: CreationFlowTransition[];
  relations: CreationFlowRelation[];
  localNotes: string[];
  artifactIds: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

type CreationFlowStep = {
  id: string;
  kind: string | "unshaped";
  text: string;
  target?: { kind: string; id?: string; draftId?: string; label?: string };
  timing?: "immediate" | "after_completion" | "available_later" | "story_only";
  persistence?: "none" | "session" | "permanent" | "one_shot";
  payload?: Record<string, unknown>;
  resolution: "unshaped" | "unresolved" | "supported" | "unsupported";
};

type CreationFlowTransition = {
  id: string;
  fromStepId: string;
  toStepId: string;
  when: "complete" | "choice" | "victory" | "defeat" | "condition" | "fallback";
  sourceOutcomeId?: string;
  requirementId?: string;
};

type CreationFlowRelation = {
  id: string;
  fromStepId: string;
  toStepId: string;
  relation: string;
  resolution: "local_intent" | "canonical" | "unsupported";
};
```

Transitions express temporal/executable order. Relations express scoped creative association and must never be interpreted as execution order. This is a planning and compiler input format, not automatically canonical game data. It must be versioned, migrated on load, and covered by golden fixtures.

### Draft persistence

Phase 1 should use the proven Dialogue Flow pattern:

- Immediate browser-local autosave.
- Separate local-draft and project-commit status.
- Named snapshots.
- Automatic snapshot before bulk resolution or compilation.
- Recovery after reload.
- Stable generated ids stored in `artifactIds` so repeated preview does not create different proposed records.
- Export/import of the draft JSON for recovery and test fixtures.

A later shared project-draft table is justified only if collaboration, cross-device continuation, or review of unresolved creative work becomes a real requirement. Local storage must never be described as project persistence.

## Compilation Architecture

### Compiler responsibilities

The Creation Flow compiler converts the intent draft into a proposed canonical mutation packet.

It must:

- Resolve existing entity references by immutable id.
- Preserve stable ids for every proposed new record.
- Classify each step as supported, story-only, or unresolved.
- Generate the minimum required state machinery.
- Reuse existing flags or requirements only after explicit confirmation when shared meaning may change.
- Create new requirements rather than mutate shared requirements by default.
- Build event payloads and linear follow-up links where honest.
- Build reward rows on the source that matches the author's timing.
- Build adventure beats/links only when story placement was requested.
- Include `expected_previous` snapshots for every changed existing record.
- Return step-scoped blockers, warnings, and implementation explanations.
- Produce deterministic output for the same draft, catalog, and compiler version.

It must not:

- Infer unsupported runtime effects.
- Turn every step into a flag.
- Use tags as executable transition semantics.
- silently repurpose a shared requirement.
- Treat generated labels as identity.
- commit from the client without backend validation.

### Proposed endpoints

```text
GET  /api/ui/creation-flow/catalog
POST /api/ui/creation-flow/preview
POST /api/ui/creation-flow/bundle
```

`catalog` should compose only the references needed by the step types currently in the draft, where practical. It should include dependency usage, story-placement context, and supported target/action capabilities.

`preview` accepts the versioned intent draft, compiles it inside one database session, performs normal route/schema validation, returns the story and implementation summaries, then rolls back.

`bundle` recompiles the same versioned draft, checks stale snapshots and accepted warnings, and commits atomically.

The backend compiler is authoritative. The frontend may mirror lightweight validation for responsiveness, but the client may not claim that a step is committable until backend preview succeeds.

### Reuse existing services instead of calling endpoints internally

Current bundle routes contain useful reconciliation logic but are route-local. Before Creation Flow composes them, extract service-level operations for:

- Event upsert and payload validation.
- Dialogue-node consequence updates.
- Encounter/quest/event reward updates.
- Flag creation.
- Requirement creation and attachment.
- Adventure beat/link creation and lifecycle validation.
- Review change accumulation.
- Stale-write comparison.

Creation Flow should call these services inside one transaction. It should not make HTTP calls between backend routes and should not duplicate validation logic.

### Proposed frontend modules

```text
soa-editor/src/authoring/creationFlow.ts
soa-editor/src/authoring/creationFlowCompilerPreview.ts
soa-editor/src/authoring/creationFlowDraftStorage.ts
soa-editor/src/authoring/creationFlow.test.ts
soa-editor/src/components/authoring/ThenComposer.tsx
soa-editor/src/components/authoring/CreationFlowOutline.tsx
soa-editor/src/components/authoring/CreationFlowStepCard.tsx
soa-editor/src/components/authoring/CreationFlowInspector.tsx
soa-editor/src/components/authoring/CreationFlowImplementationDetails.tsx
soa-editor/src/components/authoring/CreationFlowRehearsal.tsx
soa-editor/src/pages/CreationFlowPage.tsx
```

Reuse `AuthoringPageShell`, `AuthoringPanel`, `BundleReview`, shared UI tokens, entity reference helpers, dependency walkthrough helpers, story-placement helpers, and Dialogue Flow's history/snapshot patterns.

### Proposed backend modules

```text
backend/app/routes/r_ui_creation_flow.py
backend/app/services/creation_flow_compiler.py
backend/app/services/creation_flow_capabilities.py
backend/app/services/bundle_operations.py
backend/tests/test_creation_flow_contracts.py
```

Exact names may change, but compilation, capability reporting, and reusable bundle operations should not live in a large page route.

## Canonical Model Decision

The workflow corpus must decide among three levels of canonical expansion.

### Option A: current-record compiler only

Compile supported intentions into existing events, `next_event_id`, rewards, flags, requirements, and story links. Keep branches and unsupported actions local.

Benefits:

- Lowest migration and runtime risk.
- Reuses current export and dependency analysis.
- Delivers immediate relief for unlocks, rewards, linear dialogue/encounter chains, and story placement.

Limits:

- Cannot honestly open a shop immediately.
- Cannot represent choice/victory/defeat transitions.
- Cannot represent generic damage or immediate quest activation.
- Longer sequences have no canonical group identity or repeat policy.

Option A is suitable for the first capture/compile pilot, but it does not satisfy the motivating shop workflow completely.

### Option B: extend events and transitions

Recommended V1 runtime direction. Author review has confirmed that immediate dialogue-to-shop and dialogue-to-encounter actions require typed executable transitions; remaining runtime details still need review.

Potential minimal changes:

- Add `Shop` to `EventType`.
- Add nullable `events.shop_id` with a real foreign key.
- Define event completion semantics for dialogue, encounter, shop, reward, lore, teleport, and scripted scene payloads.
- Add a typed `event_transitions` table for dialogue-choice, victory, defeat, completion, and return-context behavior.
- Keep `events.next_event_id` as the compatible linear transition during migration.
- Add explicit repeat/one-shot behavior only if runtime does not already own it elsewhere.
- Add typed runtime actions for companion joining and approved quest-surfacing modes rather than encoding them as flags alone.

Provisional transition fields:

```text
id
from_event_id
to_event_id
trigger_type        complete | dialogue_choice | victory | defeat | interaction_closed | condition | fallback
trigger_ref_id      nullable stable choice/outcome reference
requirements_id    nullable condition
priority            deterministic branch ordering
tags                descriptive only
```

This requires stable dialogue choice identity. Current choices are JSON rows without an obvious immutable choice id, so branch-specific transitions are gated on a dialogue choice identity decision. Array index or label must not become canonical identity.

Benefits:

- Builds on the runtime-shaped concept already present.
- Supports the motivating immediate shop and encounter handoffs.
- Avoids a second general-purpose sequence system.

Risks:

- `Event` may become overloaded if every gameplay action is forced into it.
- Branch semantics require coordinated authoring, export, and runtime work.
- Scripted damage still needs a real target/effect contract.

### Option C: first-class playable sequences

Introduce a sequence/group model with steps and transitions only if examples require shared sequence identity, multiple entries, branching outcomes, parallel actions, resumability, repeat policy, or editing a chain as a durable game object.

Possible concepts:

- `playable_sequences`: identity, entry, owning context, repeat policy, requirements, tags.
- `playable_sequence_steps`: typed references to executable payloads.
- `playable_sequence_transitions`: typed completion/outcome/condition edges.

This should reference existing dialogues, encounters, shops, quests, and events rather than duplicate their payload fields.

Do not choose Option C merely because a graph looks attractive. Choose it only when the workflow and runtime semantics require a durable grouped object that Option B cannot express without distortion.

### Decision gate status

Canonical implementation can proceed only after the remaining open behavior is resolved. Current status:

1. **Open:** Does the runtime currently execute `next_event_id`, and what exactly counts as event completion?
2. **Confirmed:** Dialogue choices directly select immediate shop, encounter, and companion-join actions; immutable choice identity is required.
3. **Confirmed:** Encounter outcomes in the first useful release are victory and defeat only.
4. **Open:** After an immediately opened shop closes, does the flow return to the originating interaction, continue to another step, or end?
5. **Partially confirmed:** A pre-encounter retreat ends dialogue and restores the origin view for later re-entry. General pause/save/resume/abandon semantics remain open.
6. **Open:** Must several actions happen in parallel after one outcome, and if so are they ordered or atomic?
7. **Partially confirmed:** Quest discovery, NPC offer, and map-marker reveal are distinct supported meanings. Journal activation, notification, and automatic acceptance remain open.
8. **Open:** What is the general runtime target/effect model for damage?
9. **Partially confirmed:** A city needs intact/damaged variants affecting description, shops, inhabitants, and POIs. Variant identity, switching, overrides, and save state remain to be designed.
10. **Open:** Must authored flows be shared durable project records, or is compiled canonical output sufficient?

## Flag And Requirement Generation Policy

Flags and requirements remain valuable implementation tools. They should be generated only for persistent or conditional behavior.

Generate or request persistent state when:

- Later content checks whether an outcome happened.
- Content becomes available after an outcome.
- A one-shot sequence needs completion memory.
- A branch consequence must remain true after the immediate chain.

Do not generate state when:

- One event simply follows another immediately.
- A reward is granted directly by a supported source.
- A step is only story placement.
- The author wrote a presentation note with no later logic.

Generation rules:

- Derive readable proposed names from the author action.
- Show the author-facing fact first: **Mara's shop is available**.
- Put slug, id, flag type, requirement id, and attachment under Implementation details.
- Search for similar existing state, but never auto-reuse a shared flag based on text similarity alone.
- Prefer a new scoped requirement over editing a shared one.
- Show all producers and consumers before reuse or mutation.
- Warn about generated flags without consumers and requirements without reachable producers.
- Never automatically delete committed flags or requirements when a draft step is removed; offer explicit reviewed cleanup with usage evidence.

## Placeholder Content

Creative flow often names content before it is fully designed. The composer should support local placeholders such as:

- “Portal Raiders encounter”
- “Ashblade legendary weapon”
- “After the Ashes quest”
- “Mara's shop”

A placeholder has a stable local draft id, kind, label, and optional one-paragraph direction. It is visibly incomplete and cannot masquerade as a canonical record.

Resolution options:

- Link an existing record.
- Create a minimal canonical record through the owning workspace's required fields.
- Hand off to the owning specialized workspace with the local draft prefilled, then return.
- Keep the placeholder unresolved.

Creation Flow should not grow schema-complete forms for every placeholder type.

## Timeline And World-State Policy

Timeline placement is optional unless the author wants canonical story ordering, lifecycle tracking, or coherence warnings.

When the author says **Greyhaven is damaged**, the composer must clarify which layers apply:

- **Story meaning:** add a location lifecycle link with `change_type = changed` or `destroyed` and a clear state label.
- **Persistent gameplay fact:** create/reuse state that gameplay can inspect.
- **Concrete gameplay effects:** gate routes, shops, POIs, encounters, visuals, or other real records that change.

The UI may offer all three together, but it must not imply that a story lifecycle link changes gameplay or that a flag automatically changes city visuals.

If the author has not chosen story placement, the executable sequence may still commit. The app can later suggest placement for consequential unplaced content using existing timeline warnings.

### Unified world chronology

The target product has one overall world timeline. Historical wars, old deaths, relic use, the player's playable era, current chapters, and later consequences occupy different parts or lenses of that chronology.

The player does not execute the entire timeline. They inhabit one portion and can discover evidence or lore about earlier portions. Therefore the timeline must distinguish:

- **Occurred in history** — when the world event happened.
- **Discovered by the player** — when lore/evidence becomes knowable in play.
- **Played now** — when the player directly participates in the current story.
- **Runtime transition order** — immediate execution order, which is not inferred from chronological placement.

The current model splits some of this meaning between lore timelines, story arcs, adventure beats, events, and discovery state. The implementation should first provide a unified author-facing chronology over those sources, then approve schema expansion only where ordering or identity cannot be represented honestly.

### Stateful location variants

The damaged-city example requires one logical place to retain continuity while presenting different state-specific content.

A provisional location-variant contract should support:

```text
logical_location_id
variant_id
state_key             intact | damaged | restored | custom
description_override
shop_availability/overrides
inhabitant_presence/overrides
poi_additions/removals/overrides
visual/presentation notes or runtime asset reference
activation condition or explicit state transition
```

This is preferable to copy-pasting the city as an unrelated location because quests, lore, routes, timeline occurrences, and map identity should continue to refer to the same place. The exact override model is still gated on runtime and workflow review.

## Validation And Health

### Draft-level issues

- Unshaped step.
- Missing target.
- Immediate versus available-later ambiguity.
- Missing branch outcome.
- Unsupported runtime action.
- Placeholder missing required owning-workspace details.
- Timeline-only change presented as gameplay state.

### Compiled bundle blockers

- Missing or stale reference.
- Event type/payload mismatch.
- Transition targets outside the compiled chain without explicit reuse.
- Dialogue choice transition without immutable choice identity.
- Immediate shop/encounter/companion action without a valid typed target.
- Inventory-count objective targeting a non-item or an item without approved quest-item behavior.
- Location variant transition without one stable logical location and valid variant.
- Reward attached to a source that cannot grant it.
- Required flag without a producer.
- Requirement both requiring and forbidding the same state.
- Unsupported damage/effect target.
- Event cycle without explicit repeat semantics.
- Multiple fallback transitions.
- Non-deterministic transition priority.
- Attempt to mutate a shared requirement without acknowledgement.

### Warnings

- Generated state with no consumer.
- Newly available content with no world placement.
- Consequential dialogue/encounter with no story placement.
- Important reward without an item journey placement.
- Story state change without corresponding gameplay change where the author appeared to request both.
- Long chain without an intentional end.
- One-shot wording without persistent completion state.
- Placeholder committed only as a minimal shell.
- Forced encounter with no retreat branch and no authored preparation/lock-in note.

Every issue must navigate to the exact step and offer a plain-language explanation or quick fix where safe.

## Rehearsal And Trace

Extend the existing temporary dependency walkthrough rather than invent a separate state engine.

The Creation Flow rehearsal should:

- Start with selectable temporary flags and reputation.
- Walk the explicit local transition order.
- Apply modeled rewards and outcome flags.
- Re-evaluate generated and existing requirements after each step.
- Show immediate next actions separately from newly available content.
- Allow selection of dialogue choices and encounter outcomes.
- Stop at unsupported steps with an explanation.
- Detect loops and enforce a safe step limit.
- Record path snapshots for comparison.

It should not claim to simulate combat, dialogue quality, cutscene execution, shop UI, or UE runtime behavior.

## Atomic Review And Commit

The shared `BundleReview` should gain a Creation Flow presentation that groups technical changes by author step.

For each step show:

- Author intent.
- Canonical records created.
- Canonical records changed.
- Relationships added or removed.
- Existing shared usages affected.
- Runtime effect, persistent-state effect, and story-placement effect.
- Warnings and unresolved notes.

Commit rules:

- All executable steps in the committed path must compile.
- Story notes may remain explicitly non-executable.
- Partial commit is off by default.
- If partial commit is later allowed, the break must appear as an intentional terminal or unresolved boundary.
- Preview and commit use the same stable proposed ids.
- Any stale existing record rejects the whole transaction.
- Accepted warning ids are scoped to the exact compiled mutation.

## Delivery Phases

### Phase 0: workflow corpus and semantic RFC

Deliverables:

- Collect exemplary workflows in original author language.
- Create the semantic fixture format and coverage matrix.
- Classify each desired action and transition against the current model.
- Confirm runtime/export behavior for existing events and `next_event_id`.
- Decide the minimum useful branch/outcome semantics.
- Approve Option A, B, or C for canonical runtime expansion.
- Add Creation Flow as an active queue item in `AUTHORING_WORKSPACES_GAME_DESIGN.md` before implementation.

Exit gate:

- The motivating shop and encounter workflows have an honest end-to-end mapping.
- Every unsupported step is named rather than hand-waved.
- Runtime owners agree on completion and repeat semantics.

### Phase 1: capture-only embedded prototype

Deliverables:

- Embedded composer on dialogue choices and terminal lines.
- Embedded **Expand this place** story seed on a selected World Builder location.
- Free-text and typed local steps.
- Linear ordering plus local branch labels.
- Scoped constellation ideas and local non-temporal relationships.
- Local autosave, recovery, snapshots, and draft export.
- Placeholder targets.
- Clear supported/unresolved classification.
- No canonical writes from the prototype.

Evaluation:

- Can an author preserve the complete exemplary idea without leaving Dialogue Flow?
- Can an author grow a lore-first place into connected placeholders without selecting target schemas first?
- Does the author understand immediate versus available-later wording?
- Does the author understand that constellation relationships are not runtime order?
- Does structuring feel lighter than manually authoring flags and requirements?

### Phase 2: existing-record compiler

Deliverables:

- Versioned draft contract and golden fixtures.
- Backend catalog, preview, and bundle endpoints.
- Compilation for existing event payloads and linear `next_event_id` chains.
- Compilation for event/encounter/quest rewards.
- Compilation for dialogue node/choice output flags.
- Compilation for flags, new scoped requirements, and supported attachments.
- Optional adventure beat/link creation.
- Step-grouped Bundle Review.
- Temporary sequence/state rehearsal.

This phase may ship behind a feature flag even if Shop Now remains unresolved. The UI must label the unsupported step honestly.

### Phase 3: minimal canonical runtime extensions

Likely deliverables, subject to Phase 0:

- Shop event payload and runtime/export handling.
- Stable dialogue choice identity if choice-specific transitions are required.
- Typed dialogue-choice, victory, defeat, completion, and return-context transitions.
- Quest discovery, NPC-offer, and map-marker actions; journal activation follows the remaining decision.
- Typed inventory-count objectives and explicit non-consumable/non-sellable quest-item behavior.
- Dialogue-triggered companion-join action and persistent party membership state.
- Stateful location variants for the approved intact/damaged override set.
- Repeat/one-shot fields only if no existing runtime owner exists.
- Schema migrations, JSON schemas, CSV/source recovery, and UE export preservation.

Generic gameplay damage should be a separate approved runtime contract, not a loose JSON field added merely to complete the demo.

### Phase 4: full embedded composer rollout

Deliverables:

- Dialogue choice/end embeds.
- Encounter outcome embed.
- Quest objective/completion embed.
- Event outcome embed.
- POI/location interaction embed where current runtime references support it.
- Compact consequence strip in owning workspaces.
- Protected placeholder handoff and return flow.

Roll out one host at a time using the same draft and compiler contract.

### Phase 5: standalone Creation Flow workspace

Deliverables:

- Draft library.
- Switchable script-like sequence outline and scoped story-seed constellation.
- Branch topology view.
- Step inspector and context dock.
- Story, state, reward, runtime, and issue lenses.
- Path rehearsal and comparison.
- Search and issue navigation for larger flows.
- Optional promotion of capture-inbox drafts.

The standalone surface follows successful embedded use; it is not required to prove the core interaction.

### Phase 6: runtime integration and production hardening

Deliverables:

- End-to-end exported fixtures for every supported step/transition.
- Runtime completion and resume tests.
- Save/load and one-shot behavior tests.
- Loop and cancellation safeguards.
- Cross-version compatibility for compiled events/transitions.
- Performance checks for catalogs and dependency analysis.
- Writer pilot against the full exemplary corpus.

### Phase 7: optional assisted shaping

Only after deterministic authoring proves useful:

- Suggest step types from free text.
- Suggest reference matches.
- Detect likely “now versus later” ambiguity.
- Import a provider-neutral structured flow block.
- Optionally use a model to propose structure from selected text.

Any model assistance remains local draft generation. It may not silently choose canonical state, shared requirements, rewards, or story truth.

## Testing Strategy

### Frontend unit tests

- Draft normalization and version migration.
- Stable artifact id generation.
- Step insertion, reorder, branch, duplicate, undo, and snapshot behavior.
- Constellation relation creation, promotion into a sequence, and separation from runtime transitions.
- Immediate versus available-later transformations.
- Placeholder resolution.
- Issue localization.
- Story and implementation summary generation.
- Rehearsal path stepping and loop limit.
- Retreat returns to the stored origin without starting the encounter.
- Quest inventory-count progress responds to current inventory quantity.
- Location variant review distinguishes logical place identity from active presentation.

### Frontend interaction tests

- Open Then… from a dialogue terminal and keep dialogue edits intact.
- Open **Expand this place** from World Builder and keep map selection/context intact.
- Capture the motivating sequence using only keyboard controls.
- Leave and reload with the local draft restored.
- Resolve an existing shop and create an encounter placeholder.
- Preview, inspect generated machinery, cancel, and continue editing.
- Navigate a backend blocker to the affected step.

### Backend contract tests

- Preview rolls back every proposed table change.
- Commit applies the identical deterministic mutation.
- Stale `expected_previous` rejects atomically.
- Existing event payload validation remains intact.
- Flag/requirement generation and attachment are valid.
- Shared requirement mutation requires acknowledgement or is rejected.
- Story links use valid target types and lifecycle fields.
- Unsupported steps block executable commit.
- Event loops and invalid transition sets are rejected.
- Shop and encounter choice actions reference valid targets and have stable choice identity.
- Quest-item protections and typed inventory objectives validate consistently.
- Companion join actions reference a companion-capable character and valid source choice.
- Location variants cannot cross logical-location ownership.
- Deleting a source does not leave invalid generated references.

### Golden workflow tests

Every exemplary workflow should assert:

- Parsed/shaped intent graph.
- Required author questions.
- Compiled canonical mutation.
- Story summary.
- Implementation summary.
- Expected blockers/warnings.
- Temporary rehearsal trace.
- Runtime/export fixture after that contract exists.

### Regression suite

- Existing Dialogue Flow bundle tests.
- Progression Flow tests.
- Scoped Gate tests.
- Consequence Composer tests.
- Adventure Timeline tests.
- Dependency-index tests.
- CSV/source-recovery tests.
- UE export tests.
- TypeScript build and ESLint.

## Success Measures

The primary measure is preserved creative momentum, not the number of records generated.

Suggested pilot measures:

- Time from selecting a dialogue ending to capturing the complete mixed-content idea.
- Number of route changes required before the idea is safely stored.
- Number of required interactions using “flag,” “requirement,” “gate,” or raw ids.
- Percentage of exemplary workflow meaning preserved before technical resolution.
- Time to resolve and preview the captured flow later.
- Number of accidental differences between intended immediate actions and mere availability.
- Number of generated orphan flags or requirements.
- Author confidence when explaining what will happen in play.
- Technical-designer confidence when auditing generated implementation details.

Initial product targets for the motivating workflow:

- Capture the full chain without leaving Dialogue Flow.
- Expand a selected place into lore and connected placeholders without leaving World Builder.
- Require zero flag or requirement decisions during capture.
- Require no premature choice of Character, Faction, Item, Location, Quest, or Encounter forms while shaping a story seed.
- Resolve supported targets from the same composer.
- Preview all generated records in one review.
- Make **open now**, **available later**, and **both** unmistakably different.
- Keep world history, playable story order, and repeatable farming sources visibly separate.
- Preserve unsupported damage direction without claiming it is executable.

## Risks And Mitigations

### Risk: the feature becomes a universal graph editor

Mitigation: keep embedded scoped branches primary; use a readable outline by default; specialize only the selected step and current chain.

### Risk: technical machinery becomes invisible and untrustworthy

Mitigation: provide per-step Implementation details, usage evidence, deterministic preview, and owning-workspace links.

### Risk: flag proliferation

Mitigation: generate state only for persistence/conditions, preview usage, suggest but do not force reuse, and warn on no-consumer state.

### Risk: event becomes a generic dumping ground

Mitigation: approve typed payloads and transitions deliberately; leave unsupported actions unresolved; move to a sequence model if event semantics become distorted.

### Risk: story placement is mistaken for gameplay implementation

Mitigation: show Runtime, Persistent state, and Story meaning as separate effect rows on every step.

### Risk: generated bundles overwrite concurrent edits

Mitigation: stable ids, `expected_previous`, backend recompilation, atomic rejection, and navigable stale-step errors.

### Risk: placeholders create low-quality empty records

Mitigation: keep placeholders local by default; use owning-workspace minimum fields and explicit incomplete warnings when promoted.

### Risk: branching semantics lack stable identity

Mitigation: do not use array indexes or labels; add immutable choice/outcome identity before canonical branch transitions.

### Risk: runtime and editor disagree

Mitigation: make runtime completion semantics part of the schema RFC and maintain exported golden fixtures executed by runtime tests.

### Risk: capture is lost because it is only browser-local

Mitigation: immediate autosave, visible local-only status, snapshots, export, and recovery first; evaluate shared project drafts after the pilot.

## Definition Of Done For The First Useful Release

The first useful release is complete when:

1. An author can open **Then…** from a dialogue ending or choice and **Expand this place** from a selected World Builder location.
2. They can capture both a mixed dialogue/shop/reward/scripted-scene/encounter/quest/world-change chain and a lore-first place constellation without leaving the originating context.
3. Capture requires no flag, requirement, beat, or id knowledge.
4. The draft survives reload and clearly states that it is local until committed.
5. The composer distinguishes immediate execution, persistent availability, and story placement.
6. Supported steps resolve existing targets or preserve local placeholders.
7. Local constellation relationships remain visibly distinct from executable transitions and compile only through honest canonical contracts.
8. Existing-model steps compile deterministically and preview through one rollback-only endpoint.
9. The motivating **open shop now** behavior has an approved canonical and runtime contract, not a fake unlock substitute.
10. Unsupported gameplay damage remains visible and blocks any claim of a fully executable chain.
11. One atomic review lists every created/changed record grouped by author step.
12. Stale edits and invalid references reject the entire commit safely.
13. Dialogue Flow, Progression Flow, Scoped Gate, Consequence Composer, Timeline, dependency, recovery, and export regression tests pass.
14. Representative authors complete the exemplary workflow corpus with fewer context switches and less technical interruption than the current workflow.

## Questions To Resolve With The Workflow Corpus

These questions should remain open until the examples make them concrete:

- Is the most common author gesture attached to a dialogue choice, a dialogue ending, an encounter result, or a free-standing story moment?
- How often does **Then** mean immediate execution versus later availability?
- Must multiple consequences occur in parallel after one outcome?
- After an immediately opened shop closes, should the player return to the originating interaction, continue the flow, or return to the world view?
- What exactly happens after encounter defeat: reload, respawn, return, alternate scene, or configurable outcome?
- Which steps must be one-shot, repeatable, cancellable, or resumable?
- For a forced encounter, is authored foreshadowing/preparation metadata sufficient, or must a real save/checkpoint interaction be linked?
- When a quest is discovered or offered, when does it enter the journal and become active?
- Can one quest use several surfacing modes simultaneously, such as rumor discovery plus NPC offer plus map marker?
- Are all `Quest` items non-consumable/non-sellable by rule, or can authors override those protections?
- When and how is the active intact/damaged location variant switched, saved, and restored?
- Is reward timing usually before content, after completion, or chosen per branch?
- How should an unfinished placeholder behave when the rest of a chain is ready?
- Is browser-local capture sufficient for the first pilot, or must unfinished flows be visible to collaborators?
- Do the workflows need nested subflows, or is a small branch graph sufficient?
- Should lore prose grow placeholders through selected-text actions, linked idea cards, or both?
- How should the unified timeline represent the difference between a historical occurrence and the later moment when the player discovers it?
- Is “chapter” author-facing grouping over current arcs/beats or a missing canonical record?
- Is a region a location-hierarchy scope, a saved authoring scope, or a separate game-world concept?

## Final Product Test

The feature succeeds when the author can think:

> They talk, then trade, then the player receives the legendary weapon, then the portal explodes, then the attackers arrive, then the fight happens, then the city is damaged, then a new quest appears.

It must also support a different creative thought:

> This city still has no story. I write about an old war; that gives me a dead hero, a cult, its boss and enemies, a dungeon, a companion, the relic they seek, an opposing faction, and the chapter where all of them first matter.

The app should first preserve either thought exactly. It should then help the author clarify the few distinctions that affect play, history, or story placement. Only afterward should it reveal the records, flags, requirements, events, rewards, transitions, relations, and story links required to implement the resolved parts honestly.
