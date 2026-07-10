# Interactive Authoring Workspaces

## Purpose

This is the single canonical design and implementation guide for interactive authoring across the web app.

It preserves two equally important layers in one place:

- **Creative north star:** the best authoring experience, including ideas that may require future metadata, schemas, or systems.
- **Honest implementation:** what the current app can save, infer, preview, and build safely today.

The goal is to make authors feel that they are arranging adventures, staging conflicts, building rewards, and writing conversations rather than maintaining database records. Current implementation constraints must shape delivery without shrinking or deleting the long-term vision.

> Preserve the ambition. Save only what the current model can represent honestly.

UX and frontend implementation standards now live in `AUTHORING_UX_FRONTEND_PLAN.md`. Keep creative goals, current-model save contracts, and workspace status here; put layout cleanup, ambiguous wording, collapsible panels, helper affordances, navigation preservation, and shared visual standards in the UX/frontend plan.

## Maintenance Contract

Every workspace must have one row in the status index and one catalog entry containing these concerns:

1. **Creative North Star:** the unrestricted authoring experience worth building toward.
2. **Current-Model Implementation:** gestures and views that map honestly to existing data.
3. **Future Expansion:** valuable concepts that need new canonical metadata or systems.
4. **Health Questions:** checks that evaluate the authored player experience.

The status index is the only place that records delivery status. When a new authoring mode is proposed, add it to the status index and give it a workspace entry immediately. Do not create a second roadmap, status list, or vision document. Update the status index and the matching workspace section in the same change.

---

## Workspace Status

Last reviewed: 2026-07-07

| Workspace | Status |
|---|---|
| World Builder | Implemented; foundation for the shared authoring language; selected-location story placement create/edit/remove, semantic location presets including introduction/state changes, canonical location story/state overlay filters, route event bindings, travel tuning, creative briefs, route/story filters, validation, and atomic world bundle saves integrated |
| Location Atlas | Implemented standalone map review mode for arranging and inspecting existing locations through `/author/locations/map` |
| Location Authoring | Implemented standalone location creation route for hierarchy, ecology, map placement, POIs, routes, encounter hooks, and validation through `/author/locations/new` |
| Character Studio And Character Web | Implemented replacement route with constellation, narrative records, Presence Trace, dedicated Character Presence Timeline in the context dock, staged preview/commit through the shared canonical bundle review, ensemble editing, character story placement create/edit/remove, semantic character presets, scoped introduction-coverage warnings, and cross-entity character consequence actions |
| Dialogue Scene Room | Implemented focused V1 with story-beat track, rehearsal, World Echo, recipes, shared canonical bundle review, graph authoring, dialogue story placement create/edit/remove, selected-dialogue presets, shared node/choice flag Consequence Composer, and explicit-target character/faction/item/location consequence actions; canonical persisted start/terminal fields are implemented, with graph enforcement and author actions still in progress |
| Encounter Stage | Implemented MVP with participant composition, shared scoped gate embed for saved encounters, rewards, location-table placement, draft restore/reset, health warnings, simulation, peer comparison, encounter story placement create/edit/remove, selected-encounter presets, shared encounter aftermath Consequence Composer, explicit-target reward/injury/faction/location consequence actions, aftermath preview, and important reward item journey warnings |
| Progression Flow And Gate Builder | Implemented MVP with linked authoring for flags, requirements, event payloads, event outcome flags, next-event links, encounter reward flags, shared Consequence Composer for saved event outcomes, shared scoped gate component extraction, gate attachment to supported `requirements_id` records, compact selected-seed flow preview, temporary flag-state walkthrough, dependency usage context, and rollback-preview/atomic-commit bundle review |
| Quest Journey Board And Quest Loom | Journey Board MVP with quest story placement create/edit/remove, semantic journey presets, visible objective state/reward trays, shared quest completion and objective flag Consequence Composer, story path objective-to-beat visualization, branch path diagnostics, temporary flag-state walkthrough, arc-order flag/item coherence warnings, and runtime-event placement window warnings; full mixed-content Quest Loom is future vision |
| Item Authoring | Implemented standalone item creation route for player-facing mechanics and presentation through `/author/items/new` |
| Item Ecosystem And Item Forge | Implemented MVP with item story placement create/edit/remove, semantic item lifecycle presets, Item Journey source/story track, estimated acquisition-source ordering from levels/locations/gates, unplaced acquisition-source warnings, same-lane requirement-before-acquisition warnings, acquisition-channel analysis, obtained-never-used warning, multiple-source explanation warning, and continuity/version guidance; future work can deepen fantasy, provenance, families, and authored transformations |
| Shop Authoring | Implemented standalone merchant-facing route for creating shops and inventory together through `/author/shops/new` |
| Creature Workshop | Implemented MVP as focused enemy creator over characters, combat profiles, encounter participants, location encounter tables, local draft restore/reset, stale-protected scoped placement changes, and optional character story placement |
| Ability Spellcraft Lab | Implemented expanded lab with trace bench, rhythm timeline, lifecycle workshop, shared effect/status clone-edit flows, local status playground, variants, relationships, Create Related Draft, contextual testing, encounter-role usage through combat-profile assignment, status defense rules, and shared rollback-preview/atomic-commit review |
| Story Timeline And Adventure Board | Interactive MVP implemented with scoped lanes, lenses, drag/drop local planning, canonical adventure beats/lifecycle-aware typed links, backend-complete tracks and query-driven focus for all ten target types, scoped lifecycle-coherence warnings, reusable frontend placement helpers, and shared preview/commit review |
| Adventure Dependency Map | Implemented MVP with actionable health groups, issue focusing, broken-edge display, inferred unlock edges, cycle detection, node/relationship metrics, explicit versus inferred relationship styling, and temporary flag-state walkthrough |

The workspace descriptions below contain both current-model implementation contracts and future-facing design. A feature is not implemented merely because it appears in this document; the status table is authoritative.

---

## Design Foundation

The World Builder and Character Studio establish the reusable pattern. The central lesson is not "use a graph" or "make forms prettier." It is:

> Give the author a canvas shaped like the decision they are trying to make.

Every specialized workspace should provide:

1. A meaningful canvas.
2. Direct creative gestures.
3. A context packet.
4. Useful lenses.
5. Contextual health questions.
6. Progressive commitment through local drafts.
7. Bundle editing when one authored idea spans several records.
8. A schema-complete escape hatch for rare fields and debugging.

### Linked Authoring Packet Pattern

The Progression Flow And Gate Builder proves a second reusable pattern beside story placement:

> When one authoring thought naturally spans several normalized records, the editor should let the author create, name, validate, preview, and commit those records together.

This pattern should be used when authors otherwise have to jump between table editors, manually copy ids or slugs, and remember that one flag, requirement, reward, event, or placement was meant to belong to another. It does not require a new canonical umbrella table by default. The packet is an authoring draft and review surface; committed changes still write the existing canonical records.

Shared rules:

- Keep the owning schema honest. A packet may only save relationships that already have real fields or link tables.
- Generate related ids and names from one base name, but treat saved references as the source of truth.
- Show existing producers, consumers, and usage counts before committing shared flags, requirements, items, rewards, and events.
- Use rollback-only preview and atomic commit for every multi-record packet.
- Style unsaved packet links as dotted local proposals until the bundle review succeeds.
- Prefer small scoped packets over a universal "everything editor."

Planned reusable packets:

| Packet | Purpose | Current-Model Writes | Primary Hosts |
|---|---|---|---|
| Scoped Gate Builder | Create or reuse flags and requirements, then attach the requirement to the current gated record | `flags`, `requirements.required_flags`, `requirements.forbidden_flags`, supported `requirements_id` fields | Progression Flow, Dialogue, Encounter, Quest, Item, Ability, Location, Route, POI, Shop |
| Consequence Composer | Describe what changes after a choice, objective, encounter, event, or story beat | Existing flag-set fields, rewards, reputation reward rows, next-event links, supported story placements | Dialogue, Encounter, Quest, Event, Character Studio, Story Timeline |
| Reward And Acquisition Composer | Put an item, currency, or reputation payoff into a real source and show the item journey impact | Quest rewards, encounter rewards, event rewards, shop inventory, combat-profile loot, POI item placement | Item Ecosystem, Quest, Encounter, Shop, Creature Workshop, Progression Flow |
| Quest Objective Flow Builder | Create an objective with its gate, completion flags, payoff, branch condition, and aftermath context | `quests.objectives`, objective requirements/flags, completion flags, rewards, story-arc branches | Quest Journey Board |
| Encounter Aftermath Builder | Author the result of an encounter as victory/defeat state, reward, story consequence, and follow-up content | Encounter rewards, reward flags, requirements, event links, story placements | Encounter Stage, Progression Flow |
| Route And POI Unlock Builder | Create a place, lock it, define what unlocks it, and preview travel/world impact | Location POIs, routes, route event bindings, requirements, event links, encounter/item/shop references | World Builder, Location Authoring, Location Atlas review |
| Shop Access And Inventory Builder | Create a merchant packet with inventory plus unlock and progression context | `shops`, `shops_inventory`, item references, supported gates and story placements | Shop Authoring, Item Ecosystem |
| Creature Deployment Package | Create an enemy-facing character, combat profile, move kit, spoils, encounter usage, and habitat placement together | `characters`, `combat_profiles`, ability assignments, loot, encounter participants, location encounter tables | Creature Workshop, Encounter Stage |
| Ability Unlock And Teaching Builder | Create an ability payload and connect how the player or an enemy obtains, learns, or demonstrates it | `abilities`, effects/statuses, requirements, combat-profile assignments, ability relations | Ability Spellcraft Lab, Creature Workshop |
| Story Beat Promotion Builder | Turn a planned beat into real dialogue, encounter, quest, event, flag, reward, and placement records where supported | `adventure_beat_links` plus owning content records and supported references | Story Timeline, Dialogue, Encounter, Quest, Progression Flow |
| Faction And Relationship Consequence Builder | Keep social consequences together where the model has real faction, reputation, relationship, or story-presence fields | Reputation rewards, faction ids on supported rows, character story beats, adventure beat links, supported flags | Dialogue, Quest, Encounter, Character Studio |
| Character Presence Change Builder | Author a character's entrance, exit, injury, capture, return, or allegiance shift with the content that causes it | Character story beats, adventure beat links, flags, dialogue/quest/encounter/event references | Character Studio, Dialogue, Encounter, Story Timeline |

Delivery order should be conservative:

1. Extract the implemented Gate Builder behavior from Progression Flow into an embeddable scoped packet. Implemented as `ScopedGateBuilder`, shared frontend helpers, and `/api/ui/scoped-gates`; first external embed is saved Encounter Stage records.
2. Extract a shared Consequence Composer for flags, rewards, reputation, next-event links, and supported story placements. Implemented as `ConsequenceComposer`, shared frontend helpers, and `/api/ui/consequences`; first embeds are Dialogue Scene Room node/choice flags, Encounter Stage aftermath, Quest Journey Board completion payoff and objective flags, Progression Flow saved event outcomes, and Story Placement cross-entity consequences.
3. Continue embedding Scoped Gate Builder and Consequence Composer first in Dialogue Scene Room, Encounter Stage, Quest Journey Board, Item Ecosystem, and World/Location authoring where the need is already visible.
4. Add specialized package builders only when the shared packets still leave repeated naming/linking work unresolved.
5. Add new canonical concepts only after the current record model can no longer express the authoring need honestly.

### Living Canvas Pattern

The World Builder is the reference implementation for a reusable living-canvas pattern. Other workspaces should adapt the pattern to their own creative decision rather than copying a geographic map literally.

1. **Canvas:** arrange authored entities in the spatial form that best expresses the decision: map, journey, stage, constellation, ecosystem, chain, or dependency graph.
2. **Navigator:** combine hierarchy, search, filtering, saved selections, and issue navigation so large projects remain usable.
3. **Lenses:** recolor, annotate, or filter the same canvas for concerns such as story, threat, rewards, progression, usage, reachability, and issues.
4. **Context Dock:** keep the selected entity's complete cross-domain packet visible without forcing the author to leave the canvas.
5. **Sketch Mode:** allow hypothetical entities, links, placements, variants, and bundles to remain local until they satisfy a real save contract.
6. **Trace Mode:** follow a player-facing route, conversation path, quest journey, acquisition path, combat proposition, or state transition through existing data.
7. **Bundle Review:** preview every canonical record and relationship affected by a creative gesture before committing it atomically.
8. **Creative Shortcuts:** create or place missing related content from the context where the need becomes visible, while preserving the target entity's real schema.

Canvas position saves only when the underlying model already owns meaningful coordinates or order. Otherwise position, grouping, comparison ghosts, traces, and proposed links remain local workspace state.

Every living-canvas application must distinguish three layers:

