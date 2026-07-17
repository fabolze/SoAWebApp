# Narrative-First Creation Flow And “Then…” Composer Plan

Status: V1 product semantics are approved. Phase 1 capture is implemented as an alpha, Phase 2 manifest provenance is implemented as a project-local foundation, and the first Phase 3A dialogue-choice identity/action slice is implemented. Compiler, transition, quest/gameplay-action, chronology/variant, remaining-embed, standalone-workspace, and runtime-consumer work remains open.

Drafted: 2026-07-15

Last implementation audit: 2026-07-17

Proposed primary surface: embedded **Then…** composer plus a focused Creation Flow workspace

Likely implementation hosts: Dialogue Scene Room, Encounter Stage, Quest Journey Board, Shop Authoring, World Builder, Story Timeline, and the existing Progression Flow infrastructure

## Implementation Tracker

| Area | Status | Exit condition |
|---|---|---|
| Workflow corpus | **Golden intent fixtures implemented; compile automation pending.** Three examples plus six behavior reviews are captured | Golden fixtures preserve the map-to-quest sequence, place-story constellation, and resume-and-expand hybrid workflow in author language |
| Semantic vocabulary | **V1 approved.** Copy may still be tuned in usability testing | Product wording distinguishes immediate actions, future availability, persistent state, and story placement without requiring technical vocabulary |
| Shared authoring foundations | **Implemented and reusable.** Existing workspaces, local drafts, protected return links, scoped gates, consequences, story placement, dependency analysis, bundle review, source recovery, and CSV export are present | Creation Flow consumes shared services/components rather than duplicating route-local reconciliation |
| Current-model capability map | **Audited against the repository on 2026-07-17** | Every proposed gesture is classified as already supported, foundation-only, or new implementation work |
| Capture-only prototype | **Implemented alpha.** Versioned local draft, normalization/migration, snapshots, import/export, steps, relations, placeholders, mentions, and honest support classification are present | An author can preserve a mixed-content sequence locally without creating flags, requirements, beats, or records |
| Existing-record compiler | Not started | Supported steps compile deterministically into reviewed existing records and links |
| Canonical action/transition decision | **Partially implemented.** Stable dialogue choice IDs and six validated ordered choice-action types are present; transitions, encounter outcomes, gameplay actions, and dedicated DataTable rows remain open | Typed choice actions, ordered atomic consequence groups, victory transitions, defeat policies, return behavior, and committed-flow provenance are explicit without a universal playable-sequence runtime model |
| Embedded Then… composer | **Dialogue alpha implemented.** Choices and terminal nodes open the shared local composer; encounter/quest outcome embeds remain open | Dialogue choices/endings and encounter/quest outcomes can open a scoped composer without route switching |
| Expand this place / resume surfaces | **World Builder alpha implemented.** Selected locations open the shared prose/card/step surface; resume lists related local drafts and committed manifests | A selected place can open a shared idea graph, and the author can resume related drafts/manifests/placeholders without reconstructing context |
| Standalone Creation Flow workspace | Not started | Larger sequences and scoped story constellations can be shaped, resolved, rehearsed/traced, and committed from one focused workspace |
| Web data/export contract | **Partially implemented.** Manifest source recovery/UE exclusion and dialogue choice-action JSON schema/export are present; the remaining Phase 3 contracts are open | Authoring schemas and DataTable export shapes preserve completion, limited branching, per-content repeatability, typed gameplay actions, shop actions, quest state, variants, and runtime-verification status honestly; Unreal execution remains outside this implementation |
| Creation Flow tests | **Alpha coverage implemented.** Current verification is 201 backend tests, 94 frontend unit tests, targeted Chromium interaction coverage, lint, and production build on 2026-07-17 | Contract, golden-workflow, interaction, export, migration, and regression suites pass |
| Writer evaluation | Pending external evaluation | Representative authors complete the workflow corpus with materially less interruption than the current multi-workspace path |

## Repository Implementation Audit — 2026-07-17

## Implementation Update — 2026-07-17

Implemented after the audit:

- `soa-editor/src/authoring/creationFlow.ts`, its JSON Schema, storage adapter, migration/validation tests, and W1–W3 golden intent fixtures establish `SOA-CREATION-FLOW/1` without canonical writes.
- `CreationFlowCapture`, `ThenComposer`, and `ExpandPlaceComposer` provide one shared local capture experience. Dialogue choices/terminal nodes and selected World Builder locations are embedded hosts; draft inventory and **Continue where I stopped** surface related work.
- Prose mentions and idea cards share placeholder identity. Removing one mention does not remove a still-owned idea card.
- `creation_flow_manifests` and `creation_flow_artifacts` are authoring-only project tables with CRUD validation, cascade behavior, source recovery order, seed headers, and explicit UE-export exclusion.
- Dialogue choices now normalize to stable `choice_id` values. New choices/actions receive immutable IDs; typed actions validate target discriminator/reference, timing, repeat ownership, continuation, deterministic order, replay identity, and runtime-support status. `open_shop` requires `resume_source_dialogue`.
- Chromium interaction tests prove terminal-dialogue continuation capture/reload and selected-location expansion. Contract and regression verification is green at 201 backend tests and 94 frontend unit tests; lint and production build succeed.

Still open: reusable cross-domain compiler operations; authoritative catalog/preview/bundle; transitions and encounter defeat/retry contracts; Phase 3B/3C schemas; canonical compile/rehearsal; remaining embeds; standalone workspace; consumer verification; and writer pilot. Local capture intentionally does not claim canonical or Unreal execution.

### Audit verdict at the start of 2026-07-17

This section records the pre-implementation audit snapshot and is retained for scope history. The repository was ready to begin focused implementation, but Narrative Creation Flow was not yet partially shipped at audit time. The implementation update above supersedes absence claims where code has since landed; compiler, full canonical contracts, and standalone-workspace gaps remain current.

That distinction matters for scope and risk:

- **Already done** means a working capability can be reused directly and is covered by the current regression suite.
- **Foundation only** means a nearby pattern exists, but it does not yet satisfy a Creation Flow acceptance scenario.
- **Open** means no dedicated model, route, component, export contract, or test was found.

### What is already implemented and should be reused

| Capability | Evidence in the repository | Audit classification | Creation Flow use |
|---|---|---|---|
| Authoring hosts | `WorldBuilderPage`, `DialogueFlowPage`, `EncounterStagePage`, `QuestJourneyPage`, `ProgressionFlowPage`, and `StoryTimelinePage` are routed authoring surfaces | Already done | Embed the composer into mature contexts instead of creating replacement editors |
| Loss-resistant local work | Dialogue, encounter, creature, item, ability, world, and timeline workspaces use browser-local drafts; `navigation/draftInventory.ts` exposes recoverable local work | Already done as a platform pattern | Build the versioned flow draft store, snapshots, import/export, and resume summary on one shared storage adapter |
| Protected navigation and handoff | Schema/immersive editors honor `returnTo`; World Builder and Character Studio already preserve return context and handoff intent | Foundation only | Generalize from a single return URL to `CreationFlowReturnFrame[]` without breaking existing links |
| Atomic review patterns | Dialogue, Progression Flow, Consequence Composer, and Adventure Timeline expose rollback preview and atomic commit; shared `BundleReview` renders review state | Already done in individual domains | Extract transaction-safe operations and one step-grouped review model for cross-domain commits |
| Low-level narrative records | Events, rewards, flags, requirements, dialogues, encounters, quests, shops, story arcs, timelines, adventure beats, and typed beat links exist | Already done for the supported subset | Compile only when those records honestly represent the author intent |
| Gates and consequences | Shared Scoped Gate and Consequence Composer infrastructure can create/reuse flags and requirements and update supported outcome rewards | Already done for current owners | Reuse services for availability, persistent facts, rewards, and producer/consumer review |
| Story/runtime separation | Story Timeline and adventure beat links distinguish story placement from runtime event chains and expose lifecycle metadata | Already done | Keep relations, story placement, persistent state, and executable transitions visually and technically separate |
| Dependency and health analysis | Dependency walkthroughs and project-health checks cover producer/consumer and coherence concerns | Already done as a platform capability | Feed catalog context, reuse warnings, orphan checks, and resume-related context |
| Generic persistence/export | Source recovery and schema-driven source/UE CSV export exist; authoring-only tables are explicitly excluded from UE export | Already done as infrastructure | Add new schemas/tables deliberately, keep flow manifests authoring-only, and add golden DataTable fixtures |

### Partially supported canonical semantics

| Product intention | Current repository support | Why it remains open |
|---|---|---|
| Linear event continuation | `events.next_event_id` exists | Runtime completion/execution is externally unverified; there are no typed source/outcome transitions |
| Dialogue branching | Choices contain text, `next_node_id`, requirements, and flags | Choices have no immutable `choice_id`, typed actions, replay-protection identity, or nested interaction return policy |
| Rewards | Events, encounters, and quests store item/currency/reputation/XP rewards | Reward timing, ordered mixed actions, repeat ownership, quest turn-in timing, and runtime-verification status are missing |
| Quest objectives | Ordered objective JSON contains an id, description, gate, and completion flags | There is no typed current-inventory objective, journal lifecycle, turn-in mode, acquisition-source validation, or quest-item protection contract |
| Reputation ranks | Factions have a JSON `reputation_config.thresholds` object and requirements support minimum reputation | The ranks are fixed-name, not a validated ordered tier contract, and there is no producer/rank/consumer authoring trace |
| Regions and eras | `LocationType.Region`, parent locations, story-arc timeline links, and timeline year ranges exist | Nearest-region derivation, explicit era order/current era, and legacy `locations.region` migration rules are not implemented |
| World/entity state | Location lifecycle links and item/character base records exist | Runtime-active location, character, and item variants with validated override semantics do not exist |
| Status/effect vocabulary | Effects and statuses support damage/heal/status operations and cleanse/dispel permissions | Narrative gameplay-action source, target, order, repeat policy, and DataTable rows do not exist |

### Dedicated Creation Flow work confirmed absent at audit time

- No `SOA-CREATION-FLOW/1` TypeScript/runtime schema, migration code, shared flow-draft storage, or golden workflow fixtures.
- No `creation_flow_manifests` authoring-only table or step-to-artifact provenance model.
- No `/api/ui/creation-flow/catalog`, `/preview`, or `/bundle` endpoints and no authoritative compiler/capability service.
- No embedded **Then…**, **Expand this place**, or **Continue where I stopped** UI.
- No shared prose-span/idea-card reference graph.
- No standalone `/author/creation-flow` workspace.
- No Creation Flow contract, interaction, migration, compiler, or export tests.