- **Canonical Save Gestures:** direct actions that write existing fields or relationships.
- **Local Creative Tools:** sketches, previews, traces, comparisons, overlays, and hypothetical arrangements that do not alter canonical data.
- **Future Canonical Expansion:** valuable concepts that require deliberate new metadata or systems before they can save.

### Cross-Workspace Story Placement Expansion

The Story Timeline now has lifecycle-aware `adventure_beat_links`. This is the shared story-placement contract for the other authoring workspaces.

The interaction goal is:

> Every major authoring workspace should answer **where does this matter in the story, and what changes there?**

This does not mean every workspace should display the full Story Timeline. Each specialized view should use a compact story-placement panel. The Story Timeline remains the overview and review workspace.

#### Codex Agent Starting Point

When a Codex agent is asked to continue this work, start here. Do not begin from the broader workspace fantasy sections.

**Current implementation state:**

- Shared read/derive helpers exist in `soa-editor/src/authoring/storyPlacement.ts`.
- Shared UI components exist in `soa-editor/src/components/storyPlacement/`.
- `StoryPlacementPanel` is embedded in Character Studio, Item Ecosystem, Quest Journey Board, Encounter Stage, Dialogue Scene Room, World Builder, and Creature Workshop for saved creature characters.
- The panel can show occurrences and create, edit, or remove canonical `adventure_beat_links` through `/api/ui/adventure-timeline/preview` and `/api/ui/adventure-timeline/bundle`.
- Canonical occurrences expose edit actions; inferred runtime, character-beat, and local occurrences remain read-only.
- Story Timeline deep links use `?track=...&entity=...` to select and focus matching occurrence groups for every canonical beat-link target type.
- The panel exposes lifecycle fields: role, occurrence kind, change type, state label, start/end beat, continuity group, and importance.
- `PlacementTray` exposes selected-entity semantic presets for characters, items, quests, locations, dialogues, and encounters above the unchanged generic placement roles. Presets patch the existing lifecycle fields and remain editable before preview.
- `BundleReview` provides the shared canonical review surface for Story Timeline, Story Placement, Character Studio, Dialogue Scene Room, Creature Workshop, and Ability Spellcraft. Inline and modal shells preserve workspace context while sharing change summaries, warnings, blockers, acknowledgement gates, and retryable commit errors.
- Backend coherence warnings cover scoped character introduction coverage with explicit usage evidence, character terminal/recovery order, item availability before requirements, quest start/resolution coverage, stateful dialogue in unplaced events, consequential unplaced encounters, and location restoration/state contradictions. Targeted warnings appear in both the Story Timeline issue lens and the owning workspace panel.
- The current implementation is **generic placement integration with selected-entity semantic shortcuts**. It is not yet a finished custom interaction layer for every workspace.

**Known boundaries:**

- Semantic presets write lifecycle metadata for the selected workspace entity, while Character Studio, Dialogue Scene Room, and Encounter Stage support explicit second-target consequence selection for characters, factions, items, and locations. Other cross-entity consequence actions still need workspace-specific target selection before they can save honestly.
- Lifecycle order warnings compare only canonical order inside one story-arc, timeline-level, or unassigned lane. They do not invent order across arcs or timelines. Encounter importance remains conservatively derived from canonical state/reputation/important-item consequences because encounters have no dedicated importance field.
- Backend `entity_tracks` expose canonical adventure-beat-link occurrences for locations, characters, quests, events, dialogues, encounters, lore entries, items, factions, and story arcs. The frontend composes those canonical tracks with separately inferred runtime-event, character-beat, and browser-local occurrences without treating inferred context as canonical data.

#### Next Action Queue

No active queue item. Choose the next focused task from the workspace-specific backlog unless the user asks for a specific workspace.

#### Do Not Do

- Do not build a universal graph editor.
- Do not duplicate the full Story Timeline inside every workspace.
- Do not save visual layout as canonical data unless the model already owns a real coordinate/order field.
- Do not encode lifecycle semantics in tags now that `adventure_beat_links` has real lifecycle fields.
- Do not refactor unrelated authoring views while working on story placement.
- Do not add new canonical metadata until the current `adventure_beat_links` contract is exhausted.

#### Shared Components To Build

This table is the component inventory. Prefer extending these components over creating one-off copies.

| Component | Purpose | Current Data Written Or Read | Status |
|---|---|---|---|
| `StoryPlacementPanel` | Show where the current entity appears in adventure beats and let the author create, edit, or remove canonical story placements | Reads `/api/ui/adventure-timeline`; writes, edits, and deletes `adventure_beat_links` through preview/commit | Implemented in `soa-editor/src/components/storyPlacement/StoryPlacementPanel.tsx`; embedded in Character Studio, Item Ecosystem, Quest Journey Board, Encounter Stage, Dialogue Scene Room, World Builder, and Creature Workshop for saved creature characters |
| `EntityOccurrenceTrack` | Group repeated appearances and lifecycle changes for one selected entity | Reads `entity_tracks`, runtime event links, character story beats, adventure beat attachments, and local draft attachments | Implemented in `soa-editor/src/components/storyPlacement/EntityOccurrenceTrack.tsx` |
| `PlacementTray` | Provide selected-entity semantic story actions above generic typed targets such as Setting, Cast, Runtime, State, Reward, Requirement, and Reference | Maps tray choices to `adventure_beat_links.role`, `occurrence_kind`, `change_type`, `state_label`, and `importance` | Implemented in `soa-editor/src/components/storyPlacement/PlacementTray.tsx`; data-driven presets, generic click actions, and native-drop gestures patch the panel draft before preview |
| `LifecycleFields` | Shared compact editor for occurrence kind, change type, state label, start/end beat, continuity group, and importance | Writes lifecycle fields on `adventure_beat_links` | Implemented in `soa-editor/src/components/storyPlacement/LifecycleFields.tsx` |
| `StoryContextStrip` | Small read-only strip showing nearest timeline, arc, beat, dependencies, warnings, and owning record links | Reads the Story Timeline packet and dependency index | Implemented in `soa-editor/src/components/storyPlacement/StoryContextStrip.tsx`; currently summarizes nearest moment, occurrence count, dependency count, warning count, Story Timeline link, and nearest beat/source link |
| `BundleReview` | One consistent preview/commit UI for multi-record changes | Reuses rollback-only preview and atomic commit contracts, including Ability Spellcraft preview parity | Implemented in `soa-editor/src/components/authoring/BundleReview.tsx`; used by Story Timeline, Story Placement Panel, Character Studio, Dialogue Scene Room, Creature Workshop, and Ability Spellcraft with inline or modal presentation |
| `ScopedGateBuilder` | Create/reuse flags and requirements, inspect usage, and attach one requirement to supported gated content | Reads `/api/ui/scoped-gates`; writes `flags`, `requirements`, and supported `requirements_id` attachments through preview/commit | Implemented in `soa-editor/src/components/authoring/ScopedGateBuilder.tsx`; extracted from Progression Flow, reused there, and embedded in Encounter Stage for saved encounters |
| `ConsequenceComposer` | Commit outcome state, rewards, reputation, next-event links, quest objective flags, node/choice flags, and explicit story consequences through one reviewed packet | Reads `/api/ui/consequences`; writes supported `events`, `encounters`, `quests`, `dialogue_nodes`, and `adventure_beat_links` rows through preview/commit | Implemented in `soa-editor/src/components/authoring/ConsequenceComposer.tsx`; embedded in Dialogue Scene Room, Encounter Stage, Quest Journey Board completion/objective flows, Progression Flow, and shared Story Placement cross-entity consequence actions |

Components should stay data-driven. Only specialize labels, presets, or warnings where the entity type genuinely needs a different authoring meaning.

#### Shared Data Contract

All story-placement gestures should use the same canonical link shape:

- `adventure_beat_id`: the story beat where the entity matters.
- `target_type`: `location`, `character`, `quest`, `event`, `dialogue`, `encounter`, `lore_entry`, `item`, `faction`, or `story_arc`.
- `target_id`: the selected entity.
- `role`: setting, cast, player journey, runtime, state, reward, or reference.
- `occurrence_kind`: appearance, transition, reward, requirement, consequence, or reference.
- `change_type`: introduced, active, changed, unavailable, restored, destroyed, obtained, lost, stolen, consumed, joins, leaves, captured, injured, dies, returns, transformed, or none.
- `state_label`: short author-facing state such as Ruined, Missing, Allied, Equipped, Hostile, Occupied, or Restored.
- `starts_at_beat_id` and `ends_at_beat_id`: optional duration boundaries when the state spans more than one beat.
- `continuity_group_id`: optional key for versions of the same entity, such as city-before-siege/city-ruins or sword-unawakened/sword-awakened.
- `importance`: critical, major, minor, or background.

Default behavior should be conservative:

- Dropping a location into a beat defaults to `role=setting`, `occurrence_kind=appearance`, `change_type=active`, `importance=minor`.
- Dropping a character defaults to `role=cast`, `occurrence_kind=appearance`, `change_type=active`, `importance=minor`.
- Dropping an item as a reward defaults to `role=reward`, `occurrence_kind=reward`, `change_type=obtained`, `importance=major`.
- Dropping a quest defaults to `role=player_journey`, `occurrence_kind=appearance`, `change_type=active`, `importance=major`.
- Dropping a faction defaults to `role=state`, `occurrence_kind=appearance`, `change_type=active`, `importance=minor`.

The user should be able to change these defaults before committing.

#### Workspace-Specific Backlog

This backlog gives direction after the next action queue. Do not start here unless the user asks for a specific workspace.

**Character Studio**

Add a Character Presence Timeline inside the existing context area:

Current status: implemented through the shared `StoryPlacementPanel`, `EntityOccurrenceTrack`, `StoryContextStrip`, `PlacementTray`, and `LifecycleFields`, plus a Character Presence Timeline inside the Character Studio context dock. Character Studio can show existing character occurrences, local character-story drafts, unplaced connected presence, and scoped usage evidence; create/edit/remove `character` links; apply selected-character lifecycle presets; warn when a character appears after dies/leaves/captured without a scoped recovery; warn when three or more deduplicated dialogue, encounter, event, quest, or character-story-beat usages in one lane lack an on-time canonical `introduced` or `joins` occurrence; and author cross-entity consequences against an explicit second character, faction, item, or location target. Usage evidence remains structured and order is compared only when both sides use `adventure_beats.sort_order`.

- Show appearances from adventure beats, character story beats, dialogues, encounters, events, quests, and local story-planning links.
- Highlight lifecycle states such as introduced, joins, leaves, injured, captured, dies, returns, changed, and active.
- Let the author place the character into an existing adventure beat as cast or state.
- Let the author mark major story changes directly from the character view: joins party, leaves party, captured, injured, dies, returns, faction changes, or transformed.
- Warn when a character appears after a terminal state without an explicit return/restoration.
- Warn when a character is heavily used in dialogue, encounters, events, quests, or character story beats but has no clear scoped story introduction. Implemented with a conservative three-record threshold, explicit evidence paths, and lane-local order checks.

This should make the character view answer "where is this person in the story?" without forcing the author to open the full timeline.

**Item Ecosystem And Item Forge**

Add an Item Journey Track:

Current status: substantially implemented for Item Ecosystem through the shared story-placement panel and Item Journey source/story track. It can show item lifecycle occurrences beside acquisition sources, estimate unplaced source order from existing character levels, location level ranges or sort order, and source/owner gates, mark acquisition sources whose owners lack story context, apply item lifecycle presets, warn when an important item is unplaced, required before same-lane acquisition, required while unavailable, obtained but never later used in the current story lane, transformed/restored without continuity context, or spread across multiple acquisition channels without story-placement explanation, and create/edit/remove item links as reward, requirement, state, or reference. Remaining work includes richer item fantasy/provenance and Item Forge integration if it remains separate from Item Ecosystem.

- Show where the item is introduced, obtained, lost, stolen, consumed, upgraded, transformed, restored, required, or rewarded. Implemented through the shared canonical item occurrence track and the Item Ecosystem journey track.
- Distinguish ordinary economic availability from story-important appearances. Use `importance=background` for generic shop/vendor availability so the navigator does not become noisy.
- Let the author place an item into a story beat as reward, requirement, state, or reference.
- For quest items and legendary items, encourage explicit continuity groups so changed versions are understandable. Implemented through shared lifecycle fields plus continuity/state/notes warnings for transformed or restored important items.
- Warn when an item is required before it can be obtained. Implemented with scoped canonical lane comparison and Item Ecosystem same-lane source/story ordering.
- Warn when a quest item is obtained but never used or consumed. Implemented for important items with later requirement, loss, consumption, transformation, destruction, or consequence clearing the warning.
- Warn when an important item appears in multiple acquisition sources without an intentional explanation. Implemented through Item Ecosystem acquisition-channel analysis and existing story-placement context fields.

The item workspace should become the best place to answer "how does the player get this, lose it, use it, and remember it?"

**Quest Journey Board**

Add story beat placement and state walkthrough around the existing objective flow:

Current status: implemented MVP. Quest Journey Board can show quest occurrences, create/edit/remove `quest` links, apply start/escalation/branch/resolution presets, show visible requirement/flag/reward trays, commit quest completion flags/payoff and selected objective completion flags through the shared Consequence Composer, render a Story Path panel that places ordered quest steps beside canonical quest story milestones, show arc branch rows, step through a temporary flag-state walkthrough, warn when an arc-owned quest lacks a clear scoped start or resolution placement, warn when an earlier arc quest requires a flag produced only by a later arc quest, warn when an important item is required before a later arc quest rewards it, warn when quest-connected runtime events fall before the quest start or after quest resolution in the same story lane, and locally diagnose branch targets that are missing, self/backward, outside arc order, or gated by flags first produced later. Remaining full Quest Loom work includes mixed-content beats, optional/failure paths, branch outcome Consequence Composer rollout where current fields can save honestly, and deeper branch acknowledgement checks.

- Show which adventure beats start, escalate, branch, and resolve the quest. Implemented through the Story Path panel and shared quest story placement occurrences.
- Let quest cards be placed into story beats as player journey links.
- Show requirements, flags, items, and rewards in visible trays beside the objective sequence.
- Add a temporary walkthrough mode that steps through objectives and shows expected state changes. Implemented with a local temporary player-state tray.
- Warn when quest order inside an arc conflicts with requirements, item availability, runtime event placement, or branch paths. Implemented for scoped arc flag producers, important item reward order, quest-connected runtime events outside the quest start/resolution window, and local branch path diagnostics.
- Warn when a quest belongs to an arc but has no clear starting or resolving adventure beat. Implemented through scoped backend coherence warnings in the shared story placement packet.

The goal is not just to reorder objectives. The author should see whether the quest's playable path makes sense inside the wider story.

**World Builder**

Add a Story/State Overlay for locations:

Current status: implemented for the current story/state scope. World Builder embeds the shared story-placement panel, supports location link create/edit/remove and selected-location introduction/state presets, shows canonical location occurrences from `entity_tracks.locations`, filters the map by timeline, story arc, and lifecycle state, styles locations by scoped lifecycle state, warns when a location is restored without prior disruption, preserves the destroyed/unavailable-then-active contradiction warning inside one canonical lane, and warns when a major location is heavily used in scoped events without an on-time canonical introduction.

- On a selected location, show all story occurrences and state changes from `entity_tracks.locations`.
- Use map styling for lifecycle states: introduced, active, changed, unavailable, destroyed, restored, occupied, or transformed.
- Allow placing the current location into an adventure beat as setting or state.
- Allow filtering the map by timeline, story arc, and selected lifecycle state.
- Warn when a critical location is destroyed but still appears as active later.
- Warn when a major location appears in many events but no adventure beat introduces it.

The World Builder should answer "what is happening here across the story?" while the Story Timeline answers "where does this place fit in the story order?"

**Dialogue Scene Room**

Add a Story Moment Rail beside the dialogue graph:

Current status: implemented for shared story placement and node/choice consequences. Dialogue Scene Room embeds the shared story-placement panel, derives runtime occurrences, supports dialogue link create/edit/remove and selected-dialogue runtime/lore/state presets, authors explicit character/faction/item/location consequence links through the shared Consequence Composer, commits selected saved node and choice `set_flags` through the shared Consequence Composer, and warns when a state-setting dialogue appears only through unplaced events.

- Show the adventure beat, event, quest, and character story beat context for the current dialogue.
- Let the author place the dialogue into a runtime tray on an adventure beat.
- Let the author mark dialogue consequences as state links when the scene changes a character, faction, item, or location.
- Keep flags and requirements visible as dependency context, but use story placement for author-facing narrative moments.
- Warn when dialogue sets important flags but is not placed in any story beat or event.
- Warn when a dialogue is referenced by an event but the event has no story placement.

This keeps dialogue authoring focused on conversation while still showing why the scene matters.

**Encounter Stage**

Add encounter-as-moment controls:

Current status: implemented MVP. Encounter Stage embeds the shared story-placement panel, supports encounter link create/edit/remove and selected-encounter runtime/outcome presets, derives runtime event occurrences, authors explicit-target lifecycle links for rewards/injuries/faction/location changes through the shared Consequence Composer, embeds the shared Scoped Gate Builder for saved encounters, commits saved encounter reward/flag/reputation aftermath through the shared Consequence Composer, shows an aftermath preview from draft rewards, participants, and saved same-beat story consequences, warns when an encounter with canonical state, reputation, or important-item consequences has no story placement, and warns when a story-placed encounter rewards an important item without a matching item reward/obtained placement in the same story lane. Remaining work includes broader scoped-gate rollout to other encounter subtargets where needed, richer encounter-combination authoring, missing-role handoff, and deeper tactical aftermath modeling if future canonical encounter-phase fields are added.

- Show where the encounter appears in events, locations, quests, and adventure beats.
- Let the author place the encounter into a runtime tray on an adventure beat.
- Let rewards, injured characters, defeated bosses, faction changes, or destroyed locations become lifecycle links from the encounter context.
- Show aftermath preview: flags set, items granted, characters affected, and location state changes. Implemented as a derived panel that separates draft encounter payoff from saved same-beat story consequences.
- Warn when a major encounter has no story placement.
- Warn when encounter rewards are important items but do not appear in item journey tracks. Implemented for story-placed encounters when the important item lacks a non-background reward/obtained/restored placement in the same story lane.

The Encounter Stage should answer "what changes because this fight or scene happened?"

**Ability Spellcraft Lab**

Current status: implemented expanded lab. Ability Spellcraft shows a combat sentence, editable trigger/reach/payload/scaling/cost chain, effect timing/rhythm timeline, usage lens, combat-profile assignment, encounter-role assignment through matched combat profiles, missing-profile role warnings, signature-unused warnings, target/effect conflict warnings, contextual test bench, status defense rules, ability-family relationships, and shared rollback-preview/atomic-commit review.

- Show a phase timeline: cast, travel, impact, lingering status, tick interval, upkeep, recovery, and cooldown. Implemented through the rhythm timeline and trace bench.
- Show where the ability is used: characters, combat profiles, encounters, bosses, and variants. Implemented through usage lenses, profile rows, encounter role rows, and local variants.
- Let authors drag the ability into combat profiles or encounter roles through existing relationships. Implemented through `custom_abilities` on combat profiles; encounter records remain read-only context.
- Warn when a signature ability is unused. Implemented for missing draft/persisted combat-profile assignment.
- Warn when an ability's targeting promise conflicts with linked effects or encounter usage. Implemented for ability/effect target mismatch and missing encounter-role combat profiles; deeper encounter tactical-role validation remains future work.
- For story-relevant abilities, allow optional reference placement into an adventure beat, but do not force every ability into the Story Timeline. Future work until the story-placement target contract deliberately supports abilities.

This workspace should stay about readable action design. Story placement is secondary unless the ability is narratively important.

**Creature Workshop**

Current status: implemented MVP as a focused enemy creator with direct placement tools. It edits the existing character/combat bundle, stages creature participation in existing encounters, stages those encounters into existing location encounter tables, shows habitat/encounter/spoils/ability context, uses rollback preview and atomic commit, embeds optional character story placement for saved creatures, and warns when creature combat, encounter, habitat, or boss payoff coverage is weak.

- Show habitat, encounter appearances, loot, abilities, faction, and story usage together.
- Let authors place the creature into locations, encounter tables, encounters, and adventure beats through existing records.
- Show a creature lifecycle only for named or boss-level creatures. Ordinary enemy species should use habitat and encounter usage instead.
- Warn when a creature has abilities or loot but no encounter placement.
- Warn when a boss appears in story beats but lacks a combat profile, encounter, or reward payoff.

Remaining work includes richer encounter-combination authoring, family/nearby-threat comparison, behavior-rhythm sketches, direct missing-role handoff from Encounter Stage, and deeper boss payoff checks across item journeys and story beats.

The creature workspace should not duplicate Character Studio wholesale. It should focus on "where does the enemy live, what does it do, and why does fighting it matter?"

#### Acceptance Criteria

An author view can be considered "story-placement integrated" when it satisfies all of these:

1. It shows existing story occurrences for the selected record without opening the full Story Timeline.
2. It can create a valid `adventure_beat_link` through preview/commit.
3. It exposes lifecycle fields using the shared editor.
4. It links back to the owning story beat and to the full Story Timeline.
5. It warns about at least one meaningful coherence problem for that entity type.
6. It does not save visual layout as canonical data unless the target model already owns a relevant field.

Current acceptance status for the primary six story-placement workspaces:

- Character Studio, Item Ecosystem, Quest Journey Board, Encounter Stage, Dialogue Scene Room, and World Builder satisfy criteria 1-4 through the shared panel, lifecycle fields, Story Timeline links, and preview/commit creation.
- Criterion 5 is satisfied for these six workspace panels through targeted frontend hints and scoped backend coherence warnings. Faction-specific warnings and deeper inferred/runtime-path checks remain future work.
- Criterion 6 is preserved. The shared story-placement work writes canonical `adventure_beat_links`; it does not save visual layout state as canonical data.
- Canonical links can now be edited or removed from these six workspace panels with preview/commit and stale-record protection for edits. Inferred occurrences remain read-only.
- Creature Workshop also embeds the shared panel for saved creature characters. It reuses the existing `character` target type, so it is treated as Character Studio story placement rather than a new story-placement target kind.

---

## Implementation Integrity Rules

### Save Truth, Derive Meaning

The following may be displayed as temporary or inferred authoring information:

- A quest appears to follow another quest because its requirement needs a completion flag.
- An item appears early or late because of the locations and quests that grant it.
- A character appears important because they occur in many encounters and dialogues.
- An encounter appears dangerous because of its participants and their combat profiles.
- A dialogue branch appears consequential because it sets flags used elsewhere.

These are useful readings of the existing world. They are not new saved facts.

### Visual Position Is Not Canonical Unless A Field Exists

- World Builder node position can save because locations already have coordinates.
- POI position can save because POIs already have coordinates.
- Dialogue, quest, encounter, item, and dependency-map node positions should remain local workspace state.
- Rearranging a story arc quest chain can save because `story_arcs.related_quests` is already ordered.
- Reordering quest objectives can save because `quests.objectives` is already ordered.

### Direct Gestures Must Have Honest Effects

Examples:

- Connecting two dialogue nodes adds a choice with `next_node_id`.
- Dropping an item into a quest reward tray adds an `item_rewards` row.
- Dropping an encounter onto a location adds it to a location encounter table.
- Placing a character on the hostile side of an encounter adds a participant row.
- Connecting two quests inside a story arc adds a real branch entry only when a condition flag is selected.

If a gesture cannot map honestly to current data, it may filter, compare, preview, or suggest, but it must not save.

### Local Sketches Are Allowed

Incomplete ideas may live as local drafts until they satisfy the existing save contract. This is already established by location drafts and immersive new-entry routes.

Useful draft-only information may include:

- Temporary node position.
- Uncommitted links.
- A creative prompt answer.
- A selected starter or recipe.
- A comparison shortlist.
- A hypothetical reward or participant arrangement.

---

## World Builder

### Creative North Star

The author shapes a living world by placing locations, connecting journeys, layering story and danger, and following possible player experiences through the world.

The future workspace should support player-path traces, pacing and density comparison, world-state reactions, regional identity, and cross-domain context without turning into an engine-level map editor.

### Current-Model Implementation

- Locations are visible hierarchy and atlas nodes.
- Routes are explicit selectable connections.
- Existing location coordinates and POI positions can be saved.
- Locations can be authored with POIs, encounters, route events, travel tuning, creative briefs, and validation.
- Route event bindings, travel tuning, and creative briefs are shown in the selected location or route packet rather than hidden in separate schema tables.
- Route and node filters expose story relevance, danger, fast travel, safety, and issue states.
- Ownership and deletion protections keep location-owned POIs, routes, encounter tables, route events, travel tuning, and creative briefs from being accidentally removed outside the reviewed bundle.
- Hierarchy validation rejects cycles and invalid world shapes before commit.
- Danger, story, and issue lenses reveal different readings of the same world.
- Bundle saving keeps the complete location packet coherent through atomic preview/commit.

### Living Canvas Application

- **Canonical Save Gestures:** place locations and POIs at model-backed coordinates; connect locations with routes; edit route, encounter-table, travel-tuning, and creative-brief bundles; place existing encounters and route events through their real relationship records.
- **Local Creative Tools:** layer overlays for story, danger, access, density, and issues; selection-centered context; route and location draft placement; comparison shortlists; player-path traces; hypothetical content-density and pacing readings.
- **Future Canonical Expansion:** authored regional identity, world-state variants, intended player journeys, pacing targets, and explicit promises or discoveries.