### Baseline verification

The implementation audit ran the existing automated baseline on 2026-07-17:

- Backend: `194 passed`.
- Frontend unit tests: `84 passed` across 16 files.
- Frontend production build: passed. Vite reported the existing large-chunk advisory, which is not a Creation Flow blocker but should be watched when adding the standalone workspace.

End-to-end Playwright tests were not part of this documentation audit. They remain a required gate for the embedded composer rollout.

## Executive Decision

The product should add a narrative-first authoring layer where the author records **what happens next** before defining how the database represents it.

The proposed interaction is a small, contextual **Then…** composer:

```text
Dialogue choice: Trade
  → Open Mara's shop now
  → When shop closes, resume the same dialogue
Dialogue choice: Continue
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

V1 selects Option B: reuse and modestly extend the existing event/action model, while storing committed authoring flows as project-local manifests with provenance. The three workflows require sequences, constellations, and hybrids, but they do not require a universal canonical playable-sequence runtime model or deeply branching player narrative. That larger model remains a future option only if later content cannot be represented honestly through typed actions, transitions, requirements, and committed-flow manifests.

The three exemplary workflows show that the capture layer needs two related shapes and their hybrid: a temporal **Then…** sequence for what happens next, and a scoped **Story Seed / Expand this place** constellation for the people, factions, lore, places, objects, conflicts, and playable packages that grow from one idea. A resumed city-development session commonly begins as a constellation and promotes selected ideas into quests, dialogues, encounters, reputation progression, and shop availability. Only explicit sequence transitions claim runtime order.

## Confirmed Product Decisions From Author Review

The following behavior was confirmed on 2026-07-15. These are product requirements, not tentative implementation suggestions.

| Topic | Confirmed author expectation | Implementation consequence |
|---|---|---|
| Dialogue choice: open shop | Selecting a trade option suspends the dialogue, immediately opens the selected shop UI, and resumes the same dialogue interaction when the shop closes | Add a nested shop action with `resume_source_dialogue` return behavior; an unlock flag or one-way transition is incorrect |
| Dialogue choice: start encounter | Selecting the encounter option closes the dialogue and starts the encounter immediately | Choice-specific executable transitions and stable choice identity are required |
| Retreat before encounter | Where retreat makes narrative sense, the dialogue offers **Retreat for now** or **Look for an exit** | Retreat is a dialogue branch that ends the interaction and returns to its origin; it is not an encounter outcome |
| Forced encounter | A forced boss encounter may omit retreat when retreat would be implausible, but the player should have had prior warning and an earlier opportunity to save/prepare | Authoring health should distinguish intentional lock-in from an accidentally inescapable transition |
| Encounter outcomes in V1 | Victory continues through authored consequences; defeat does not continue through an ordinary narrative branch | Model victory as an outcome transition and defeat as a retry/load/respawn policy; exact restore target remains a separate policy decision |
| Default defeat behavior | Save automatically immediately before the fight; after defeat, retry from directly before the encounter and allow the short lead-in dialogue or interaction button to be invoked again | Default to `pre_fight_save + retry_pre_fight`; allow an author to override the encounter with a linked respawn point, while respawn persistence details remain runtime-unverified |
| Return after retreat | End the dialogue and return to the originating map, POI, character, item, or other interaction view; the player may interact again later | Runtime flow must preserve an origin/return context and keep the interaction repeatable unless separately completed |
| Quest surfacing | A quest may be discovered from prior knowledge, offered by an NPC, and/or accompanied by a visible map marker | Model these as distinct author actions; do not collapse “quest appears” into one flag |
| Quest assignment | Once a quest is discovered or given, it is recorded and cannot be declined; the player may simply leave it undone | Do not add a separate accepted/declined gate in V1; distinguish assignment, objectives met, turn-in, and reward timing in the exported contract |
| Collection progress | “Collect five wood” means five required items are currently in inventory | Typed inventory-count objectives and live inventory evaluation are required |
| Important quest items | All quest items are protected from ordinary consumption and sale; they may be removed by quest completion/turn-in | Enforce protection for `ItemType.Quest` and model system-controlled removal separately from player consumption |
| Ordinary collection items | A collection objective may target an ordinary, unprotected item; if the player spends, sells, or loses it, current-inventory progress falls and the item must be obtained again | Keep objective counting separate from protection and require an authored repeatable or otherwise sufficient acquisition source |
| Quest rewards and turn-in | Rewards may happen when objectives are completed or when the quest is turned in; turn-in is the normal default | Add explicit reward timing and turn-in mode such as manual confirmation, dialogue with the associated person, or automatic completion |
| Companion joins | A dialogue choice commonly causes the character to join the party | Add a dialogue-triggered companion-join export action; a story `joins` placement alone is insufficient |
| Damaged city | A city can have at least intact and damaged presentations with different description, shops/inventory, inhabitants, and POIs | Add location-state variants or an equivalent stable-identity override model; duplicating unrelated city records would break continuity |
| Character progression/state | A character may need beginning, later, stronger, or changed-allegiance presentations without becoming unrelated duplicate people | Keep one stable character identity and add typed character variants/stages; use separate character records only for genuinely distinct beings |
| Item progression/state | A legendary, custom, or story-important item may awaken, be reforged, become corrupted, be restored, or otherwise change over time while remaining the same artifact | Keep one stable item identity and add typed item variants/stages for presentation and mechanics; use separate item records only for genuinely distinct objects |
| Chapter | Story Arcs are the game's chapters | Use the existing `story_arcs` identity and ordering rather than creating a separate chapter table in V1 |
| Region | A region groups several settlements, forests, and other places below a continent; countries are not required | Use canonical `LocationType.Region` hierarchy nodes under continents; derive a place's region from its nearest Region ancestor |
| Timeline eras | Separate Timeline records represent ordered eras; the last or explicitly marked current era contains the main character's playable present | Add explicit era ordering/current-era metadata and preserve historical occurrence separately from later discovery/play placement |
| Historical occurrence and later discovery | An event may occur in an earlier era while the player discovers evidence or meaning in the playable-present era | Store occurrence and discovery/play placements as separate facts referencing the same canonical subjects; neither placement implies runtime transition order |
| Gameplay actions from narrative content | Dialogue, encounters, quest outcomes, and other authored sources may damage or heal, apply or remove statuses/curses, grant currency, or cause similar gameplay effects | Add a typed action envelope that references canonical Effects, Statuses, Currencies, Items, Stats, and other supported targets; do not use arbitrary JSON or claim Unreal execution is verified |
| Repeatability | Whether an interaction, encounter, reward source, or other content can repeat is decided for that content rather than by one global rule | Preserve an explicit per-owner/per-step repeat policy and inherit an existing canonical owner's policy where it already exists |
| Lore brainstorming | Selected prose spans and freely created idea cards should work together so an idea captured during writing or brainstorming can later be resolved and implemented without being copied into a second system | Use one shared local reference/placeholder identity; selecting text creates or links a card, while a card can also exist before it has an exact prose mention |
| Required placeholders at commit | A real unresolved placeholder must block canonical commit; it must never be discarded silently | Draft save remains allowed, but commit requires linking an existing record or promoting the placeholder to a canonical record; partial commit remains off |

These decisions make typed actions, transitions, nested interaction return policies, and entity variants mandatory for the complete release. A pure flag-and-requirement compiler cannot satisfy the confirmed shop, encounter, companion, inventory-objective, or location/character/item-variant behavior.

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
- Do not implement Unreal execution, save/load behavior, combat retry behavior, shop presentation, quest-journal presentation, or other in-game UI in this web-app work. The web app authors, validates, previews, and exports the required contracts as DataTables; external runtime integration verifies and consumes them later.

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

### Current workflow-corpus finding: two creative shapes and their hybrid

Workflow 1 is primarily temporal: quest surfacing, assignment, travel, encounters, boss choice, reward, turn-in, and follow-up. Workflow 2 begins from an underdeveloped place and grows lore, characters, factions, enemies, a dungeon, a companion, a relic, historical context, farming sources, and chapter appearances in parallel. Workflow 3 resumes an existing city, updates canonical content, expands a causal faction constellation, and promotes selected ideas into a mostly linear quest/reputation/shop sequence; it is the practical hybrid case.

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
Talk to Mara → Trade and resume dialogue → Receive Ashblade → Portal explosion
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

### Continue where I stopped

World Builder and the Creation Flow library should provide a concise resume summary for the currently selected or most recently edited place. It combines browser-local drafts, project-local committed-flow manifests, unresolved placeholders, recent related edits, and the next recorded question. It may accept pasted working notes as local capture input, but it does not require direct ChatGPT or external-note integration.

This is web-authoring orientation only. It does not become a canonical game record or in-game UI.

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
- Selected prose spans promoted into linked idea cards, plus free-standing idea cards created before exact prose exists.
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

This should follow the embedded prototype, not precede it. The first validation targets are resuming a selected World Builder place and preserving momentum from an existing dialogue or encounter.

## Step And Transition Semantics

### Step families

| Family | Author action | Current canonical mapping | Initial disposition |
|---|---|---|---|
| Dialogue | Continue with or run a dialogue | `events.type = Dialogue` plus `dialogue_id` | Supported through existing event model |
| Encounter | Start an encounter | `events.type = Encounter` plus `encounter_id` | Supported through existing event model |
| Item reward | Give one or more items | Event, encounter, or quest reward fields depending on timing | Supported; composer must make timing explicit |
| Currency/XP/reputation | Grant payoff | Existing event, encounter, or quest reward fields | Supported where a valid source exists |
| Faction rank progression | Cross a named reputation threshold and unlock information/content | Minimum faction-reputation requirements exist, but named rank tiers do not | Add ordered faction-rank records and compile their consumers into explicit reputation requirements |
| Lore reveal | Reveal lore | `events.type = LoreDiscovery` plus `lore_id` | Supported through existing event model |
| Teleport | Move the player | `events.type = Teleport`; exact payload contract must be verified | Partially modeled; block commit until destination semantics are complete |
| Scripted moment | Play explosion/cutscene direction | `events.type = ScriptedScene`; no rich scene payload currently exists | Capture and event shell supported; detailed execution unresolved |
| Shop now | Suspend the source dialogue, immediately open a shop, and resume the same dialogue context when the shop closes | No current typed dialogue-choice action | Confirmed required choice-action/export contract; an ordinary dialogue-completion event is incorrect |
| Shop later | Make a shop available later | Flag + requirement + `shops.requirements_id` | Compilable with existing records |
| Quest available | Make a quest discoverable/eligible | Flag + requirement + `quests.requirements_id` | Compilable with existing records |
| Quest discovery/assignment/marker | Discover from knowledge, receive from an NPC, and/or reveal a map marker | No single current action contract | Confirmed as distinct surfacing actions; discovery or assignment records the quest without a decline state |
| Inventory-count objective | Require a current quantity of any item | Quest objective currently stores prose, requirement, and completion flags | Confirmed typed objective/export contract; protection and turn-in consumption are separate policies |
| Companion join | Add a dialogue character to the active party | Story lifecycle supports `joins`, but party membership action is absent | Confirmed required authoring/export action and consumer-state contract |
| Persistent fact | Remember that something happened | Existing flag | Supported, but generate only when later logic needs it or one-shot behavior requires it |
| Location/character/item/faction story state | Mark introduced, injured, damaged, destroyed, obtained, restored, etc. | Lifecycle-aware `adventure_beat_links` | Supported as story meaning; not automatically runtime state |
| Location variant | Switch one logical place between intact/damaged presentations | No canonical location-variant contract | Confirmed need for stateful description/shop/inhabitant/POI overrides |
| Character variant | Switch one logical person between authored progression stages | No canonical character-variant contract | Confirmed need for one stable identity plus typed presentation, allegiance, level, profile, and interaction overrides |
| Item variant | Switch one logical artifact between dormant/awakened/reforged/corrupted/restored or custom stages | No canonical item-variant contract | Confirmed need for stable identity plus typed presentation, effect, requirement, and modifier overrides |
| Gameplay world state | Change collision, services, population, visuals, routes, etc. | Varies; often flag-gated content, sometimes no field | Resolve per target; never claim generic support |
| Typed gameplay action | Damage or heal, apply/remove a status or curse, restore a resource, grant currency, or apply another canonical effect | Existing `effects`, `statuses`, `currencies`, rewards, stats, and entity references provide most payload records, but no shared narrative action envelope exists | Add the typed web/export contract below; export supported intent as `runtime_unverified` until a consumer confirms execution |
| Timeline placement | Put this moment in a timeline/arc | `adventure_beats` and `adventure_beat_links` | Supported and optional |
| Note | Preserve creative direction | Local draft note | Always supported as draft, never silently executable |

### Transition families

| Author wording | Meaning | Current support |
|---|---|---|
| Then | Continue after successful completion | `events.next_event_id` supports one linear follow-up |
| When player chooses X | Branch from a specific dialogue choice | Not canonically represented as an event transition |
| Open shop | Suspend the dialogue and immediately display the shop | Confirmed behavior; nested shop action/return contract is absent |
| Start encounter | Close the dialogue and immediately enter the encounter | Confirmed behavior; choice-specific transition contract is absent |
| Retreat for now | End dialogue, return to the originating interaction view, and allow later re-entry | Confirmed behavior; origin/return context needs a runtime contract |
| On victory | Continue after encounter victory | Confirmed V1 outcome; typed transition is absent |
| On defeat | Stop ordinary narrative continuation and invoke the encounter's retry/load/respawn policy | Confirmed not to be a normal consequence branch; exact restore target remains open |
| When shop closes | Close the shop and resume the exact suspended dialogue interaction | Confirmed behavior; nested interaction stack/session contract is absent |
| If state is true | Conditional transition | Requirements can gate content, but transition-specific conditions need a contract |
| Otherwise | Fallback branch | Not represented |
| Stop here | Intentional end | Event chain may end without `next_event_id`; author-facing terminal meaning should be explicit |

Linear **Then** chains can use current `next_event_id`. Branch-specific, outcome-specific, and fallback transitions must not be simulated through naming conventions or tags.

### Consequence grouping in V1

Workflow 3 confirms that one resolved action may cause several related consequences, for example:

```text
Complete the shadow-creature quest
  → gain bandit reputation
  → cross a faction-rank threshold
  → reveal more faction information
  → make reputation-gated equipment available