The World Builder should remain the reference example for selection-centered context, cross-domain creation shortcuts, draft-to-commit flow, and following a player experience across several record types.

### Future Expansion

- Trace complete player journeys across routes, quests, encounters, discoveries, and rewards.
- Embed a Route And POI Unlock Builder so a route, POI, event source, gate, and unlocked content can be authored as one reviewed world packet.
- Compare pacing, novelty, danger, and content density by region or route.
- Show how locations change across world states and story progress.
- Author regional themes, promises, and intended player knowledge when those concepts become canonical.

### Health Questions

- Can the player reach every important location intentionally?
- Does each region have a distinct purpose and identity?
- Are travel, danger, discovery, and reward distributed meaningfully?
- Does the world react visibly to important player actions?
- Are routes and locations supported by enough authored content?

---

## Location Atlas

### Creative North Star

The author reviews the world as a spatial atlas: where places sit, how regions read at a glance, which locations feel isolated, and whether the map expresses the intended journey.

The Atlas should stay focused on review, arrangement, and inspection. Deeper packet editing belongs in World Builder or Location Authoring.

### Current-Model Implementation

The implemented route is `/author/locations/map`. It is a standalone map-oriented entry point over existing `locations`.

- Existing location coordinates can be reviewed and arranged.
- Location hierarchy and playable-space signals can be inspected from the map context.
- The route gives authors a fast visual way to check location placement without opening the full World Builder bundle.

### Living Canvas Application

- **Canonical Save Gestures:** arrange locations only through model-backed location coordinates and open the owning location record for deeper edits.
- **Local Creative Tools:** map review, selection, scanning, and quick spatial sanity checks.
- **Future Canonical Expansion:** regional map layers, travel-density overlays, authored map annotations, and route-aware journey previews.

The Atlas must not invent canonical layout data beyond fields that `locations` already own.

### Future Expansion

- Add map layers for danger, story relevance, biome, ownership, and traversal cost.
- Show route reachability and disconnected regions directly on the atlas.
- Compare intended region identity against actual encounters, POIs, shops, and quest content.

### Health Questions

- Are important locations placed intentionally rather than clustered accidentally?
- Are playable spaces visually discoverable on the map?
- Do adjacent locations make sense as a region or journey?
- Which important locations are disconnected from route or story context?

---

## Location Authoring

### Creative North Star

The author creates a place as a playable promise: what it is, where it belongs, what the player can discover there, and how it connects to travel, encounters, and story.

The workspace should make a new location feel like a small world packet, not a blank database row.

### Current-Model Implementation

The implemented route is `/author/locations/new`. It creates a location with its current supported context.

- Location identity, hierarchy, ecology, map placement, playable-space flags, safety, travel, and encounter hooks can be authored from one route.
- POIs, routes, encounter tables, route events, travel tuning, and creative context remain grounded in their existing records.
- Draft reset behavior lets the author return to the last saved packet before committing.
- Validation keeps hierarchy and relationship shape honest before save.

### Living Canvas Application

- **Canonical Save Gestures:** create or edit the location and supported related world records through their existing fields and reviewed bundle payloads.
- **Local Creative Tools:** starter choices, draft placement, packet preview, and validation feedback before save.
- **Future Canonical Expansion:** authored location promises, discovery beats, region identity, ambient storytelling, and state variants.

Location creation should remain compatible with World Builder so a place can be authored in detail and then reviewed in the larger world context.

### Future Expansion

- Add richer starter recipes for settlement, dungeon, wilderness, route hub, safe zone, and story landmark.
- Add a compact Route And POI Unlock Builder for first-visit locks, route gates, placed encounters, discoverable items, and follow-up event hooks.
- Create a compact first-visit player trace that uses current POIs, encounters, routes, and story placements.
- Compare location identity against nearby regions and repeated content patterns.

### Health Questions

- What does the player expect to find here?
- Does the location have enough playable content for its importance?
- Is it connected to the world by routes, story, or encounter context?
- Does its level range, safety, biome, and encounter ecology agree?

---

## Character Studio And Character Web

### Creative North Star

The author creates one coherent person or creature by starting with an authored role rather than a technical record type. The selected character then sits inside a visible network of loyalties, needs, conflicts, responsibilities, secrets, locations, quests, dialogues, and encounters.

Useful starting roles include civilian, quest giver, merchant, trainer, companion, friendly combatant, standard enemy, elite enemy, and boss.

### Current-Model Implementation

- Treat character identity, combat profile, interaction profile, and encounter appearances as one creative bundle.
- Edit canonical character story profiles, directed character relationships, and ordered character story beats in the same staged bundle.
- Apply starters only to empty fields so existing work is preserved.
- Edit combat loadout, interaction role, world presence, encounter placement, narrative records, and linked context together.
- Compare the character with similar existing characters and run heuristic simulations.
- Use the Advanced Form as the schema-complete escape hatch.

### Living Canvas Application

- **Canonical Save Gestures:** edit the character, combat profile, interaction profile, story profile, directed relationships, character story beats, loadout, quest links, and encounter appearances as one reviewed bundle; place the character into existing encounters and interaction roles through their real references.
- **Local Creative Tools:** a character constellation showing locations, quests, dialogues, encounters, factions, and nearby characters inferred through shared content; role, presence, combat, and issue lenses; a presence trace following where the character appears; local relationship sketches and comparison ghosts.
- **Future Canonical Expansion:** richer relationship-state timelines, cross-character arc comparisons, authored emotional progression, and audience/player knowledge state beyond the existing story profile, relationship, and story-beat records.

The constellation must style shared-content proximity and inferred relationships as derived readings. Local relationship sketches may suggest changes to existing dialogue, quest, encounter, or placement records, but they do not create canonical relationships by themselves.

### Future Expansion

- Deepen named character-to-character relationships with richer relationship-state history.
- Add Character Presence Change and Faction/Relationship Consequence builders so entrances, exits, injuries, allegiance shifts, reputation changes, and follow-up content can be reviewed together where current fields support them.
- Extend story profiles beyond public face, private truth, want, need, fear, duty, contradiction, secret, voice, and arc summary only when new canonical fields are deliberately added.
- Deepen traces of a character's entrances, changes, reactions, and exits across the story.
- Create character constellations together to establish immediate social tension.
- Compare voice, emotional arc, and player relationship over time.

### Health Questions

- What does this character want, and what prevents them from getting it?
- What can the player change for them, and what can they change for the player?
- Do combat, interaction, dialogue, quests, and world placement express one coherent identity?
- Do they react after important events?
- If removed, what part of the world becomes less interesting?

---

## Dialogue Scene Room

### Creative North Star

The writer stages a conversation by placing lines, connecting responses, testing branches, and seeing where player choices matter.

The implemented focused V1 adds a participant-lane story-beat track, inline line writing, direct branch creation, starter recipes, full-room rehearsal, path snapshots, derived World Echo impact, participant narrative context, and previewed atomic saving of dialogue, nodes, and dialogue-linked character story beats.

### Canvas

A directed conversation map:

- Dialogue nodes are cards.
- Choices are labeled arrows.
- Automatic continuation is an unlabeled or subtly styled arrow.
- Requirements appear as locks on nodes or choices.
- Flags appear as visible consequence tokens.
- The current speaker gives each node a visual identity.

### Current-Model Implementation

The implemented MVP is available at `/author/dialogues`, `/author/dialogues/new`, and `/author/dialogues/:id`. It reads and writes only existing canonical records through `/api/ui/dialogues`, rollback-only `/api/ui/dialogues/preview`, atomic `/api/ui/dialogues/bundle`, and the shared `/api/ui/consequences` contract for selected saved node/choice flags and explicit story consequences.

| Author Gesture | Existing Data Written |
|---|---|
| Double-click empty canvas to sketch a line | New local `dialogue_nodes` draft with `dialogue_id` |
| Connect one node to another | Append a `choices` row with `next_node_id` |
| Type on a connection | Set `choice_text` |
| Drop a requirement on a node | Set node `requirements_id` |
| Drop a requirement on a connection | Set choice `requirements_id` |
| Drop a flag on a node | Append to node `set_flags` |
| Drop a flag on a connection | Append to choice `set_flags` |
| Commit selected line or choice consequences | Update saved `dialogue_nodes.set_flags` and choice `set_flags` through shared Consequence Composer preview/commit |
| Assign the conversation to a person or place | Set dialogue `character_id` or `location_id` |
| Create or edit a participant story beat | Create/update `character_story_beats` with `dialogue_id` |
| Remove a story beat from the scene | Clear the beat's `dialogue_id` without deleting the beat |

Node-to-beat grouping is local workspace state. Character-wide story-beat ordering remains canonical and is displayed but not reordered from the Dialogue Scene Room.

### Lenses

- **Player Choices:** emphasize nodes where the player chooses.
- **Consequences:** emphasize branches that set flags.
- **Locks:** show requirements and the flags or reputation they depend on.
- **Speaker Balance:** color nodes by speaker and show line counts.
- **Reachability:** show start candidates, unreachable nodes, loops, and dead ends.
- **World Impact:** reveal content elsewhere that reads flags set by this conversation.

### Play Through

Start from a chosen node and step through the conversation as the player. At each choice:

- Show available and locked responses.
- Explain why a response is locked using the linked requirement.
- Accumulate flags set along the path.
- Allow the author to restart with a different temporary flag state.

This is an authoring preview. It does not need new persistence.

### Living Canvas Application

- **Canonical Save Gestures:** create and connect dialogue nodes, edit choices, requirements, flags, owner, and location through existing dialogue fields; create missing requirements or follow-up content only through their real records and reviewed references.
- **Local Creative Tools:** consequence illumination that brightens downstream content reading a selected flag; temporary branch previews; side-by-side path comparison; speaker-presence and choice-intention overlays; rehearsal traces with temporary player state.
- **Future Canonical Expansion:** authored intentions, revelations, emotional shifts, relationship changes, knowledge state, and cross-conversation character arcs.

Preview branches and comparison paths must use dotted or translucent styling until their nodes and choices satisfy the existing save contract.

### Future Expansion

- Add speaker lanes and rehearsal views that read like an exchange rather than a graph.
- Continue scoped Gate Builder rollout for node/choice visibility and expand Consequence Composer only where current dialogue schemas can honestly save more than node/choice flags and story links.
- Author player intention, information revealed, emotional shifts, and relationship changes.
- Compare character voice, vocabulary, rhythm, and recurring concerns.
- Trace how knowledge and relationships evolve across multiple conversations.

### Context Packet

- Dialogue identity, owner, location, and requirements.
- Selected node text, speaker, choices, requirements, and flags.
- Inbound links from other dialogue nodes.
- Characters whose interaction profile opens this dialogue.
- Events that trigger this dialogue.

### Health Questions

- Which nodes cannot be reached?
- Which choices point to missing nodes?
- Where does the conversation end without an intentional ending?
- Which choices have different words but the same consequence?
- Which flags are set but never used?
- Which requirement can never be satisfied by any known flag source?
- Does one speaker dominate the conversation unintentionally?
- Does every player choice express a distinct intention?
- Does each response acknowledge what the player chose?
- Does the conversation change knowledge, relationship, emotion, or action?
- Does each speaker sound like themselves?

### Strong Starter Recipes

- Greeting with graceful exit.
- Quest briefing with accept, question, and refuse branches.
- Locked lore reveal.
- Negotiation with three differently gated approaches.
- Post-encounter reaction.

---

## Encounter Stage

### Creative North Star

The designer casts characters into a scene, assigns sides and functions, tests the threat, and decides where the scene belongs in the world.

### Canvas

A stage divided into three visible zones:

- Friendly
- Neutral
- Hostile

Characters are placed on the stage as cards. Each card shows whether it has the combat or interaction profile required by its selected contexts.

The stage is not a tactical battle map. Position inside a side is visual only.

### Current-Model Implementation

| Author Gesture | Existing Data Written |
|---|---|
| Drop a character onto a side | Append or update `encounters.participants` |
| Toggle Combat or Interaction on a character | Update participant `contexts` |
| Move a character between sides | Update participant `combat_side` |
| Drop a reward into the reward chest | Update encounter `rewards` |
| Commit encounter aftermath consequences | Update saved encounter rewards, reward flags, reputation rows, and supported story consequences through shared Consequence Composer preview/commit |
| Add an entry lock | Set encounter `requirements_id` |
| Place encounter into a location deck | Add/update a `location_encounter_tables.encounter_entries` row |
| Place encounter at a specific POI | Set `location_pois.encounter_id` |
| Put encounter in an event chain | Set `events.encounter_id` on an Encounter event |

The implemented stage also supports local draft restore/reset, encounter health warnings, threat simulation, peer comparison, story placement, shared Consequence Composer commits, and aftermath preview so participant composition, requirements, rewards, placement, and consequences can be reviewed before commit.

### Lenses

- **Threat:** participant level, combat profile, abilities, and simulation result.
- **Roles:** combat-only, interaction-only, or mixed participants.
- **Sides:** friendly, neutral, and hostile composition.
- **Rewards:** threat-to-reward comparison.
- **World Placement:** location tables, POIs, events, and routes that can trigger the encounter.
- **Issues:** missing profiles, empty sides, and invalid references.

### Encounter Pulse

Show a compact player-facing sequence derived from existing data:

1. Gate: encounter requirement.
2. Cast: participants and contexts.
3. Conflict: simulation and side balance.
4. Result: rewards, flags set, reputation changes, and affected participants.
5. Follow-up: saved same-beat story consequences and events or world content unlocked by those flags.

This does not claim to model encounter phases. It presents the real available structure as a readable dramatic pulse.

### Living Canvas Application

- **Canonical Save Gestures:** cast participants, assign sides and contexts, edit rewards and gates, and place the encounter into existing location tables, POIs, or events.
- **Local Creative Tools:** a dramatic pulse lane derived from gate, cast, conflict, result, and follow-up; aftermath preview; threat, reward, role, and world-placement overlays; variant comparison ghosts; hypothetical participant arrangements; missing-role slots that can start a local Creature Workshop draft.
- **Future Canonical Expansion:** encounter phases, stakes, environment roles, escalation, turning points, alternate resolutions, and authored tactical readability.

A missing-role slot expresses a design need such as "ranged pressure" or "non-combat witness." It remains local until the author creates a real character/combat bundle and places it into the encounter.

### Future Expansion

- Author stakes, participant wants, dramatic roles, environment, escalation, turning points, and alternate resolutions.
- Continue from the shared Consequence Composer toward a fuller Encounter Aftermath Builder only if future canonical encounter outcome fields make victory/defeat state and alternate resolutions honest to save.
- Compare normal, elite, and boss variants side by side.
- Make threat readability, attention, and player response part of encounter evaluation.
- Create creatures directly from a missing dramatic or tactical role in the encounter.

### Context Packet

- Encounter identity and description.
- Participant dossiers and profiles.
- Rewards and requirements.
- Location encounter-table placements with weights and counts.
- POIs and events that directly invoke the encounter.
- Simulation comparison against similar encounters.

### Health Questions

- Does a combat encounter have both opposition and a plausible player-aligned side?
- Does every combat participant have a combat profile?
- Does every interaction participant have an interaction profile?
- Is the encounter unused anywhere in the world?
- Is its reward weak or excessive relative to nearby encounters?
- Does it grant flags that nothing uses?
- Is it assigned to a location whose level range strongly conflicts with its threat?
- What makes the encounter memorable beyond its participant count?
- What is the player trying to protect, reach, interrupt, or learn?
- Can the player read and respond to the threat?
- Does the environment or an alternate resolution matter?

### Strong Starter Recipes

- Road ambush.
- Elite guardian.
- Neutral faction checkpoint.
- Dialogue that can become combat.
- Companion introduction.
- Boss scene with reward and completion flag.

---

## Progression Flow And Gate Builder

### Creative North Star

The designer authors a piece of progression as one connected idea: what starts it, what content resolves it, what state changes, and what becomes available afterward.

This workspace exists because events, encounters, requirements, and flags are normalized correctly for runtime but usually conceived together while authoring. The author should not have to jump between unrelated table editors, manually copy slugs, or remember whether a completion flag, gate requirement, and follow-up event were named consistently.

The workspace must stay type-flexible. Dialogue into combat is only one possible chain. A flow can involve events, encounters, dialogue, lore, item rewards, teleport, scripted scenes, route events, POIs, shops, quests, or other gated content whenever the current schema has a real reference or flag/requirement relationship for it.

### Canvas

A progression canvas shows four families of nodes:

- **Sources:** events, encounters, quests, dialogue lines, dialogue choices, POIs, route events, or other records that can start content or set state.
- **Content:** event payloads such as encounter, dialogue, item reward, lore discovery, teleport, or scripted scene, plus linked encounters and other authored content.
- **State:** flags and faction reputation changes that describe what became true.
- **Gates:** requirements that consume state and unlock later content.

The default view is a chain or small dependency cluster around the selected seed, not a whole-project graph. Solid edges are saved references or dependencies. Dashed edges are inferred from existing data. Dotted edges are local draft proposals that must pass bundle review before they become real records.

This is not a universal graph editor. It is a focused authoring surface for relationships that already have honest save contracts.

### Current-Model Implementation

The implemented MVP provides a linked-authoring workspace at `/author/progression-flow` without adding a new canonical "flow" table. The flow itself is an authoring draft and review surface; committed changes update the existing records through `/api/ui/progression-flow/preview` and `/api/ui/progression-flow/bundle`. Its gate authoring behavior has also been extracted into the shared Scoped Gate Builder, backed by `/api/ui/scoped-gates`, so other workspaces can create/reuse flags and requirements and attach supported `requirements_id` gates without duplicating Progression Flow. Saved event outcome edits can also be committed through the shared Consequence Composer backed by `/api/ui/consequences`.

| Author Gesture | Existing Data Written |
|---|---|
| Start from a shared base name | Generate local draft slugs for related records; canonical writes happen only when records are created or updated through review |
| Create a flag from a source or outcome | Create a `flags` row, make it available to the draft requirement, and optionally add its id to an event or encounter outcome field |
| Set state from an event | Update `events.flags_set` |
| Set state from an encounter outcome | Update `encounters.rewards.flags_set` |
| Set state from a dialogue line or choice | Future direct edit; current MVP reads these relationships through the dependency index but does not write dialogue-node flags from this workspace |
| Build a gate from selected flags | Create or update `requirements.required_flags` and `requirements.forbidden_flags` |
| Attach a gate to content | Set the target record's existing `requirements_id` field where the schema supports one |
| Link an event to content | Set `events.type` and the matching payload field such as `encounter_id`, `dialogue_id`, or `lore_id` |
| Link one event to the next event | Set `events.next_event_id` |
| Reuse an existing flag or requirement | Reference the existing id and show current usages before committing changes |
| Save a linked draft | Preview and atomically commit the affected events, encounters, requirements, flags, and supported payload records |

The shared **Scoped Gate Builder** supports:

1. Choose or create required flags.
2. Choose or create forbidden flags.
3. Preview all existing consumers and producers of those flags.
4. Generate or update one requirement.
5. Attach that requirement to the selected event, encounter, dialogue, route, shop, POI, item, ability, quest, or other supported gated content.

Progression Flow uses this shared component as its gate lane while keeping source/outcome event composition local to the progression workspace. Saved Encounter Stage records are the first external embed; new encounters still use their owning encounter bundle until a canonical encounter id exists.

The implemented **Source And Outcome Composer** supports:

1. Pick a source record or create a new event.
2. Pick the payload or linked content it starts.
3. Add event outcome flags and linked encounter reward flags.
4. Create or reuse a requirement from those outcome flags.
5. Link the next event or gated content that becomes available.

For already-saved events, the shared **Consequence Composer** can commit event flags, rewards, reputation rows, and `next_event_id` through the same reviewed consequence packet used by other workspaces.

The workspace also includes a compact selected-seed flow view, local health warnings, dependency-index usage context, a temporary flag-state walkthrough, and shared bundle review. Temporary state and naming helpers remain local; only reviewed record changes commit.

### Delivery Plan

1. **Scoped Gate Builder MVP:** implemented with shared flag creation, requirement creation/update from selected flags, usage preview, duplicate slug detection, supported `requirements_id` attachment, rollback-only preview, atomic commit, Progression Flow reuse, and first external embed in Encounter Stage.
2. **Event Payload Composer:** implemented for event type, payload reference, event flags, selected next event, and linked encounter reward flags.
3. **Encounter Outcome Integration:** implemented for encounters linked through event payloads, including direct editing of `encounters.rewards.flags_set`.
4. **Progression Flow MVP:** implemented as a compact selected-seed chain from source to state to gate to follow-up, backed by shared bundle review.
5. **Shared Consequence Composer:** implemented for saved event outcomes while the larger local source/gate draft remains in the Progression Flow bundle.
6. **Temporary Playthrough:** implemented as local temporary flag selection with open-gate preview. Trigger sequencing and automatic source stepping remain future work.

### Lenses

- **Flow:** event payloads, next-event links, and immediate content handoff.
- **State:** flags set, flags consumed, and faction reputation requirements.
- **Gates:** requirements, missing flags, forbidden flags, and shared requirement usage.
- **Payload:** dialogue, encounter, reward, lore, teleport, or scripted-scene details for selected events.
- **Issues:** broken references, impossible gates, unused flags, type/payload mismatch, and event loops.

### Living Canvas Application

- **Canonical Save Gestures:** create flags, create requirements, edit requirement flag rules, assign requirements to gated content, edit supported source flag-set fields, set event payload references, and connect event chains.
- **Local Creative Tools:** shared-base-name generation, dotted proposed links, small flow clusters, gate previews, temporary state playthrough, naming consistency checks, and cross-record bundle review.
- **Future Canonical Expansion:** explicit authored flow records, optional/failure branches, alternate resolutions, player knowledge state, pacing targets, and fully modeled mixed-content playable slices.

The workspace should make related names consistent by default, but the id relationships are the source of truth. Naming helpers prevent authoring mistakes; they do not replace references.

### Future Expansion

- Add reusable flow templates for common shapes such as discovery unlock, checkpoint, boss payoff, vendor unlock, optional secret, route unblock, and quest handoff.
- Extract the current Gate Builder and Source/Outcome Composer into shared embeddable packets so other workspaces can open the same workflow without loading the full progression canvas.
- Support branch comparison when the project has stronger canonical branch metadata.
- Promote local flow drafts into a future canonical flow or playable-slice model only if the project deliberately adds that concept.
- Let other workspaces open a scoped Gate Builder without loading the full progression canvas.
- Add richer reputation and variable-state handling if requirements grow beyond flags and faction thresholds.

### Context Packet

- Selected seed record and all directly connected events, encounters, requirements, and flags.
- Event payload details and next-event chain.
- Existing producers and consumers for each selected flag.
- Existing usage count for each selected requirement.
- Gated content that opens or closes under the temporary state.
- Broken, missing, shared, and cyclic references.

### Health Questions

- Does every required flag have at least one known source?
- Does every outcome flag have at least one meaningful consumer?
- Is a requirement impossible because required and forbidden state conflict?
- Is a shared requirement being edited in a way that affects unrelated content?
- Does an event's type match its payload reference?
- Does an event chain loop forever or terminate without an intentional endpoint?
- Does a linked encounter, dialogue, reward, or lore payload actually exist?
- Are generated names clear enough to understand the related records as one authored progression beat?
- Can the author explain what becomes possible after the flow resolves?

---

## Quest Journey Board And Quest Loom

### Creative North Star

The writer lays out what the player is asked to do, what each step changes, how the quest is unlocked, and what the player receives at the end.

The board must remain honest about the current model: quest objectives are an ordered list, not a fully modeled mixed-content beat graph.

The future Quest Loom should let the author weave hooks, objectives, choices, consequences, optional paths, failures, revelations, and payoffs as a player-facing journey rather than a sequence of records.

### Canvas

The main board is a horizontal journey:

- **Invitation:** quest requirement and known quest-giver links.
- **Objectives:** ordered objective cards.
- **Completion:** quest completion flags.
- **Payoff:** XP, items, currency, and reputation.
- **Aftermath:** content elsewhere unlocked by completion flags.

Story-arc context appears above the journey. Real story-arc branch relationships appear between quest cards.

### Current-Model Implementation

| Author Gesture | Existing Data Written |
|---|---|
| Add or reorder an objective card | Update ordered `quests.objectives` |
| Drop a requirement onto the invitation | Set quest `requirements_id` |
| Drop a requirement onto an objective | Set objective `requirements_id` |
| Drop a flag onto an objective | Append objective `flags_set` |
| Drop a flag onto completion | Append `flags_set_on_completion` |
| Drop an item/currency/faction into payoff | Update existing reward arrays |
| Commit completion consequences | Update completion flags, XP, item rewards, currency rewards, and reputation rewards through shared Consequence Composer preview/commit |
| Commit objective completion consequences | Update selected objective `flags_set` through shared Consequence Composer preview/commit |
| Put quest into an arc | Set `story_arc_id`; optionally append to arc `related_quests` |
| Reorder quests in an arc lane | Reorder `story_arcs.related_quests` |
| Create a real branch | Add `story_arcs.branching` entry with condition flag and next quest |
| Assign quest to a quest giver | Append to `interaction_profiles.available_quests` |

### Inferred Journey Links

The workspace may display inferred links when:

- A quest requires a flag set by another quest.
- A quest completion flag unlocks an event, dialogue, route, encounter, shop, or other quest.
- A combat or interaction profile lists the quest in `related_quests` or `available_quests`.