```

These are not automatically alternative branches and they do not imply real-time parallel execution. V1 stores them as one explicitly ordered consequence group and commits the group's canonical mutations atomically. Later actions in the group may depend on state produced by earlier actions. A true branch exists only when the author deliberately adds mutually exclusive choices or conditions.

The third workflow favors clear authored outcomes and limited branching. V1 therefore needs a small branch graph plus linked flows, not nested executable subflows or a universal branching narrative system.

## Immediate Action Versus Persistent Availability

This distinction is central and should be tested directly.

### Open shop now

```text
Dialogue choice: Trade
  → action: open Mara's Forge
  → continuation: resume this dialogue context when the shop closes
```

This is an action owned by a stable dialogue choice, not ordinary dialogue completion. It should not require a shop-unlock flag unless the shop also needs to remain available later.

Confirmed interaction behavior:

1. The player selects the trade dialogue choice.
2. The dialogue UI closes or hides, but the interaction session is suspended rather than completed.
3. The referenced shop opens immediately.
4. Closing the shop resumes the same dialogue session so the player can trade again, ask another question, or receive a quest.
5. Previously applied line/choice effects are not applied a second time merely because the dialogue resumes.

The runtime therefore needs an interaction stack or equivalent continuation frame containing the source dialogue, current node/choice context, return policy, and already-applied effect identity. Shop contents and prices may be re-evaluated from current state when the window opens again.

For the web/export contract, the stable choice owns a typed action:

```text
choice_id
action_type           open_shop
target_shop_id
continuation_policy   resume_source_dialogue
action_id             stable identity for replay protection
sort_order
```

`next_node_id` may be omitted when the action's continuation policy intentionally retains or ends the source dialogue context. A choice must have at least one valid navigation target or typed action. This keeps dialogue navigation separate from the action that the choice performs.

### Start encounter now

```text
Dialogue choice
  → close dialogue
  → start selected encounter immediately
      → victory transition
      → defeat policy: retry/load/respawn; no ordinary narrative continuation