These links must be styled as inferred and must not be silently saved as story-arc ordering.

### Lenses

- **Unlock Logic:** requirements, flags, and branches.
- **Objective Rhythm:** objective count, gates, and flags set along the way.
- **Rewards:** compare payoff with other quests.
- **World Touchpoints:** quest givers and related characters inferred from current references.
- **Aftermath:** everything unlocked by completion flags.
- **Issues:** broken flags, impossible requirements, empty objectives, and reward gaps.

### Quest Walkthrough

Step through the quest using a temporary player-state tray:

- Check whether the quest can start.
- Complete objectives in their stored order.
- Add objective flags to temporary state.
- Apply completion flags and rewards.
- Reveal newly unlocked existing content.

This creates a useful playable design check using only current data.

### Living Canvas Application

- **Canonical Save Gestures:** reorder objectives, edit gates and flags, assign quest givers, place rewards, order quests inside a story arc, and create model-backed story-arc branches.
- **Local Creative Tools:** a horizontal playable journey with an arc skyline; objective-rhythm, reward, world-touchpoint, and issue overlays; aftermath illumination; hypothetical reward placement; path comparison; temporary player-state walkthrough.
- **Future Canonical Expansion:** mixed-content beats, optional and failure paths, explicit pacing, promises and payoffs, knowledge flow, and acknowledged consequences.

The arc skyline may combine saved arc ordering with dashed inferred flag dependencies. Hypothetical rewards and mixed-content beats remain local until translated into supported quest rewards, objectives, flags, or related records.

### Future Expansion

- Author mixed-content beats containing locations, characters, encounters, dialogue, items, and world reactions.
- Add a Quest Objective Flow Builder so an objective, its gate, completion flag, payoff, branch condition, and unlocked aftermath can be created and previewed together.
- Continue Consequence Composer rollout to branch outcomes where the current model has honest save fields; quest completion payoff and objective completion flags are implemented.
- Express optional, hidden, fail-state, irreversible, split, and rejoining paths.
- Compare knowledge flow, location journey, character presence, reward rhythm, and failure risk.
- Track explicit consequences and whether important choices are acknowledged later.

### Context Packet

- Quest identity and story arc.
- Ordered objectives and their gates/consequences.
- Quest-giver characters.
- Completion rewards and flags.
- Inferred prerequisites and unlocked aftermath.
- Related combat profiles and story-arc branch entries.

### Health Questions

- Does the quest have at least one meaningful objective?
- Are objective descriptions distinguishable and player-facing?
- Can every objective requirement become true?
- Are completion flags used anywhere?
- Does the quest have a quest giver or another discoverable entry point?
- Is the reward proportionate to the quest's objective count and gates?
- Does the story arc contain contradictory ordering and flag dependencies?
- Does the quest establish a clear hook before asking for commitment?
- Does each beat change the situation or reveal something?
- Is there meaningful escalation and payoff?
- Are choices and branches acknowledged later?
- Does the quest use the world, or could it happen anywhere?

### Strong Starter Recipes

- Investigation: discover, confront, report.
- Hunt: track, defeat, return.
- Delivery with gated destination.
- Faction choice with completion flag and reputation payoff.
- Dungeon contract with elite encounter reward.

---

## Item Authoring

### Creative North Star

The author creates an item by starting from the player-facing promise: what the item is, why the player wants it, what it changes mechanically, and how its presentation communicates that use.

This route should remain the focused forge for a single item. The broader Item Ecosystem answers where the item comes from, how often it appears, and what it does to economy and progression.

### Current-Model Implementation

The implemented route is `/author/items/new`. It creates an item through the current item schema and player-facing presentation fields.

- Item identity, category, rarity, price, presentation, effects, modifiers, requirements, and use/equipment fields can be authored through existing item data.
- Advanced fields remain available through the schema-complete authoring escape hatch.
- The created item can later be placed into shops, loot, rewards, events, POIs, and story beats through Item Ecosystem or other owning workspaces.

### Living Canvas Application

- **Canonical Save Gestures:** create or edit the item fields, effects, modifiers, prices, tags, and requirements that already exist on the item model.
- **Local Creative Tools:** starter framing, presentation checks, local comparison notes, and unsaved drafts before the item is committed.
- **Future Canonical Expansion:** item fantasy prompts, maker/owner history, family membership, set bonuses, transformation lineage, and intended progression tier.

The route should not duplicate the acquisition-source graph. It should hand off naturally to Item Ecosystem once the item needs economy, reward, source, or story placement context.

### Future Expansion

- Add starter recipes for consumable, equipment, quest item, crafting material, currency-adjacent item, and legendary artifact.
- Offer a handoff into the Reward And Acquisition Composer after creation so the item can immediately be placed into a real source, reward, gate, or story beat.
- Compare player-facing description against effects, modifiers, rarity, and price.
- Suggest source and story-placement needs after creation without saving invented provenance fields.

### Health Questions

- What player action or decision does this item enable?
- Does the item's rarity match its power, presentation, and intended scarcity?
- Do its effects, modifiers, requirements, and price support one coherent fantasy?
- Should this item immediately be placed into a source, reward, shop, POI, or story beat?

---

## Item Ecosystem And Item Forge

### Creative North Star

The designer does not merely forge an item. They decide how the player discovers it, earns it, buys it, uses it, and whether it has a meaningful place in progression.

The future Item Forge should also help define what the item promises, who made or owned it, how it belongs to the world, and when it becomes obsolete or transforms.

### Canvas

The selected item sits in the center of an ecosystem with four surrounding regions:

- **Sources:** shops, combat-profile loot, quest rewards, encounter rewards, event rewards, and POIs.
- **Power:** effects, stat modifiers, attribute modifiers, equipment identity, and requirements.
- **Economy:** base price, currencies, shop prices, and stock.
- **World Role:** quest-item use, reward frequency, tags, and locations inferred through its sources.

### Current-Model Implementation

| Author Gesture | Existing Data Written |
|---|---|
| Drop item into a shop | Add shop inventory entry |
| Drop item onto an enemy loot tray | Add combat-profile loot row |
| Drop item into quest payoff | Add quest item reward row |
| Drop item into encounter reward chest | Add encounter reward row |
| Drop item into event reward | Add event item reward row |
| Place item at a POI | Set `location_pois.item_id` |
| Attach an effect | Append item `effects` |
| Add a stat or attribute rune | Append existing modifier row |
| Add a use/equip gate | Set item `requirements_id` |

### Lenses

- **Acquisition:** every source and its location context.
- **Scarcity:** number of sources, shop stock, drop chances, and rarity.
- **Power:** simulation, effects, and modifiers.
- **Value:** price-to-power comparison and shop price previews.
- **Progression:** inferred source location levels and requirement gates.
- **Issues:** no sources, no use, invalid modifiers, and mismatched rarity/value.

### Item Journey

Show a derived player journey:

1. Earliest plausible source.
2. Gate or cost to acquire.
3. Mechanical impact.
4. Later alternative sources.
5. Places where it is rewarded repeatedly.

"Earliest" is inferred from location level ranges, quest/story-arc context, and gates. It must be labeled as an estimate.

The implemented Item Journey track shows acquisition channel count, total source count, canonical story moment count, unplaced source count, estimated source count, gated source count, source channel chips, source/story rows, scoped lifecycle labels, owner links, and source quantities such as stock, reward quantity, or drop chance. It reuses the same story-placement packet as the shared panel, so committing an item placement updates both the placement panel and journey track without a second interpretation.

The track keeps ordering honest: canonical story order wins whenever the source owner is placed, estimated ordering is labeled separately and derived only from existing levels, location context, and gates, source owners without story context remain unplaced, and same-lane requirement-before-acquisition warnings use only canonical order. Backend analysis still warns when important items appear in multiple source channels without story-placement explanation. Story Timeline coherence warns when important items are obtained without later use and when transformed or restored item versions lack continuity, state-label, or note context.

### Living Canvas Application

- **Canonical Save Gestures:** attach effects and modifiers, edit gates and economy fields, and place the item into existing shops, loot tables, rewards, events, and POIs.
- **Local Creative Tools:** a source constellation around the item; scarcity, power, value, progression, usage, and issue overlays; a progression horizon based on inferred source context; hypothetical acquisition sources; comparison ghosts; a player-facing item journey.
- **Future Canonical Expansion:** item families, ownership history, intended progression tier, transformations, world reactions, and authored replacement or restoration journeys.

The progression horizon and earliest-source reading are estimates, not saved tier assignments. A hypothetical acquisition source becomes canonical only by creating or editing the real shop, loot, reward, event, or POI relationship.

### Future Expansion

- Author item families, variants, sets, makers, ownership history, and transformations.
- Add a Reward And Acquisition Composer that can create or update shop inventory, quest rewards, encounter rewards, event rewards, combat loot, POI placement, and item gates from one item-centered packet.
- Compare the item's fantasy with its actual use and presentation.
- Trace an item's journey from rumor or discovery through use, replacement, restoration, or corruption.
- Show whether important items receive meaningful world reactions.

### Context Packet

- Existing item authoring card.
- All acquisition sources.
- Shop price previews.
- Effects and modifier details.
- Simulation comparison against same-type and same-rarity items.
- Locations and characters inferred through sources.

### Health Questions

- Can the player obtain this item anywhere?
- Is a quest item sold or dropped unintentionally?
- Does rarity agree with scarcity and power?
- Is the item substantially worse than cheaper items of the same type?
- Does it have modifiers or effects that do nothing useful?
- Is it rewarded repeatedly enough to become noise?
- Is a required currency or requirement missing?
- What fantasy does the item promise, and does its actual use fulfill it?
- Is its source memorable and believable?
- Is it meaningfully different from nearby alternatives?
- Does the world react to important items?

### Strong Starter Recipes

- Common shop weapon.
- Rare elite drop.
- Quest reward with one memorable effect.
- Discoverable lore-linked item at a POI.
- Consumable sold early and dropped by matching enemies.

---

## Shop Authoring

### Creative North Star

The author creates a merchant-facing workspace: who the shop serves, where it belongs, what it sells, and what the inventory says about the local economy and player progression.

The future workspace should make a shop feel like a curated player choice point rather than a flat inventory table.

### Current-Model Implementation

The implemented route is `/author/shops/new`. It creates a shop and its inventory together through existing `shops` and `shops_inventory` records.

- Shop identity, location context, currency assumptions, and inventory rows can be authored as one merchant packet.
- Inventory entries keep their canonical item references, quantities, prices, and stock behavior rather than becoming local-only shop cards.
- Item Ecosystem can read shop inventory as an acquisition channel for item source analysis and story-relevance warnings.

### Living Canvas Application

- **Canonical Save Gestures:** create the shop and add, edit, or remove inventory rows through existing shop and inventory records.
- **Local Creative Tools:** merchant draft framing, inventory balance review, price comparison, and source-context checks.
- **Future Canonical Expansion:** merchant personality, restock rules, regional supply, faction pricing, shop progression tiers, and curated storefront layouts.

Shop Authoring should remain the best entry point for creating a merchant packet; Item Ecosystem remains the best place to inspect what a shop does to a selected item.

### Future Expansion

- Add starter recipes for general store, blacksmith, alchemist, rare trader, faction vendor, and quest-gated merchant.
- Add a Shop Access And Inventory Builder that authors shop unlock state, stock, item source impact, faction/quest conditions, and story placement together where existing fields support them.
- Compare shop inventory against nearby location level, economy, scarcity, and item power.
- Show whether inventory accidentally leaks quest-important or late-progression items.

### Health Questions

- Does this shop belong in its location and progression band?
- Does the inventory offer meaningful choices instead of redundant items?
- Are prices, stock, and currencies coherent?
- Does the shop unintentionally sell items that should be story-gated or rare?

---

## Creature Workshop

### Creative North Star

The designer creates an enemy as a gameplay proposition:

> When this creature appears, what does the player need to notice and do?

This workspace is a focused mode of the existing Character Creator, not a new creature entity.

The future workshop should treat a creature as a promise of behavior, ecology, readability, and player response rather than only a combat profile.

### Canvas

A creature workbench with five trays:

- **Identity:** character fields and enemy tags.
- **Threat Profile:** enemy type, aggression, level, class, and custom stats.
- **Move Kit:** ordered ability cards.
- **Spoils:** loot, currencies, reputation, and XP.
- **Habitat:** home location, encounter appearances, and location encounter-table placements.

### Current-Model Implementation

| Author Gesture | Existing Data Written |
|---|---|
| Choose Standard, Elite, or Boss starter | Apply existing character tags and combat-profile defaults |
| Drop abilities into move kit | Update `combat_profiles.custom_abilities` |
| Adjust threat bars | Update character level or combat-profile custom stats |
| Drop items into spoils | Update combat-profile loot table |
| Place creature in an encounter | Update encounter participants |
| Place encounter in a habitat | Update location encounter table |
| Link creature to quests | Update combat-profile `related_quests` |