```

Where the player may decline, **Retreat for now** is a separate dialogue choice that closes the dialogue and returns to the originating view. It does not start and then flee the encounter. A deliberately forced encounter may omit retreat when the fiction supports that lock-in, but should be foreshadowed with an earlier preparation/save opportunity.

### Recommended save, checkpoint, and defeat policy

The author confirmed the pre-fight save/retry behavior as the V1 default. Respawn remains an explicit per-encounter override whose retained-state details are runtime-unverified.

For a story-heavy, dialogue-heavy game, the safest default is:

- Allow manual saves in safe non-combat states, subject to normal technical restrictions.
- Create an automatic pre-fight save immediately before a forced or boss encounter.
- On defeat, offer **Retry encounter** from that save as the primary action and restore the player directly before the encounter.
- Allow the short lead-in dialogue to be invoked again, or expose the same interaction/button that starts the boss encounter.
- Also allow **Load another save**.
- Use the last activated respawn point for world position when the design intentionally chooses respawn-with-persistence rather than snapshot rollback.
- Do not require replaying an entire dungeon by default; make long-run reset behavior an explicit dungeon/challenge policy.

The model must distinguish three concepts that are currently easy to conflate:

| Concept | Meaning |
|---|---|
| Save snapshot | Restores player/world/quest/inventory state to a recorded moment |
| Combat checkpoint | A short-lived retry snapshot immediately before an encounter |
| Respawn point | A world location where the player is placed after defeat under a respawn policy |

The current location model already has `has_respawn_point`, but the repository does not yet define a complete save snapshot, combat checkpoint, or defeat policy contract. Creation Flow should capture a forced encounter's **preparation policy** rather than merely warn through prose:

```text
retreat_policy       allowed_before | forced
save_policy          automatic_pre_fight | linked_respawn | none_explicit
defeat_policy        retry_pre_fight | respawn_point | load_other_save | custom
retry_entry_policy   replay_lead_in_dialogue | restore_interaction | immediate
retry_source_ref_id  optional dialogue/POI/interaction/event reference
respawn_location_id  required only for respawn override
```

Confirmed V1 default: `automatic_pre_fight + retry_pre_fight`. The author may override a specific encounter with `respawn_point`. The web app exports that selection but does not define which inventory, quest, world, currency, or temporary state a consuming runtime retains under respawn; until defined externally, the override remains `runtime_unverified`.

Defeat-policy selection and its DataTable fields belong to the web/export contract. Creating checkpoints, restoring saves, presenting retry/load UI, and applying the policy belong to the external game runtime and are not implemented by the web app.

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

- Opens Mara's Forge immediately from the selected dialogue choice and then resumes that dialogue.
- Makes Mara's Forge available for future interactions.

## Minimal Quest Lifecycle And Collection Contract

The web app does not need to design or implement the in-game quest-journal UI. It does need unambiguous authoring and export meanings so a DataTable consumer can distinguish assignment, progress, turn-in, and reward timing.

V1 uses the following minimal lifecycle:

```text
available        the quest may be discovered or assigned through authored content
in_journal       the quest has been discovered or given and is recorded; it cannot be declined
objectives_met   all required objective conditions currently pass
turned_in        the player explicitly finished through the configured turn-in interaction
```

The player may leave an `in_journal` quest undone indefinitely. V1 does not need a separate `offered`, `accepted`, `declined`, `tracked`, `hidden`, `archived`, or `abandoned` narrative state. NPC assignment, prior-knowledge discovery, and marker revelation remain distinct surfacing actions and may all reference the same quest.

Turn-in is explicit by default:

```text
turn_in_mode     manual_confirm | dialogue_character | automatic_on_completion
turn_in_target   optional character/dialogue/event reference
reward_timing    on_objectives_met | on_turn_in
```

The normal default is `reward_timing = on_turn_in`. `on_objectives_met` remains available when the authored quest should pay out immediately.

Inventory-count objectives may target ordinary or protected items:

```text
objective_type       collect_item
target_item_id
required_count
completion_policy    current_inventory
consume_on_turn_in
```

- Ordinary items may be sold, spent, consumed, or lost. If their current count falls below the requirement, objective progress falls too and the player must obtain them again.
- `ItemType.Quest` items and explicitly unique story artifacts are protected from ordinary sale, consumption, and disposal. System-controlled turn-in may still remove them when authored.
- Every required item must have an authored acquisition source, or be guaranteed by an earlier reachable step in the same flow. Ordinary replaceable items need a repeatable or otherwise sufficient source for the required count.
- The item model therefore needs an explicit uniqueness/protection policy rather than inferring uniqueness from rarity or name.

## Faction Reputation Rank Contract

Workflow 3 requires named faction progression rather than only raw reputation numbers. V1 should add an ordered rank contract:

```text
rank_id
faction_id
name
description
min_reputation
sort_order
```

Ranks do not replace the numeric faction-reputation value. Crossing a rank means the current value meets that tier's threshold. Content unlocked by a rank compiles through explicit minimum-reputation requirements while retaining `rank_id` as author-facing provenance.

Rank consumers may include:

- Lore or faction information.
- Dialogue choices/scenes.
- Quests.
- Shop availability.
- Specific shop-inventory/equipment rows.

Preview must show the complete dependency chain: reputation producer → crossed rank → generated/reused requirement → unlocked consumers. Equipment placeholders remain local until resolved and therefore block canonical commit.

## Typed Gameplay Action And Effect Contract

Narrative sources need one general action envelope rather than a damage-only exception. A dialogue choice may send the player to a healer, for example; the resulting ordered actions may restore health, remove one named status, cleanse all removable curse-tagged statuses, and charge or grant currency. The same contract can be attached to an encounter outcome, quest completion/turn-in, event, interaction, or ordered consequence group.

V1 author-facing actions are:

| Action | Typed payload | Canonical reuse |
|---|---|---|
| Apply effect | `effect_id` | Reuse an `Effect` for Damage, Heal, Modifier, Shield, Control, Status, or another supported `EffectType` |
| Apply status | `status_id`, optional stacks/duration override | Reuse a canonical `Status`; reapplication must respect its stacking and reapplication policy |
| Remove named status | `status_id`, removal mode | Reuse a canonical `Status`; validate `can_cleanse` or `can_dispel` for the selected mode |
| Remove matching statuses | A typed filter containing exactly one or more of `status_category`, `polarity`, or `status_tag`, plus removal mode | Supports actions such as **remove all removable curses** with `status_tag = curse`; this is a validated filter, not arbitrary JSON |
| Restore resource | `effect_id` whose canonical effect is compatible with restoration | Health healing uses `EffectType.Heal`; other resources use an approved canonical Effect/Stat contract rather than an untyped numeric field |
| Grant currency | `currency_id`, positive `amount` | Reuse a canonical `Currency`; source and timing remain explicit |
| Take currency | `currency_id`, positive `amount`, insufficient-funds policy | Separate from granting so a signed amount cannot hide behavior |
| Grant item or reputation | Existing typed reward payload and timing | Reuse current reward contracts; expose them through the same composer and consequence ordering |

The exported action envelope is discriminated by `action_type`:

```text
action_id
action_type
source_ref_type
source_ref_id
target_scope          player | party | source_character | target_character | encounter_side | location | explicit_entity
target_ref_type       nullable; required where target_scope selects an explicit entity
target_ref_id         nullable; required where target_scope selects an explicit entity
timing                immediate | after_completion | on_turn_in
repeat_policy         inherit_owner | one_shot | repeatable
effect_id             nullable; required only by apply_effect/restore_resource
status_id             nullable; required only by named status actions
status_category       nullable; matching-status actions only
status_polarity       nullable; matching-status actions only
status_tag            nullable; matching-status actions only
removal_mode          nullable; cleanse | dispel | system
currency_id           nullable; currency actions only
amount                nullable; currency actions only
insufficient_policy   nullable; block | clamp_to_zero | fail_action
sort_order
runtime_support       runtime_unverified | runtime_verified
```

This is a discriminated union: each `action_type` permits and requires only its own columns. An action may not contain a loose custom payload. A genuinely new behavior remains a visible unresolved/custom draft step until its own typed fields and validation are approved.

Validation must enforce canonical references, compatible target scope, positive currency amounts, legal effect/action combinations, status removal permissions, at least one typed matching-status filter, deterministic ordering, and an explicit repeat policy or canonical owner from which it is inherited. Several actions from one choice or outcome use the existing ordered atomic consequence group. The web app authors, validates, previews, and exports these rows; it does not itself change health, statuses, inventory, currency, or other live game state.

Example:

```text
Dialogue choice: Ask the healer for treatment
  → Apply Effect: Full Heal to player
  → Remove matching Statuses: tag = curse, mode = cleanse, target = player
  → Remove Status: Poisoned, mode = cleanse, target = player

Dialogue choice: Accept the patron's gift
  → Grant Currency: 100 Gold to player
```

## Capture Draft Contract

The frontend needs a versioned intermediate representation independent of canonical schemas. A provisional TypeScript shape is:

```ts
type CreationFlowRefKind =
  | "dialogue" | "dialogue_node" | "dialogue_choice" | "encounter"
  | "quest" | "quest_objective" | "event" | "shop" | "location"
  | "location_poi" | "location_route" | "story_beat" | "item"
  | "character" | "faction" | "lore_entry" | "creature" | "effect"
  | "status" | "currency" | "stat" | "flow_step"
  | "custom";

type CreationFlowStepKind =
  | "dialogue" | "encounter" | "item_reward" | "numeric_reward"
  | "lore_reveal" | "teleport" | "scripted_moment" | "open_shop"
  | "make_available" | "quest_assignment" | "quest_turn_in"
  | "inventory_objective" | "join_companion" | "persistent_fact"
  | "activate_location_variant" | "activate_character_variant"
  | "activate_item_variant" | "world_state" | "gameplay_effect"
  | "story_placement" | "note" | "custom";

type CreationFlowRef = {
  kind: CreationFlowRefKind;
  canonicalId?: string;
  draftId?: string;
  label?: string;
};