The implemented workshop also supports local draft restore/reset and stale-protected scoped encounter and habitat changes so the enemy bundle can be saved without overwriting concurrent placement edits.

### Lenses

- **Combat Identity:** ability targeting, effects, damage types, and control mix.
- **Threat:** simulation and comparison with nearby creatures.
- **Habitat:** world placement and environmental context.
- **Reward:** threat-to-spoils relationship.
- **Variety:** comparison with creatures of the same enemy type and level.
- **Issues:** no abilities, no habitat, no encounters, or boss without payoff.

### Temporary Creative Prompts

These answers guide suggestions but are not saved as new fields:

- What should the player notice first?
- What common tactic should this creature punish?
- What creates the opening to defeat it?
- What makes it belong in this habitat?
- What reward makes the fight worth remembering?

Prompt answers can generate suggested patches to existing descriptions, tags, abilities, stats, loot, encounters, and placement.

### Living Canvas Application

- **Canonical Save Gestures:** edit the character/combat bundle, arrange the real ability list, tune supported stats, edit loot, connect quests, and place the creature into existing encounters and habitats.
- **Local Creative Tools:** habitat overlays; an encounter-combination bench; behavior-rhythm sketches expressed as `Signal -> Threat -> Response Window -> Consequence -> Recovery`; creature-family and nearby-threat comparisons; local variants; direct placement previews from an Encounter Stage missing-role slot.
- **Future Canonical Expansion:** ecology, silhouette, pack role, behavior rules, readable signals, intended player lessons, and creature-family relationships.

Behavior-rhythm sketches guide descriptions, abilities, stats, and encounter placement but are not canonical AI behavior. A local variant must remain a comparison ghost until committed as a real character/combat bundle.

### Future Expansion

- Author ecology, silhouette, pack role, behavior rhythm, readable signals, and intended player lesson.
- Add a Creature Deployment Package for character, combat profile, abilities, spoils, encounter participation, location encounter-table placement, and habitat context.
- Arrange behavior as `Signal -> Threat -> Response Window -> Consequence -> Recovery`.
- Design creature families, habitat relationships, and encounter combinations.
- Evaluate reuse risk and whether repeated appearances remain interesting.

### Health Questions

- Does the creature have a distinct move kit compared with nearby enemies?
- Does it ever appear in the world?
- Is its home location compatible with its actual encounter placement?
- Is an elite or boss meaningfully stronger and more rewarding?
- Are its abilities internally redundant?
- Does its loot reinforce the creature's identity?
- Can its behavior be described in one strong sentence?
- What should the player do differently when it appears?
- Does it have a readable warning and response window?
- Why does it live here, and what other creature makes it more interesting?

---

## Ability Spellcraft Lab

### Creative North Star

The designer assembles an ability as a readable gameplay sentence:

> When this triggers, it reaches these targets, applies these effects and statuses, scales from these stats, and asks this cost from the player.

The full vision goes beyond payload construction: an ability is a promise of player expression with anticipation, timing, identity, counterplay, synergy, mastery, and a place inside a larger play style.

### Canvas

A left-to-right spellcraft chain:

1. **Trigger:** active, passive, toggle, and trigger condition.
2. **Reach:** targeting and damage-type source.
3. **Payload:** linked effect and status cards.
4. **Scaling:** stat contribution cards.
5. **Cost And Rhythm:** resource cost, cooldown, and requirements.

The ability's simulation result and player-facing description remain visible while the chain changes.

### Current-Model Implementation

| Author Gesture | Existing Data Written |
|---|---|
| Choose a trigger card | Update ability `type` and `trigger_condition` |
| Choose a targeting shape | Update ability `targeting` |
| Drop an effect into the payload | Append ability `effects` |
| Create an effect from the payload tray | Create an existing `effects` record and link it |
| Drop a stat into scaling | Append ability `scaling` row |
| Tune cost and cooldown dials | Update `resource_cost` and `cooldown` |
| Add an unlock gate | Set `requirements_id` |
| Assign ability to a creature | Append to combat-profile `custom_abilities` |
| Place an effect on the rhythm timeline | Update timed ability-effect link phase and turn offset |
| Author intent and counterplay | Update ability design metadata |
| Define status stacking, decay, cleanse, and dispel behavior | Update status lifecycle fields |
| Define profile immunity or resistance | Update combat-profile `status_rules` |
| Connect related abilities | Create an `ability_relations` row |

The implemented lab includes shared effect and status clone/edit flows, a local status lifecycle playground, relationship authoring with `Create Related Draft`, contextual test-bench comparisons, encounter-role usage through combat-profile assignment, and combat-profile status defense rules. Rollback preview and atomic commit use the shared `BundleReview` surface.

### Lenses

- **Combat Sentence:** trigger, target, payload, and scaling in one readable line.
- **Effect Mix:** damage, healing, control, status, shield, and modifier balance.
- **Efficiency:** simulated impact against cost and cooldown.
- **Usage:** characters, combat profiles, and other content that references the ability.
- **Damage Identity:** fixed, weapon-derived, and effect damage types.
- **Issues:** no effects, contradictory targeting, weak scaling, or extreme efficiency.

### Ability Test Bench

The implemented bench provides an explainable abstract-turn estimator with an impact field, scrubber, event timeline, per-effect contributions, status lifecycle events, local variants, and profile/encounter context. It explicitly does not claim exact runtime parity or simulate health, death, AI decisions, or victory.

Use the simulation to compare:

- Current draft versus similar abilities.
- Different effect combinations.
- Different resource budgets and encounter pressures.
- Ability impact when assigned to a selected combat profile.
- Defended and undefended status application.
- Local draft variants and related persisted abilities.

### Living Canvas Application

- **Canonical Save Gestures:** compose trigger, targeting, effects, scaling, cost, cooldown, gates, and combat-profile assignment through existing ability and effect records.
- **Local Creative Tools:** an impact field showing affected targets and effect mix; a rhythm timeline for cost, cooldown, and expected use; comparison ghosts; setup/payoff/recovery family sketches; contextual test benches against selected creatures, combat profiles, or encounters.
- **Future Canonical Expansion:** encounter-grounded timing windows beyond the current effect phases, movement and hazard tests, mastery progression, presentation asset pipelines, and richer family semantics beyond the existing relation types.

Contextual tests and rhythm timelines are interpretations of current simulation data. Related-family sketches that fit Setup, Payoff, Recovery, Upgrade, Counter, or Variant can save through `ability_relations`; richer family semantics remain draft-only until the project models them deliberately.

### Future Expansion

- Deepen the existing intent, counterplay, mastery, and presentation fields with opportunity, expression, impact, response, rhythm, and growth.
- Add an Ability Unlock And Teaching Builder that connects ability payload, effects/statuses, unlock gate, talent/class availability, combat-profile assignment, and demonstration encounters.
- Evaluate player decisions, readability, counterplay, synergy, presentation, and mastery.
- Test abilities inside small playable situations with movement, groups, allies, hazards, and encounter sequences.
- Extend related ability families beyond the current Setup, Payoff, Recovery, Upgrade, Counter, and Variant relation types into basic/advanced/mastery progressions or player/enemy counter-version sets.
- Keep visual language, sound identity, player-facing description, and mechanical result visible together.

### Health Questions

- Does the ability have a clear trigger, target, and payload?
- Does its target agree with the targets of its linked effects?
- Is the cost/cooldown proportionate to simulated impact?
- Is a fixed damage type missing when required?
- Does the ability duplicate an existing ability without meaningful difference?
- Is it unused by every character and combat profile?
- Can its purpose be explained without listing numbers?
- What decision, risk, timing, or setup does it ask from the player?
- Can affected players understand and respond to it?
- Does its presentation communicate the same promise as its mechanics?
- What can a skilled player do with it that a new player may not discover immediately?

### Strong Starter Recipes

- Direct strike.
- Area control spell.
- Defensive self-buff.
- Ally heal with status cleanse.
- Passive on-hit effect.
- Boss signature ability.

---

## Story Timeline And Adventure Board

### Creative North Star

The writer arranges the playable story as a clear horizontal journey, places major story beats inside arcs, and attaches the locations, cast, quests, dialogue, encounters, events, state changes, and rewards that implement each beat.

The Story Timeline answers **when does this matter?** The Adventure Dependency Map answers **what makes this possible and what changes afterward?** These are connected views of the same authored game, but they must not collapse into one unreadable graph.

The future Adventure Board should let authors assemble and evaluate a complete playable slice such as a first hour, village region, dungeon delve, faction chapter, companion recruitment arc, or full main-story spine.

### Canvas

The main canvas is a horizontally ordered story spine:

- **Timeline Bands:** world-history eras or playable-story timelines.
- **Arc Bands:** intro, main-story chapters, side arcs, faction arcs, and other authored groupings.
- **Story Beats:** placement anchors representing introductions, discoveries, decisions, conflicts, reversals, climaxes, recovery, and payoff.
- **Typed Beat Trays:** setting, cast, player journey, runtime moments, state, rewards, and references.
- **Unplaced Library:** relevant existing content that has not yet been attached to a story beat.

Semantic zoom keeps the board readable. Overview shows timelines, arcs, and major beats. Board view shows beat cards and important attachments. Detail view opens the selected beat's complete context packet.

The implemented MVP adds a **Story Navigator** above the board. It is the fast-access layer for larger projects: timeline and arc cards summarize canonical placements, local planning beats, and the selected entity track, while the Entity Occurrences panel groups repeated appearances and state changes for all ten canonical beat-link target types so the author does not have to find every instance by scrolling through timeline lanes.

### Current-Model Implementation

The current model now owns deliberate cross-domain `adventure_beats` and typed lifecycle-aware `adventure_beat_links`. The interactive workspace is available at `/author/story-timeline`; `/api/ui/adventure-timeline` remains the read aggregation contract, while rollback-only `/api/ui/adventure-timeline/preview` and atomic `/api/ui/adventure-timeline/bundle` promote reviewed local plans into canonical records.

It exposes current ordering and relationships without inventing a global sequence:

| Current Data | Timeline Reading |
|---|---|
| `timelines` and `story_arcs.timeline_id` | Timeline and arc bands |
| Ordered `story_arcs.related_quests` | Canonical quest placements inside an arc lane |
| `character_story_beats.sort_order` | Canonical ordering inside a character-presence lane |
| Character story-beat source references | Existing content attached to a character beat |
| `events.next_event_id` and event content references | Runtime event chains and implementation attachments |
| Dependency index edges | Explicit and inferred prerequisite, state, branch, and unlock context |
| `adventure_beats.sort_order` | Canonical beat order inside an arc, timeline, or unassigned planning scope |
| Typed `adventure_beat_links` | Canonical setting, cast, player-journey, runtime, state, reward, and reference attachments with occurrence kind, change type, state label, continuity group, and importance |
| Canonical `entity_tracks`, inferred event attachments, character story beats, and local beat attachments | Grouped Entity Occurrences in the Story Navigator, with canonical and inferred sources kept distinct |

The aggregator explicitly separates canonical placements, runtime event chains, unplaced content, and inferred dependency relationships. It does not save visual positions or claim that current records form one canonical player path.

### Lenses

- **Story:** arcs, major beats, introductions, escalations, and payoffs.
- **Cast:** character entrances, presence, decisions, reactions, and exits.
- **Locations:** where beats happen and when important places first become relevant.
- **Quests:** ordered arc quests, objectives, entry points, and aftermath.
- **Runtime:** events, dialogue, encounters, and implementation coverage.
- **State:** requirements, flags, branches, and unlocks.
- **Issues:** contradictory placement, missing implementation, broken references, and unplaced important content.

### How To Use The Implemented MVP

1. Open `/author/story-timeline`.
2. Use **Story Navigator** to choose the timeline or arc you want to inspect. This avoids treating the horizontal card rows as the only navigation mechanism.
3. Use **Entity Occurrences** to switch between locations, characters, quests, events, dialogues, encounters, lore entries, important items, factions, and story arcs. Each row groups every currently known occurrence and shows the first beat or runtime event where the entity appears or changes state.
4. Use the lens buttons to reduce the board to the question you are asking:
   - **Locations** for where story beats happen.
   - **Runtime** for event/dialogue/encounter implementation.
   - **State** for flags, requirements, rewards, and dependency context.
   - **Issues** for coherence warnings.
5. Drag content from the library onto an arc lane to create a local planning beat, or onto an existing local planning beat to attach it.
6. Select a beat or placement to inspect its context dock and open the owning record.
7. Use **Review & Commit Plan** to validate the local plan, then **Commit Plan** to persist canonical `adventure_beats` and `adventure_beat_links`.

Local planning beats remain browser-local until committed. Committing creates story intent and typed links; it does not rewrite the attached locations, quests, events, dialogue, encounters, characters, items, or factions.

### Current Lifecycle Support

The MVP can show where locations, characters, important items, quests, and factions appear, and it can attach deliberate lifecycle metadata to canonical beat links:

- `occurrence_kind` for appearance, transition, reward, requirement, consequence, or reference.
- `change_type` for introduced, active, changed, unavailable, restored, destroyed, obtained, lost, consumed, joins, leaves, dies, returns, transformed, and related states.
- `state_label` for readable authoring labels such as Ruined, Missing, Allied, Equipped, or Restored.
- `starts_at_beat_id`, `ends_at_beat_id`, and `continuity_group_id` for duration and version tracking.
- `importance` so ordinary background mentions do not dominate the overview.

The current canvas can create local planning links and commit them with sensible lifecycle defaults. Direct in-place editing of already-canonical beat links on the Story Timeline canvas, richer duration visualization, and path comparison remain future workflow work; canonical links can be edited from the selected entity's shared Story Placement panel.

### Living Canvas Application

- **Canonical Save Gestures:** review and commit local planning beats as one atomic `adventure_beats` and `adventure_beat_links` bundle. Existing arc quest order and character story-beat order remain editable through their owning workspaces.
- **Local Creative Tools:** drag existing content into proposed beat trays; move hypothetical story beats; focus by arc, location, character, item, quest, faction, or issue; preview dependency context; frame a playable slice.
- **Future Canonical Expansion:** direct canonical beat reordering/editing, richer entity-track editing, playable-story timeline kinds, optional and failure paths, pacing targets, promises, payoffs, and knowledge state.

Story Timeline arrangements remain local planning state until the author reviews and commits them. Commit creates canonical adventure beats and typed links without rewriting the linked records.

### Future Expansion

- Add direct editing and reordering of already-canonical `adventure_beats` and `adventure_beat_links` on the canvas.
- Add richer visual duration lanes for entity tracks so destroyed, transformed, unavailable, restored, and replaced states can be scanned at a glance.
- Drag locations, characters, quests, events, dialogue, encounters, lore, and rewards onto typed beat trays.
- Compare critical, optional, completionist, and failure-aware story paths.
- Evaluate pacing, content density, novelty, recovery, promises, payoffs, and implementation coverage.
- Step through a playable slice while watching state, character presence, world access, and available content change.

### Context Packet

- Selected timeline, arc, and neighboring placements.
- Beat intent, summary, and current implementation source.
- Attached or nearby locations, characters, quests, events, dialogue, encounters, lore, and rewards.
- Required, forbidden, expected, and actually implemented state changes.
- Explicit and inferred dependency relationships.
- Unplaced related content and coherence warnings.

### Health Questions

- Does every major beat have a clear dramatic or player-facing purpose?
- Are important locations and characters introduced before they become essential?
- Are arc quests ordered coherently relative to their gates and consequences?
- Do authored character beats agree with the wider story context?
- Are important runtime events attached to an understandable story moment?
- Does each arc establish, escalate, and resolve something?
- Are important promises paid off later?
- Is relevant content unplaced, duplicated, contradictory, or missing implementation?

---

## Adventure Dependency Map

### Creative North Star

The designer sees what changes the world: which flags are produced, which content consumes them, and where the player's journey can become blocked.

This is the cross-domain workspace that current schemas support most honestly. It should not pretend to be a complete narrative timeline.

The Story Timeline and Adventure Board provide the ordered playable-slice view. This workspace remains the causal and state-focused companion.

### Canvas

A graph with real dependency roles:

- **Sources:** quests, objectives, events, encounters, dialogue nodes, dialogue choices, and interactions that set flags.
- **State:** flags and faction reputation.
- **Gates:** requirements.
- **Consumers:** quests, events, dialogues, encounters, routes, shops, POIs, items, abilities, story arcs, and objectives.

The author can focus on one flag, requirement, quest, or story arc and expand outward.

### Current-Model Implementation

| Author Gesture | Existing Data Written |
|---|---|
| Connect a source to a flag | Add the flag to that source's existing flag-set field |
| Connect a requirement to a flag | Add to requirement `required_flags` |
| Mark a flag as forbidden by a requirement | Add to requirement `forbidden_flags` |
| Connect a requirement to gated content | Set that content's `requirements_id` |
| Connect event to next event | Set `next_event_id` |
| Connect a story-arc branch | Update existing branch structure |

The implemented map currently exposes actionable health groups, issue focusing, broken-edge display, node and relationship metrics, inferred unlock edges, cycle detection, and explicit versus inferred edge styling. It is an inspection and diagnosis workspace first; direct graph editing remains limited to relationships that already have honest save contracts.

### Lenses

- **Dead State:** flags that are set but never read.
- **Impossible Gates:** required flags with no known source.
- **Contradictions:** requirements that both require and forbid the same flag.
- **Circularity:** event and inferred quest dependency loops.
- **World Access:** routes, shops, POIs, and locations affected by requirements.
- **Narrative Impact:** quests, dialogues, events, and arcs affected by state.

### State Walkthrough

Begin with an empty temporary state, trigger existing sources, and watch available content change. This provides a simple, playable model of narrative progression without creating any new canonical sequence.

The implemented V1 walkthrough starts from selected temporary flags, triggers existing flag-setting sources, and shows flags gained, newly available gated content, and still-blocked gates without creating a canonical player path. Deeper flood-fill, path comparison, and reputation-aware walkthroughs remain future work.

### Living Canvas Application

- **Canonical Save Gestures:** connect supported sources to flags, edit requirement flag rules, assign requirements to gated content, connect event chains, and create supported story-arc branches.
- **Local Creative Tools:** reachable-state illumination; state flood-fill walkthroughs; dead-state, impossible-gate, world-access, narrative-impact, and issue overlays; hypothetical dependency links; path comparison; playable-slice framing around a selected region, arc, or objective.
- **Future Canonical Expansion:** authored cross-domain sequences, explicit playable slices, knowledge state, pacing targets, promises, payoffs, and canonical player paths.

Hypothetical links and playable-slice framing remain dotted local planning objects. They become canonical only when translated into supported flags, requirements, event links, story-arc branches, or other real relationships.

### Future Expansion

- Arrange world journey, main story, optional discoveries, characters, encounters, rewards, knowledge, and recovery into one playable-slice view.
- Hand focused dependency repairs to Progression Flow, scoped Gate Builder, or the owning workspace packet instead of turning the Dependency Map into a universal editor.
- Compare first-time, completionist, and critical player paths.
- Evaluate pacing, content density, novelty, repetition, promises, and payoffs.
- Author a canonical cross-domain sequence only if the project deliberately models that concept.

### Health Questions

- Which flags have no source?
- Which flags have no consumer?
- Which requirements are impossible or contradictory?
- Which event chains loop forever or point to missing events?
- Which story-arc branch conditions can never occur?
- Which major rewards or routes are gated by obscure, unreachable state?
- Does the playable slice have a clear reason to begin and a satisfying ending?
- Does the player alternate between action, decision, discovery, and recovery?
- Are new concepts introduced before they are tested?
- Are optional discoveries worth the detour?
- Does the climax resolve something established earlier?

---

## Shared Interaction Language

Every workspace should reuse the same authoring verbs:

- **Sketch:** create an incomplete local draft.
- **Compose:** create or update a small packet of related records that belong to one authoring decision.
- **Place:** add an existing entity to an existing relationship.
- **Place In Story:** attach an existing entity to an `adventure_beat` through a lifecycle-aware `adventure_beat_link`.
- **Connect:** create a real reference or dependency.
- **Arrange:** reorder only when order is canonical; otherwise change local visual layout.
- **Inspect:** open a complete context packet.
- **Compare:** place similar content side by side.
- **Trace:** follow references and dependencies.
- **Track:** follow repeated appearances or lifecycle changes for one entity across story beats and implementation records.
- **Play Through:** step through a temporary interpretation of the existing data.
- **Focus Lens:** reveal one design concern.
- **Commit:** preview and atomically save the affected existing records.

### Shared Visual Grammar

- Solid connection: explicit saved relationship.
- Dashed connection: inferred relationship.
- Dotted connection: local draft or proposed change.
- Lock badge: requirement gate.
- Flag token: state set or consumed.
- Chest/tray: reward payload.
- Story tray: lifecycle-aware placement into an adventure beat.
- Timeline chip: existing story placement or entity occurrence.
- Amber issue: incomplete or suspicious.
- Red issue: broken or impossible.

### Shared Bundle Review

Before saving a multi-record gesture, show:

- Records that will be created.
- Records that will be changed.
- Exact relationships that will be added or removed.
- Validation blockers.
- Warnings that are allowed but worth reviewing.

This follows the safety model already established by character and world-builder bundle endpoints.

---

## Current-Model Boundaries

The following are creatively valuable but cannot become canonical with the current model:

- Character psychology or relationship semantics beyond the existing story profile, relationship, and character story-beat fields.
- Encounter phases and alternate resolutions.
- Quest failure paths and optional mixed-content beats.
- Explicit dramatic pacing.
- Creature ecology rules and behavior rhythms.
- Item ownership history and intended progression tier.
- A canonical full-game player path.
- Cross-domain promises, payoffs, emotional shifts, and player knowledge when no explicit field already exists.

They may appear as prompts, inferred views, local planning notes, or generated suggestions. They should not be written into unrelated fields or encoded through fragile tag conventions. If the project later models one of these concepts deliberately, update the relevant workspace's current-model contract and remove it from this list.

---

## Minimum Useful Current-Model Scope

| Workspace | Minimum Useful Version |
|---|---|
| World Builder | Place and connect locations, inspect packets, apply lenses, validate world structure, manage route events/travel/creative briefs, and show location story/state occurrences |
| Location Atlas | Review and arrange existing locations on the map, inspect hierarchy and playable-space context, and avoid inventing non-model layout data |
| Location Authoring | Create a location with hierarchy, ecology, map placement, POIs, routes, encounter hooks, travel context, and validation |
| Character Studio And Character Web | Edit the identity/combat/interaction bundle, inspect world presence, compare, validate, and show character story placements |
| Dialogue Scene Room | View/edit node graph, connect choices, trace a path, show broken links, and place the scene into story/runtime context |
| Encounter Stage | Place participants by side/context, edit rewards, show simulation and placements, and show encounter aftermath/story placement |
| Progression Flow And Gate Builder | Create flags and requirements together, connect sources to outcome state, attach gates to supported content, and preview small event/progression chains before atomic commit |
| Quest Journey Board And Quest Loom | Reorder objectives, edit gates/flags/rewards, show quest givers/aftermath, and place quest beats in the story |
| Item Authoring | Create a single item with mechanics, presentation, effects, modifiers, price, rarity, and requirements |
| Item Ecosystem And Item Forge | Show all sources, add item to source/reward, compare price/power/scarcity, and track important item journeys |
| Shop Authoring | Create a shop and inventory packet with canonical item references, stock, pricing, and merchant acquisition context |
| Creature Workshop | Focused enemy creator with move kit, spoils, habitat, placement, story usage, draft restore/reset, stale-protected scoped changes, comparison, and health |
| Ability Spellcraft Lab | Compose trigger, target, effects, statuses, scaling, cost, simulation, relationships, status defenses, and ability usage across profiles/encounters |
| Story Timeline And Adventure Board | Arrange scoped story lanes, attach cross-domain content, review local plans, and commit canonical adventure beats without inventing a global sequence |
| Adventure Dependency Map | Trace flags through requirements to gated content, focus health issues, distinguish explicit/inferred edges, and show impossible/dead/cyclic state |

---

## Inspiration Applied

The proposal borrows interaction principles, not product structure:

- Articy's flow view demonstrates that branching stories, dialogues, quest lines, and game states become more understandable as connected visual objects with nesting and flow controls.
- Twine's Story Map demonstrates the value of visible passage cards, directional links, tag colors, start markers, and unmistakable broken-link indicators.
- Machinations demonstrates the value of playable diagrams: a designer can step through or simulate a visual model rather than only inspect static data.
- The current app's own World Builder and Character Creator provide the most important constraint: visual authoring remains useful when it writes honest existing records and keeps incomplete ideas as drafts.

Reference pages:

- Articy Flow View: https://www.articy.com/help/UI_View_Flow.html
- Twine Story Map: https://twinery.org/reference/en/editing-stories/navigating.html
- Machinations game-economy design: https://machinations.io/game-economy-designers
- Machinations interface and playable workspace: https://machinations.io/docs/interface-basics

---

## Final Design Principle

The most useful authoring action should describe a decision in the game world:

- Connect this response to its consequence.
- Cast this character into this conflict.
- Put this reward where the player will remember earning it.
- Show how this quest changes what becomes possible.
- Give this creature a habitat, a challenge, and a payoff.
- Follow this state change and reveal where the adventure breaks.

The records remain the same. The authoring experience becomes a game-design workspace.