type CreationFlowDraft = {
  format: "SOA-CREATION-FLOW/1";
  id: string;
  revision: number;
  title: string;
  shape: "sequence" | "constellation" | "hybrid";
  origin?: {
    ref: CreationFlowRef;
    subRef?: CreationFlowRef;
  };
  returnStack: CreationFlowReturnFrame[];
  entryStepId?: string;
  steps: CreationFlowStep[];
  transitions: CreationFlowTransition[];
  relations: CreationFlowRelation[];
  placeholders: CreationFlowPlaceholder[];
  localNotes: Array<{ id: string; text: string }>;
  artifactIds: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

type CreationFlowStep = {
  id: string;
  kind: CreationFlowStepKind | "unshaped";
  text: string;
  target?: CreationFlowRef;
  timing?: "immediate" | "after_completion" | "available_later" | "story_only";
  persistence?: "none" | "session" | "permanent";
  repeatPolicy?: "unspecified" | "inherit_owner" | "repeatable" | "one_shot";
  gameplayAction?: NarrativeGameplayAction;
  payload?: Record<string, unknown>;
  targetResolution: "none" | "unresolved" | "placeholder" | "canonical";
  support: "unshaped" | "unresolved" | "compilable" | "story_only" |
    "unsupported" | "runtime_unverified";
};

type NarrativeGameplayAction =
  | { actionType: "apply_effect" | "restore_resource"; effect: CreationFlowRef; target: GameplayActionTarget }
  | { actionType: "apply_status"; status: CreationFlowRef; target: GameplayActionTarget; stacks?: number; duration?: number }
  | { actionType: "remove_status"; status: CreationFlowRef; target: GameplayActionTarget; removalMode: "cleanse" | "dispel" | "system" }
  | { actionType: "remove_matching_statuses"; filter: StatusRemovalFilter; target: GameplayActionTarget; removalMode: "cleanse" | "dispel" | "system" }
  | { actionType: "grant_currency"; currency: CreationFlowRef; amount: number; target: GameplayActionTarget }
  | { actionType: "take_currency"; currency: CreationFlowRef; amount: number; target: GameplayActionTarget; insufficientPolicy: "block" | "clamp_to_zero" | "fail_action" };

type GameplayActionTarget = {
  scope: "player" | "party" | "source_character" | "target_character" |
    "encounter_side" | "location" | "explicit_entity";
  ref?: CreationFlowRef;
};

type StatusRemovalFilter = {
  statusCategory?: "Buff" | "Debuff" | "Control" | "DoT" | "Other";
  polarity?: "Beneficial" | "Harmful" | "Neutral";
  statusTag?: string;
};

type CreationFlowTransition = {
  id: string;
  fromStepId: string;
  toStepId: string;
  trigger: "complete" | "dialogue_choice" | "victory" | "interaction_closed" |
    "condition" | "fallback";
  sourceRefId?: string;
  requirementId?: string;
  sortOrder: number;
};

type CreationFlowRelation = {
  id: string;
  fromStepId: string;
  toStepId: string;
  relation: string;
  resolution: "local_intent" | "canonical" | "unsupported";
};

type CreationFlowPlaceholder = {
  id: string;
  kind: string;
  label: string;
  direction?: string;
  owningWorkspace?: string;
  promotedCanonicalId?: string;
};

type CreationFlowReturnFrame = {
  workspace: string;
  context?: CreationFlowRef;
  selectedId?: string;
  localViewState?: Record<string, unknown>;
};
```

Transitions express temporal/executable order. Relations express scoped creative association and must never be interpreted as execution order. Defeat is intentionally absent as an ordinary `toStepId` transition; an encounter step references a typed defeat policy instead. `support` is derived and revalidated against the current capability/compiler version rather than blindly trusted after loading. This is a planning and compiler input format, not automatically canonical game data. It must be versioned, migrated on load, and covered by golden fixtures.

### Draft persistence

Phase 1 should use the proven Dialogue Flow pattern:

- Immediate browser-local autosave.
- Separate local-draft and project-commit status.
- Named snapshots.
- Automatic snapshot before bulk resolution or compilation.
- Recovery after reload.
- Stable generated ids stored in `artifactIds` so repeated preview does not create different proposed records.
- Export/import of the draft JSON for recovery and test fixtures.
- Import validation that reports canonical references missing from the active project and keeps them unresolved rather than silently matching by label.
- Project-local persistence of a committed, authoring-only flow manifest containing the normalized draft, step-to-artifact provenance, accepted warnings, and the committed canonical snapshots needed for safe later review or recompilation.

Unfinished work remains browser-local in V1. Committing creates the project-local manifest in the app's SQLite project data; it is recoverable with project source data but excluded from UE/DataTable exports. A later shared work-in-progress draft service is justified only if collaboration or cross-device continuation becomes a real requirement. Browser local storage must never be described as project persistence.

## Compilation Architecture

### Compiler responsibilities

The Creation Flow compiler converts the intent draft into a proposed canonical mutation packet.

It must:

- Resolve existing entity references by immutable id.
- Preserve stable ids for every proposed new record.
- Classify each step as compilable, story-only, unresolved, unsupported, or runtime-unverified.
- Generate the minimum required state machinery.
- Reuse existing flags or requirements only after explicit confirmation when shared meaning may change.
- Create new requirements rather than mutate shared requirements by default.
- Build event payloads and linear follow-up links where honest.
- Build reward rows on the source that matches the author's timing.
- Build adventure beats/links only when story placement was requested.
- Include `expected_previous` snapshots for every changed existing record.
- Preserve step-to-artifact provenance in the committed authoring-only flow manifest so later preview can distinguish updates, additions, removals, and deliberately retained shared records.
- On recompilation, classify previously generated artifacts as still owned, changed, detached but shared, or exclusive cleanup candidates. Never delete a shared or previously committed artifact silently; cleanup is an explicit reviewed mutation with current usage evidence.
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

The reviewed V1 corpus selects Option B. Option A remains useful as an intermediate compiler phase; Option C remains a future escalation path rather than a V1 requirement.

### Option A: current-record compiler only

Compile supported intentions into existing events, `next_event_id`, rewards, flags, requirements, and story links. Keep branches and unsupported actions local.

Benefits:

- Lowest migration and runtime risk.
- Reuses current export and dependency analysis.
- Delivers immediate relief for unlocks, rewards, linear dialogue/encounter chains, and story placement.

Limits:

- Cannot honestly open a shop immediately.
- Cannot represent choice/victory transitions or an explicit defeat-policy contract.
- Cannot represent typed gameplay actions or immediate quest activation without the Option B extensions.
- Longer sequences have no canonical group identity or repeat policy.

Option A is suitable for the first capture/compile pilot, but it does not satisfy the motivating shop workflow completely.

### Option B: extend events and transitions

Selected V1 web/export direction. Author review has confirmed that immediate dialogue-to-shop and dialogue-to-encounter behavior requires typed choice actions plus outcome transitions; Workflow 3 adds ordered atomic consequence groups, reputation/rank dependencies, and linked hybrid authoring without demanding a universal executable sequence object. External runtime execution remains a separate integration concern.

Potential minimal changes:

- Add immutable ids to dialogue choices and make `next_node_id` conditionally optional when a typed action owns continuation or termination.
- Add typed, ordered dialogue-choice actions for `open_shop`, `start_encounter`, `join_companion`, and later approved action kinds.
- Store `open_shop` with a shop foreign key and `resume_source_dialogue` continuation policy. A new `Shop` event is not required for the confirmed nested-dialogue workflow.
- Define completion semantics for dialogue, encounter, reward, lore, teleport, and scripted-scene payloads, plus close/resume semantics for the nested shop choice action.
- Add a typed `event_transitions` table for dialogue-choice, victory, completion, condition, fallback, and return-context behavior.
- Store encounter defeat policy separately from ordinary follow-up transitions; defeat must not point at a normal narrative continuation in V1.
- Keep `events.next_event_id` as the compatible linear transition during migration.
- Add explicit repeat/one-shot export behavior only where no existing canonical owner already defines it.
- Add typed exported actions for companion joining and approved quest-surfacing modes rather than encoding them as flags alone.
- Add the discriminated typed gameplay-action envelope for canonical effects, status application/removal, resource restoration, currency transfer, and existing item/reputation rewards; do not force these behaviors into a generic Event payload.
- Add ordered consequence-group identity and per-action `sort_order`; one backend bundle commits the complete group atomically.

Provisional transition fields:

```text
id
from_event_id
to_event_id
trigger_type        complete | dialogue_choice | victory | interaction_closed | condition | fallback
trigger_ref_id      nullable stable choice/outcome reference
requirements_id    nullable condition
priority            deterministic branch ordering
tags                descriptive only
```

This requires stable dialogue choice identity. Current choices are JSON rows without an obvious immutable choice id, so existing choices need a one-time persisted id backfill. Array index or label must not become canonical identity. Because ids remain inside JSON in the minimal approach, backend bundle validation must enforce action/transition references; normal database foreign keys cannot point into a JSON array. Normalizing choices into their own table remains an option if later workflows require stronger relational behavior.

Benefits:

- Builds on the runtime-shaped concept already present.
- Supports the motivating immediate shop and encounter handoffs.
- Avoids a second general-purpose sequence system.

Risks:

- `Event` may become overloaded if every gameplay action is forced into it.
- Branch semantics require coordinated authoring, export, and runtime work.
- Unreal consumers still need to implement and verify the exported typed gameplay actions; the web contract remains `runtime_unverified` until then.

### Option C: first-class playable sequences

Introduce a runtime sequence/group model later only if future examples require semantics that Option B plus committed authoring manifests cannot express honestly, such as multiple runtime entries, deeply nested branching, resumable executable subflows, or group-level repeat policy owned by the game runtime.

Possible concepts:

- `playable_sequences`: identity, entry, owning context, repeat policy, requirements, tags.
- `playable_sequence_steps`: typed references to executable payloads.
- `playable_sequence_transitions`: typed completion/outcome/condition edges.

This should reference existing dialogues, encounters, shops, quests, and events rather than duplicate their payload fields.

Do not choose Option C merely because a graph looks attractive. Choose it only when the workflow and runtime semantics require a durable grouped object that Option B cannot express without distortion.

### Decision status

The third workflow closes the V1 corpus and Option B/C gate. Canonical web-schema implementation may proceed once the remaining explicit field layouts are transcribed into model/schema/export changes. Unknown Unreal execution details do not block web contracts when behavior is preserved honestly and marked `runtime_unverified`. Current status:

1. **Open external integration question:** Does the consuming runtime execute `next_event_id`, and what counts as completion? The web app may preserve/export it but must not mark it runtime-verified without that answer.
2. **Confirmed:** Dialogue choices directly select immediate shop, encounter, and companion-join actions; immutable choice identity is required.
3. **Confirmed:** Victory may continue through authored consequences. Defeat invokes a retry/load/respawn policy and is not an ordinary narrative continuation in V1.
4. **Confirmed:** An immediately opened shop is a nested interaction; closing it resumes the exact source dialogue session.
5. **Confirmed:** A pre-encounter retreat ends dialogue and restores the origin view for later re-entry. Defeat defaults to `automatic_pre_fight + retry_pre_fight`; an author may override a specific encounter with a linked respawn point. Respawn state-retention semantics remain external and runtime-unverified.
6. **Confirmed:** Several consequences after one outcome form an explicitly ordered group whose canonical mutations commit atomically. They are not alternative branches unless the author adds mutually exclusive choices/conditions.
7. **Confirmed for the web/export contract:** Quest discovery, NPC assignment, and map-marker reveal are distinct surfacing meanings. Once discovered or assigned, a quest is recorded and cannot be declined; the player may leave it undone. Tracking, hiding, notification, and journal presentation are in-game UI concerns outside this implementation.
8. **Confirmed for the web/export contract:** Narrative sources use one typed gameplay-action envelope for canonical effects, healing/resource restoration, status application/removal (including curse-tag filters), currency transfer, and existing item/reputation rewards. Runtime execution remains externally verified.
9. **Confirmed V1 shape and scope:** Locations, characters, and explicitly unique/story-artifact items use one base entity plus one active progression variant. Temporary conditions are separate; collection overrides use explicit replace/add/remove semantics; `activate_base` explicitly returns to base data.
10. **Confirmed:** Unfinished drafts are browser-local, while committed flows receive durable project-local authoring manifests with provenance. These manifests are not UE/DataTable runtime exports.
11. **Confirmed:** Historical occurrence and playable-present discovery are separate placements that may reference the same subject; neither implies runtime order.
12. **Confirmed:** Repeatability is selected per content owner/step, or inherited from an existing canonical owner, rather than supplied by one universal default.

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

Unresolved placeholders are valid during capture and draft save, but every actual placeholder in the selected flow must be resolved before canonical commit. Resolution means either linking an existing canonical record or promoting the placeholder through its owning workspace/minimal required record contract. Commit never discards a placeholder silently. If the author wants to preserve a thought without resolving it, it remains a local note or the entire flow remains an uncommitted draft.

## Timeline And World-State Policy

Timeline placement is optional unless the author wants canonical story ordering, lifecycle tracking, or coherence warnings.

When the author says **Greyhaven is damaged**, the composer must clarify which layers apply:

- **Story meaning:** add a location lifecycle link with `change_type = changed` or `destroyed` and a clear state label.
- **Persistent gameplay fact:** create/reuse state that gameplay can inspect.
- **Concrete gameplay effects:** gate routes, shops, POIs, encounters, visuals, or other real records that change.

The UI may offer all three together, but it must not imply that a story lifecycle link changes gameplay or that a flag automatically changes city visuals.

If the author has not chosen story placement, the executable sequence may still commit. The app can later suggest placement for consequential unplaced content using existing timeline warnings.

### Unified world chronology

The overall chronology is an ordered set of Timeline records, not one mandatory mega-record. Each Timeline represents an era. The last or explicitly marked current era contains the main character's playable present; earlier eras hold wars, deaths, relic states, origins, and other history.

V1 Timeline metadata should include:

```text
era_order
is_playable_present
start_year/end_year   optional where the calendar is known
```

The player does not execute the entire timeline. They inhabit one portion and can discover evidence or lore about earlier portions. Therefore the timeline must distinguish:

- **Occurred in history** — when the world event happened.
- **Discovered by the player** — when lore/evidence becomes knowable in play.
- **Played now** — when the player directly participates in the current story.
- **Runtime transition order** — immediate execution order, which is not inferred from chronological placement.

For example, “The Ashblade was forged during the War of Glass” occurs in an earlier era, while “the player learns who forged the Ashblade” is a discovery beat in the playable-present era. Both reference the same item/lore identity, but they are not the same occurrence and are not adjacent executable steps merely because the UI displays them together.

The current model splits this meaning between lore timelines, story arcs, adventure beats, events, and discovery state. V1 should export explicit historical-occurrence and discovery/play references over the ordered eras. This is data orientation and continuity support, not an in-game timeline UI requirement.

### Chapter and region mapping

- `StoryArc` is the canonical Chapter concept in V1. Author-facing copy may say **Chapter**, while ids and exports continue to reference `story_arcs`.
- A Region is a canonical location hierarchy node with `location_type = Region`, normally below a Continent and above settlements, forests, dungeons, and other places.
- Countries are not required by the current world structure.
- A place's region is its nearest Region ancestor. The existing free-text `region` field may be migrated or treated as legacy display data, but it must not compete with the hierarchy as a second canonical identity.

### Stateful location variants

The damaged-city example requires one logical place to retain continuity while presenting different state-specific content.

V1 applies one shared progression-variant rule to locations, characters, and eligible items:

- The canonical base entity is the default presentation and owns stable identity.
- At most one authored progression variant is active for that entity at a time.
- Temporary or independently combinable conditions such as a short combat status are not progression variants.
- Activating a variant is an explicit exported action/state change; story placement may describe the same transformation but does not activate it.
- **Create variant from current** copies the effective base/current presentation into a new editable variant without creating a new logical entity.
- The web app authors and exports activation and persistence intent. Applying it to a save game is external runtime work.
- Returning to the base form is explicit: `activate_variant` targets a variant id, while `activate_base` clears the active variant and restores the base entity's effective data. The consuming game selects a state because an authored action/condition requests it, not by choosing an arbitrary copy of the entity.

A provisional location-variant contract should support:

```text
logical_location_id
variant_id
state_key             intact | damaged | restored | custom
size/presentation-scale override
description_override
image/presentation override
level-range override
is_playable/is_visitable override
safe-zone/fast-travel/respawn-point overrides
shop_availability/overrides
inhabitant_presence/overrides
quest_availability/overrides
poi_additions/removals/overrides
encounter and route availability overrides
visual/presentation notes or runtime asset reference
activation condition or explicit state transition
```

The stable location name, logical id, parent hierarchy, Region/Continent membership, and map coordinates remain on the base location in V1. Teleporting or relocating a place would require a separately approved world-change contract rather than an ordinary presentation variant. Related collections use explicit add/remove/replace operations.

This is preferable to copy-pasting the city as an unrelated location because quests, lore, routes, timeline occurrences, and map identity should continue to refer to the same place.

### Event versus story beat

For state changes such as a city becoming damaged:

- An **event/action** is executable. It causes the active location variant to change in runtime and save data.
- A **story beat** is narrative chronology. It records when and why the city changed and what that moment means.

One author gesture may deliberately create both:

```text
Encounter victory
  → executable action: activate Greyhaven / damaged
  → story placement: Greyhaven changed — “After the Portal Assault”
```

The action implements the change. The beat documents it in the unified timeline. Neither replaces the other.

### Stateful character variants

Characters should normally retain one stable identity across growth, injury, changed allegiance, transformed appearance, or stronger combat stages.

A provisional character-variant contract may override:

```text
character_id
variant_id
state_key             early | later | injured | allied | hostile | transformed | custom
name/title/description/presentation overrides
level/class/combat-profile overrides
faction and interaction-role overrides
ability-set overrides
stat and attribute overrides
inventory/equipment overrides
available dialogue/quest/encounter references
activation condition or explicit state transition
```

Almost every authored presentation or gameplay-configuration field may vary for a character, including the displayed name. Stable identity remains `character_id`; home/history and occurrence links are not rewritten merely because a variant becomes active. Collection fields use explicit add/remove/replace operations.

The character's story placements record introductions and changes; an exported executable action identifies the appropriate active variant. Separate character records are reserved for genuinely distinct entities such as a clone, disguise that must be independently addressable, summoned copy, or separate historical person—not ordinary progression of the same individual.

### Stateful item variants

Legendary, custom, and other story-important items should normally retain one stable identity when they awaken, are reforged, become corrupted, are purified or restored, change ownership-relevant presentation, or gain new capabilities over time. Quests, lore, acquisition history, inventory identity, and story occurrences should continue to refer to the same artifact. V1 item variants apply to items explicitly marked unique/story-artifact and therefore describe the canonical artifact definition, not one arbitrary copy in a stack of ordinary inventory items.

A provisional item-variant contract may override:

```text
item_id
variant_id
state_key             dormant | awakened | reforged | corrupted | restored | custom
name/title/description/icon/presentation overrides
rarity override
effects override or additions/removals
stat-modifier and attribute-modifier overrides
requirements override
equipment, weapon, damage-type, range, and other explicitly supported mechanic overrides
value/currency override where the item's economy is intentionally state-dependent
activation condition or explicit state transition
```

The variant contract must define whether collection fields replace, add to, or remove from the base item; it must not rely on an ambiguous generic merge blob. **Create variant from current** should copy the active presentation and mechanics into an editable draft while preserving the underlying item identity.

An item's displayed name, icon/appearance, description, stats, attributes, effects, rarity, requirements, and other explicitly supported mechanics may change when it becomes more powerful or changes state. The stable identity remains `item_id`.

An item's story placements record discoveries and transformations; an exported executable action identifies the appropriate active item variant. Separate item records remain appropriate for genuinely distinct objects, independently ownable copies, fragments that coexist with the original, replicas, or successor artifacts—not ordinary evolution of the same unique artifact. Per-instance evolution for non-unique duplicated items is outside V1.

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
- Inventory-count objective targeting a non-item, lacking a sufficient reachable acquisition source, or using contradictory consumption/protection settings.
- Any unresolved placeholder remaining in the selected flow.
- Location variant transition without one stable logical location and valid variant.
- Item variant transition without one stable logical item, valid variant, and deterministic collection-override policy.
- Reward attached to a source that cannot grant it.
- Required flag without a producer.
- Requirement both requiring and forbidding the same state.
- Typed gameplay action with an incompatible target, wrong payload columns, invalid canonical Effect/Status/Currency reference, illegal status-removal filter, or missing repeat ownership.
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
- Every actual placeholder in the selected flow must resolve to an existing or newly promoted canonical record.
- Partial commit is off in V1. Independent resolved branches are not committed while another branch in the same flow still contains a placeholder.
- Blocking commit never deletes or drops the placeholder; the author may continue the draft, convert the thought into a non-placeholder local note, or resolve it later.
- Preview and commit use the same stable proposed ids.
- Any stale existing record rejects the whole transaction.
- Accepted warning ids are scoped to the exact compiled mutation.
- Recompiling a committed manifest shows updates and cleanup candidates separately; no generated canonical record is deleted merely because a draft step disappeared.

## Original Delivery Inventory

The following phase list is retained as the original product-scope inventory. The repository audit found that its compiler-before-contract ordering is unsafe for implementation. Use the **Audited Delivery Plan** below as the authoritative sequence.

### Phase 0: workflow corpus and semantic RFC

Deliverables:

- Collect exemplary workflows in original author language.
- Create the semantic fixture format and coverage matrix.
- Classify each desired action and transition against the current model.
- Confirm current web storage/export behavior for existing events and `next_event_id`; record runtime execution as verified or unknown separately.
- Decide the minimum useful branch/outcome semantics.
- Approve Option A, B, or C for canonical web/export expansion.
- Add Creation Flow as an active queue item in `AUTHORING_WORKSPACES_GAME_DESIGN.md` before implementation.

Exit gate:

- The motivating shop and encounter workflows have an honest end-to-end mapping.
- Every unsupported step is named rather than hand-waved.
- Completion and repeat semantics are explicit in the export contract; externally unverified behavior is labeled rather than claimed.

Workflow 3 and Author Reviews 4–5 satisfy the V1 corpus and canonical-direction portions of this gate. The remaining work is implementation-level schema/export transcription and the explicitly listed external verification items.

### Phase 1: capture-only embedded prototype

Deliverables:

- Embedded composer on dialogue choices and terminal lines.
- Embedded **Expand this place** story seed on a selected World Builder location.
- **Continue where I stopped** summary over the selected/recent place, browser-local drafts, committed manifests, unresolved placeholders, related edits, and next notes.
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

This phase may ship behind a feature flag before the confirmed Shop Now choice-action schema is implemented. The UI must label the step as not yet compilable rather than substituting a shop-unlock flag.

### Phase 3A: canonical web data and DataTable export contracts

Deliverables after the satisfied Phase 0 direction gate:

- Stable dialogue choice identity, typed ordered choice actions, optional navigation for action-owned continuation, and persisted replay-protection identity.
- Nested-shop action/export fields so closing the shop is declared to resume the source dialogue without replaying applied effects.
- Typed dialogue-choice, victory, completion, condition, fallback, and return-context transitions; defeat references a policy rather than a normal follow-up.
- Quest discovery, NPC-assignment, and map-marker actions plus the minimal `in_journal → objectives_met → turned_in` contract.
- Reward timing and turn-in mode/target fields.
- Typed current-inventory objectives for ordinary or protected items, explicit item uniqueness/protection, consumption policy, and acquisition-source validation.
- Dialogue-triggered companion-join action and exported party-membership intent.
- Typed gameplay-action rows for canonical effects, status application/removal and cleanse filters, resource restoration, currency transfer, and existing item/reputation rewards, including target, timing, ordering, and runtime-verification fields.
- Named ordered faction-reputation ranks plus traced requirements for dialogue, lore, quest, shop, and shop-inventory consumers.
- Timeline era ordering/current-playable-era metadata, StoryArc-as-Chapter authoring copy, and canonical Continent → Region → place hierarchy lookup with legacy region-field handling.
- Stateful location variants for the approved intact/damaged override set, typed character variants for progression/allegiance/presentation stages, and typed item variants for evolving legendary/custom artifacts.
- Authorable automatic pre-fight save/retry fields plus per-encounter respawn-point override and retry-entry references.
- Per-content repeat/one-shot fields, with `inherit_owner` only when an existing canonical owner already defines the behavior.
- Project-local committed-flow manifests with step/artifact provenance, schema migrations, JSON schemas, source recovery, and DataTable export preservation.

The typed gameplay-action contract is part of the web/export implementation. Its rows remain `runtime_unverified` until Unreal or another consuming runtime implements and verifies them.

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

### Phase 6: external runtime handoff and web production hardening

Deliverables:

- End-to-end exported fixtures for every supported step/transition.
- A documented consumer contract for dialogue resume, save/load, defeat policy, one-shot behavior, quest state, and variants.
- External runtime test expectations and fixture handoff; Unreal implementation itself remains outside this repository work.
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

## Audited Delivery Plan — Authoritative Implementation Order

The capture-only alpha can proceed immediately. The compiler cannot be completed safely until typed choice actions, transitions, quest state, gameplay actions, repeat policies, variants, and manifest contracts replace temporary conventions. Every phase below has a hard exit gate. A phase is complete only when its acceptance fixtures and regression tests pass and both narrative-flow documents are updated with evidence.

Critical path: `Phase 1 → (Phase 2 and Phase 3A in parallel) → Phase 4 core → Phase 5`. Phase 3B/3C can then extend the same compiler contract into Phase 6, followed by Phases 7–8. Compiler work should integrate incrementally as each Phase 3 contract lands, while its full phase gate remains closed until all required contract slices are covered.

### Phase 0: workflow corpus and product semantics — complete

Completed: three representative workflows, six author reviews, the Option B direction, explicit runtime boundaries, and confirmed author-facing semantics.

Remaining implementation action: transcribe the workflows into machine-readable golden intent fixtures during Phase 1. No additional author decision currently blocks web implementation.

### Phase 1: versioned draft kernel and capture-only alpha

Build:

- `SOA-CREATION-FLOW/1` runtime validation, normalization, forward migration, and matching JSON Schema.
- Stable step, transition, relation, placeholder, mention, and artifact identities.
- One shared browser-local storage adapter with autosave, named snapshots, recovery, import/export, and visible **Local only** status.
- Script-like sequence editing, bounded local branches, constellation relations, and hybrid promotion.
- Placeholder creation/resolution state without canonical shell records.
- **Then…** on dialogue choices/endings and **Expand this place** on a selected World Builder location.
- An initial **Continue where I stopped** packet over selection, the existing local draft inventory, recent entries, and next notes. Committed manifests join after Phase 2.
- Shared text-span/idea-card identity in the local graph; deleting one mention must not delete a still-referenced idea.
- Golden intent fixtures for Workflows 1–3 and the motivating shop/encounter chain.

Do not add canonical writes in this phase.

Exit gate:

- All three workflows capture and restore after reload without premature flags, requirements, raw ids, or schema-form choices.
- Transitions and constellation relations remain structurally and visually distinct.
- Every step is classified as supported-by-current-records, requires-new-contract, story-only, unresolved, or unsupported.
- Draft import rejects malformed versions safely and preserves missing canonical references as unresolved.

### Phase 2: transaction services and committed-flow provenance

Build:

- Extract route-local upsert, validation, stale-snapshot, warning, and review logic into reusable service operations for events, dialogue consequences, rewards, flags, requirements, and adventure placement.
- Add `creation_flow_manifests` and normalized provenance children as authoring-only project data.
- Store the normalized committed draft, compiler/schema version, accepted warnings, source snapshots, step-to-artifact ownership, and artifact disposition.
- Add source recovery for manifests while excluding them from UE/DataTable exports through `AUTHORING_ONLY_TABLES`.
- Classify artifacts as still owned, modified, detached/shared, or exclusive cleanup candidates. Cleanup remains explicit and reviewed.
- Extend resume packets with committed manifests, unresolved manifest issues, and related canonical edits.

Exit gate:

- Existing bundle tests pass through the extracted services.
- A manifest round-trips through project source recovery and never appears in a UE export.
- Reopening a committed flow explains which canonical artifact came from each step.
- No shared operation commits independently while participating in a Creation Flow transaction.

### Phase 3: canonical web and DataTable contracts

Implement three reviewable schema increments. Each includes SQLAlchemy models, JSON schemas, route validation, source fixtures/migrations, source export, UE/DataTable export where applicable, dependency indexing, project-health rules, and contract tests.

#### Phase 3A: source identity, actions, transitions, and repeat ownership

- Immutable dialogue `choice_id` and stable encounter/outcome identity.
- Ordered typed source actions with timing, target, replay-protection identity, and runtime-verification status.
- Nested `open_shop` with `resume_source_dialogue`; immediate encounter start; companion join; quest discovery/assignment; map-marker reveal.
- Typed complete, dialogue-choice, victory, interaction-closed, condition, fallback, and origin-return transitions.
- Encounter defeat policy: automatic pre-fight save plus retry-before-fight by default, optional respawn-point override, and retry-entry reference.
- Explicit owner/step repeat policy and `inherit_owner` validation.

#### Phase 3B: quest lifecycle, gameplay actions, and reputation progression

- Minimal quest lifecycle: `in_journal → objectives_met → turned_in`.
- Reward timing and turn-in mode/target.
- Typed current-inventory objectives, quest-item protection, system-controlled removal, and ordinary-item acquisition-source warnings.
- Discriminated narrative gameplay-action rows for effects, resource restoration, status application/removal/filtering, currency transfer, items, and reputation.
- Ordered atomic consequence groups.
- Arbitrary named, strictly ordered faction reputation ranks and producer/rank/consumer trace across dialogue, lore, quests, shops, and shop inventory.

#### Phase 3C: chronology, hierarchy, and stable-identity variants

- Timeline era ordering and one explicit current/playable-present era rule.
- Story Arc authoring copy as **Chapter** without a duplicate chapter table.
- Nearest-ancestor Region derivation and migration/deprecation for legacy free-text `locations.region`.
- Location, character, and unique/story-item variants with one active progression variant, `activate_base`, and validated replace/add/remove collection overrides.
- Approved override allowlists, ownership constraints, lifecycle/dependency integration, and runtime-verification status.

Exit gate for Phase 3:

- Every confirmed author behavior has an explicit typed web/export representation or is marked external/runtime-only.
- Old source data migrates without identity loss and new rows round-trip through source CSVs.
- UE exports include only runtime contracts and preserve `runtime_unverified` honestly.
- Invalid discriminators, references, ordering, ownership, cleanse/dispel operations, or variant overrides fail before commit.

### Phase 4: authoritative compiler, preview, commit, and rehearsal

Build:

- `/api/ui/creation-flow/catalog`, `/preview`, and `/bundle`.
- Capability reporting keyed by draft/compiler/schema version.
- Deterministic compilation with stable artifact ids and minimum state generation.
- Existing-record compilation for rewards, flags, scoped requirements, supported attachments, event follow-ups, and optional story placement.
- New-contract compilation for source actions, transitions, quest state, gameplay actions, rank consumers, repeat policies, and variants.
- Step-scoped blockers/warnings, story summary, implementation summary, and step-grouped `BundleReview`.
- Temporary state/sequence rehearsal with path selection, explicit assumptions, and loop/cancellation limits.
- Backend recompilation on commit, stale `expected_previous` checks, accepted-warning checks, one transaction, and manifest provenance update.

Exit gate:

- Preview leaves all touched database tables unchanged.
- Commit produces the same mutation previewed from the same draft/catalog/compiler version.
- Stale edits, unresolved placeholders, unsupported executable steps, invalid references, and required unaccepted warnings reject the entire packet.
- Re-preview is deterministic and removing a step never silently deletes a shared artifact.

### Phase 5: first complete embedded vertical slice

Ship behind a feature flag, then pilot:

- Dialogue choice/end **Then…** composer with immutable source identity.
- Immediate shop open and exact-dialogue resume.
- Immediate encounter start, retreat-to-origin, victory consequences, and defeat policy.
- Ordered reward/gameplay actions, quest surfacing, world-state/story-placement separation, and repeat ownership.
- Protected placeholder handoff to owning workspaces and restoration of originating editor state.
- Compact consequence strip and navigable implementation details in Dialogue Scene Room.

Exit gate:

- The motivating trade/weapon/portal/encounter/damaged-city/new-quest chain previews and commits as one honest packet.
- No step is represented by a semantically false unlock flag.
- Dialogue edits survive composer use, handoff, preview cancellation, and commit.
- Playwright covers keyboard capture, reload recovery, placeholder resolution, rollback preview, atomic commit, and stale rejection.

### Phase 6: world, lore, quest, and reputation vertical slices

Build:

- Full **Expand this place** constellation/hybrid surface in World Builder.
- Combined lore prose selection and idea-card gestures over one reference graph.
- Context inheritance for place/Region, present people/factions, nearby routes/POIs, story placement, and related drafts/manifests.
- Quest Journey embeds for objectives, completion, turn-in, rewards, and aftermath.
- Reputation-rank authoring and producer/consumer trace.
- Variant activation and history/discovery/play placement support.
- Complete **Continue where I stopped** over local drafts, manifests, unresolved placeholders, related edits, and the next recorded question.

Exit gate:

- Workflow 1 passes as a map-to-quest golden compile and interaction test.
- Workflow 2 passes selected-text/card identity, occurrence/discovery, antagonist package, companion recruitment, and evolving-artifact tests.
- Workflow 3 passes resume, causal relations, ordered reputation consequences, rank-gated equipment, placeholder blocker, and bounded-outcome tests.

### Phase 7: remaining embeds and standalone workspace

Build:

- Encounter victory/completion, event outcome, shop interaction, and POI/location interaction embeds where canonical ownership is defined.
- Standalone `/author/creation-flow` draft/manifest library.
- Sequence outline, scoped constellation, bounded branch topology, inspector/context dock, implementation details, issue navigation, and story/state/reward/runtime lenses.
- Rehearsal path comparison, capture-inbox promotion, catalog paging/search, and dependency-context performance controls.

Exit gate:

- Every supported host uses the same draft, compiler, capability, preview, and commit contracts.
- Large-flow performance budgets are measured and met.
- The standalone workspace adds scale and inspection without becoming a universal runtime graph editor.

### Phase 8: export handoff, production hardening, and writer evaluation

Build and verify:

- Golden DataTable fixtures and consumer documentation for every supported action/transition/state contract.
- External runtime expectations for dialogue resume, event completion, defeat policy, replay protection, repeatability, quest lifecycle, gameplay actions, and variants.
- Cross-version migrations, loop/cancellation safeguards, source recovery, deletion/recompile safety, and failure telemetry.
- Full backend, frontend unit, Playwright, build, recovery, export, and UE fixture regression suite.
- Representative writer pilot using all three workflows and the success measures below.

Exit gate:

- Every web-authored contract is runtime-verified by the consumer or visibly remains `runtime_unverified`.
- The Definition of Done is satisfied with test or pilot evidence.
- The pilot shows materially fewer context switches and less technical interruption than the current workflow.

### Phase 9: optional assisted shaping

Only after deterministic authoring proves useful: suggest step types and references, detect immediate-versus-later ambiguity, import a provider-neutral structured block, and optionally propose structure from selected text. Assistance remains local draft generation and may not silently decide canonical state or story truth.

## Open-Point Register

This is the implementation checklist. Status reflects repository evidence on 2026-07-17; **Partial** never means the phase exit gate is complete.

| ID | Status | Open point | Delivery phase | Completion evidence |
|---|---|---|---|---|
| CF-01 | **Implemented alpha** | Versioned draft IR, schema, migrations, stable identities | 1 | `creationFlow.test.ts`, schema, and W1–W3 intent fixtures |
| CF-02 | **Implemented alpha** | Autosave, snapshots, recovery, import/export, local-only labeling | 1 | Storage unit tests and dialogue reload Playwright coverage |
| CF-03 | **Partial** | Sequence, bounded branches, relations, hybrid promotion | 1 | Ordered editing and relation capture exist; bounded branch/hybrid interaction evidence remains |
| CF-04 | **Implemented locally** | Shared prose-span/idea-card identity | 1 and 6 | Mention/card lifecycle unit test and W2 expansion interaction |
| CF-05 | **Partial** | Authoring-only manifests and provenance | 2 | CRUD/recovery/UE-exclusion/cascade tests pass; compiler ownership/recompile evidence remains |
| CF-06 | **Open** | Reusable cross-domain bundle operations | 2 | Existing regressions and transaction tests |
| CF-07 | **Partial** | Stable source identity and typed actions | 3A | Stable choice/action IDs and discriminator/reference/schema tests; complete DataTable source-action contract remains |
| CF-08 | **Open** | Typed transitions, return context, defeat/retry policy | 3A | Transition and consumer-contract fixtures |
| CF-09 | **Partial** | Repeatability and replay protection | 3A | Action repeat policy, stable replay ID, order, and duplicate validation exist; owner-wide execution contract remains |
| CF-10 | **Open** | Quest lifecycle, turn-in, reward timing, inventory objectives, item protection | 3B | Quest contract and workflow tests |
| CF-11 | **Open** | Typed gameplay actions and ordered groups | 3B | Discriminator/reference/export tests |
| CF-12 | **Open** | Named reputation ranks and producer/consumer trace | 3B and 6 | W3 rank-gated equipment fixture |
| CF-13 | **Open** | Era/current era, Chapter wording, Region derivation/migration | 3C | Migration, hierarchy, chronology tests |
| CF-14 | **Open** | Location, character, and unique-item variants | 3C | Ownership/override/export tests |
| CF-15 | **Open** | Capability catalog and authoritative compiler | 4 | Determinism and classification tests |
| CF-16 | **Open** | Rollback preview, atomic commit, stale checks, cleanup safety | 4 | Transaction and recompile tests |
| CF-17 | **Open** | Rehearsal/trace without runtime overclaim | 4 | Golden trace and loop-limit tests |
| CF-18 | **Partial** | Dialogue embed and placeholder handoff | 5 | Choice/terminal capture and reload pass; reviewed compile and specialized handoff remain |
| CF-19 | **Partial** | Expand-place, resume, quest/reputation/lore flows | 6 | World expansion and local/manifest resume foundations pass; complete W1–W3 slices remain |
| CF-20 | **Open** | Remaining embeds and standalone workspace | 7 | Host contract suite and performance checks |
| CF-21 | **Open** | DataTable consumer handoff and runtime verification | 8 | Consumer fixtures/status matrix |
| CF-22 | **Open** | Writer evaluation and release evidence | 8 | Pilot report against success measures |

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
- Item variant review distinguishes logical artifact identity from its active presentation and mechanics.
- Typed gameplay-action editors expose only fields valid for the selected action and make target, timing, and repeat policy explicit.

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
- Faction-rank thresholds are strictly ordered, produce valid minimum-reputation requirements, and trace every unlocked consumer.
- Companion join actions reference a companion-capable character and valid source choice.
- Location variants cannot cross logical-location ownership.
- Item variants cannot cross logical-item ownership and must declare replace/add/remove semantics for collection overrides.
- Gameplay actions reject mismatched discriminators/payloads, invalid effect/status/currency references, incompatible targets, illegal cleanse/dispel operations, and ambiguous repeat ownership.
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
- DataTable export fixture plus external runtime-verification status.
- For Workflow 3: resume-context packet, causal constellation relations, ordered atomic reputation consequences, rank consumers, and unresolved-equipment commit blocker.

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
- Preserve typed gameplay-action intent and runtime-verification status without claiming the web app executes it in game.

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

### Risk: exported intent and runtime consumer disagree

Mitigation: make consumer semantics part of the schema RFC, maintain exported golden fixtures, and mark contracts `runtime_unverified` until an external runtime test suite confirms them.

### Risk: capture is lost because it is only browser-local

Mitigation: immediate autosave, visible local-only work-in-progress status, snapshots, export, and recovery; committing also persists an authoring-only flow manifest in project-local data.

## Definition Of Done For The First Useful Release

The first useful release is complete when:

1. An author can open **Then…** from a dialogue ending or choice and **Expand this place** from a selected World Builder location.
2. They can capture both a mixed dialogue/shop/reward/scripted-scene/encounter/quest/world-change chain and a lore-first place constellation without leaving the originating context.
3. Capture requires no flag, requirement, beat, or id knowledge.
4. The draft survives reload and clearly states that work in progress is browser-local; commit creates a durable project-local authoring manifest excluded from runtime DataTable exports.
5. The composer distinguishes immediate execution, persistent availability, and story placement.
6. Supported steps resolve existing targets or preserve local placeholders.
7. Local constellation relationships remain visibly distinct from executable transitions and compile only through honest canonical contracts.
8. Existing-model steps compile deterministically and preview through one rollback-only endpoint.
9. The motivating **open shop now** behavior has an approved choice-action and DataTable export contract, not a fake unlock substitute; the web app does not claim to execute the in-game shop handoff.
10. Supported typed gameplay actions compile into validated DataTable rows with explicit targets and remain labeled `runtime_unverified` until a consumer is verified; unknown custom effects remain visible and block executable commit.
11. One atomic review lists every created/changed record grouped by author step.
12. Stale edits and invalid references reject the entire commit safely.
13. Dialogue Flow, Progression Flow, Scoped Gate, Consequence Composer, Timeline, dependency, recovery, and export regression tests pass.
14. Representative authors complete the exemplary workflow corpus with fewer context switches and less technical interruption than the current workflow.
15. An author can resume an existing city context, update canonical city/character content, expand a causal faction story, and promote selected ideas into a mostly linear quest/reputation/shop sequence without reconstructing prior context.
16. Named faction ranks trace reputation producers to dialogue, lore, quest, shop, and equipment consumers, and all unresolved placeholders block commit without being discarded.
17. An author can create a reference/placeholder by selecting a prose span or by adding an idea card directly; both gestures produce the same linked idea identity and can later be promoted without re-entering the idea.

## Documentation Change Log

### 2026-07-17 — implementation milestone 1

- Implemented and documented the versioned local draft kernel, schema, migrations, storage/snapshots/import/export, golden intent fixtures, and honest support classification.
- Embedded shared **Then…** capture in Dialogue Flow and **Expand this place** in World Builder, including local/manifest resume foundations and prose/card identity.
- Added authoring-only manifest/provenance models, routes, recovery order, source seed headers, and UE-export exclusion tests.
- Added stable dialogue choice identity and the first validated ordered typed action slice for shop, encounter, companion, quest surfacing, and marker reveal actions. Runtime support remains explicitly unverified.
- Updated CF-01–CF-22 individually; no compiler, transition, Phase 3B/3C, standalone-workspace, consumer, or pilot work is marked complete.
- Verified 201 backend tests, 94 frontend unit tests, targeted Chromium interactions, lint, and the production build.

### 2026-07-17 — repository implementation audit and execution-plan revision

- Audited the current frontend pages, backend routes/models/schemas, local draft/recovery patterns, exports, and tests against this plan.
- Corrected the tracker so approved product semantics are not mistaken for shipped Creation Flow behavior.
- Recorded reusable foundations and partially supported canonical semantics with repository evidence.
- Confirmed the dedicated draft kernel, manifests, compiler endpoints, typed runtime/export extensions, embeds, idea graph, resume surface, standalone workspace, and Creation Flow tests are still open.
- Preserved the original product-scope phase inventory but superseded its implementation order with the audited Phase 0–9 plan.
- Added CF-01 through CF-22 as the traceable open-point register.
- Updated `NARRATIVE_CREATION_FLOW_WORKFLOWS.md` with implementation-status rules and workflow-to-plan traceability without changing the original author narratives.
- Verified the unchanged baseline: 194 backend tests and 84 frontend unit tests passed, and the production frontend build succeeded. No product code or canonical data was changed by this documentation audit.

## Remaining External Verification After Author Review 6

The V1 corpus, canonical direction, and author-facing product decisions are closed. Timeline usage, per-content repeatability, the typed gameplay-action web contract, the respawn boundary, and the combined selected-text/idea-card interaction are decided. No author clarification currently blocks web implementation.

External runtime verification still remains for:

- Whether and how the consuming runtime executes exported event transitions and determines completion.
- Which state survives the optional respawn-point override.
- Execution of typed gameplay-action exports and other contracts labeled `runtime_unverified`.

These questions affect Unreal/runtime integration and verification, not the authorized scope of the web-app implementation.

## Final Product Test

The feature succeeds when the author can think:

> They talk, then trade, then the player receives the legendary weapon, then the portal explodes, then the attackers arrive, then the fight happens, then the city is damaged, then a new quest appears.

It must also support a different creative thought:

> This city still has no story. I write about an old war; that gives me a dead hero, a cult, its boss and enemies, a dungeon, a companion, the relic they seek, an opposing faction, and the chapter where all of them first matter.

The app should first preserve either thought exactly. It should then help the author clarify the few distinctions that affect play, history, or story placement. Only afterward should it reveal the records, flags, requirements, events, rewards, transitions, relations, and story links required to implement the resolved parts honestly.
