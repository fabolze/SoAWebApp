# Interactive Authoring Workspaces

## Purpose

This is the single canonical design and implementation guide for interactive authoring across the web app.

It preserves two equally important layers in one place:

- **Creative north star:** the best authoring experience, including ideas that may require future metadata, schemas, or systems.
- **Honest implementation:** what the current app can save, infer, preview, and build safely today.

The goal is to make authors feel that they are arranging adventures, staging conflicts, building rewards, and writing conversations rather than maintaining database records. Current implementation constraints must shape delivery without shrinking or deleting the long-term vision.

> Preserve the ambition. Save only what the current model can represent honestly.

## Maintenance Contract

Every workspace must have one row in the status index and one catalog entry containing these concerns:

1. **Creative North Star:** the unrestricted authoring experience worth building toward.
2. **Current-Model Implementation:** gestures and views that map honestly to existing data.
3. **Future Expansion:** valuable concepts that need new canonical metadata or systems.
4. **Health Questions:** checks that evaluate the authored player experience.

The status index is the only place that records delivery status. When a new authoring mode is proposed, add it to the status index and give it a workspace entry immediately. Do not create a second roadmap, status list, or vision document. Update the status index and the matching workspace section in the same change.

---

## Workspace Status

Last reviewed: 2026-06-15

| Workspace | Status |
|---|---|
| World Builder | Implemented; foundation for the shared authoring language |
| Character Studio And Character Web | Implemented replacement route with constellation, narrative records, Presence Trace, staged preview/commit, and ensemble editing |
| Dialogue Scene Room | Implemented focused V1 with story-beat track, rehearsal, World Echo, recipes, bundle review, and graph authoring |
| Encounter Stage | Implemented MVP |
| Quest Journey Board And Quest Loom | Journey Board initial MVP; full mixed-content Quest Loom is future vision |
| Item Ecosystem And Item Forge | Implemented MVP; future work can deepen fantasy, provenance, families, and progression |
| Creature Workshop | Planned; Character Creator already covers much of the existing character/combat/interaction bundle |
| Ability Spellcraft Lab | Implemented expanded lab with trace bench, lifecycle workshop, variants, relationships, and contextual testing |
| Story Timeline And Adventure Board | Interactive MVP implemented with scoped lanes, lenses, drag/drop local planning, canonical adventure beats/typed links, and preview/commit |
| Adventure Dependency Map | Dependency Map initial MVP |

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
- Danger, story, and issue lenses reveal different readings of the same world.
- Bundle saving keeps the complete location packet coherent.

### Living Canvas Application

- **Canonical Save Gestures:** place locations and POIs at model-backed coordinates; connect locations with routes; edit route, encounter-table, travel-tuning, and creative-brief bundles; place existing encounters and route events through their real relationship records.
- **Local Creative Tools:** layer overlays for story, danger, access, density, and issues; selection-centered context; route and location draft placement; comparison shortlists; player-path traces; hypothetical content-density and pacing readings.
- **Future Canonical Expansion:** authored regional identity, world-state variants, intended player journeys, pacing targets, and explicit promises or discoveries.

The World Builder should remain the reference example for selection-centered context, cross-domain creation shortcuts, draft-to-commit flow, and following a player experience across several record types.

### Future Expansion

- Trace complete player journeys across routes, quests, encounters, discoveries, and rewards.
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

## Character Studio And Character Web

### Creative North Star

The author creates one coherent person or creature by starting with an authored role rather than a technical record type. The selected character then sits inside a visible network of loyalties, needs, conflicts, responsibilities, secrets, locations, quests, dialogues, and encounters.

Useful starting roles include civilian, quest giver, merchant, trainer, companion, friendly combatant, standard enemy, elite enemy, and boss.

### Current-Model Implementation

- Treat character identity, combat profile, interaction profile, and encounter appearances as one creative bundle.
- Apply starters only to empty fields so existing work is preserved.
- Edit combat loadout, interaction role, world presence, encounter placement, and linked context together.
- Compare the character with similar existing characters and run heuristic simulations.
- Use the Advanced Form as the schema-complete escape hatch.

### Living Canvas Application

- **Canonical Save Gestures:** edit the character, combat profile, interaction profile, loadout, quest links, and encounter appearances as one reviewed bundle; place the character into existing encounters and interaction roles through their real references.
- **Local Creative Tools:** a character constellation showing locations, quests, dialogues, encounters, factions, and nearby characters inferred through shared content; role, presence, combat, and issue lenses; a presence trace following where the character appears; local relationship sketches and comparison ghosts.
- **Canonical Narrative Expansion:** directed character relationships, structured story profiles, and ordered story beats with relationship-state changes.

The constellation must style shared-content proximity and inferred relationships as derived readings. Local relationship sketches may suggest changes to existing dialogue, quest, encounter, or placement records, but they do not create canonical relationships by themselves.

### Future Expansion

- Author named character-to-character relationships and changing relationship states.
- Track public face, private truth, motives, fears, duties, contradictions, and secrets.
- Trace a character's entrances, changes, reactions, and exits across the story.
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

| Author Gesture | Existing Data Written |
|---|---|
| Double-click empty canvas to sketch a line | New local `dialogue_nodes` draft with `dialogue_id` |
| Connect one node to another | Append a `choices` row with `next_node_id` |
| Type on a connection | Set `choice_text` |
| Drop a requirement on a node | Set node `requirements_id` |
| Drop a requirement on a connection | Set choice `requirements_id` |
| Drop a flag on a node | Append to node `set_flags` |
| Drop a flag on a connection | Append to choice `set_flags` |
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
| Add an entry lock | Set encounter `requirements_id` |
| Place encounter into a location deck | Add/update a `location_encounter_tables.encounter_entries` row |
| Place encounter at a specific POI | Set `location_pois.encounter_id` |
| Put encounter in an event chain | Set `events.encounter_id` on an Encounter event |

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
4. Result: rewards and flags set.
5. Follow-up: events or world content unlocked by those flags.

This does not claim to model encounter phases. It presents the real available structure as a readable dramatic pulse.

### Living Canvas Application

- **Canonical Save Gestures:** cast participants, assign sides and contexts, edit rewards and gates, and place the encounter into existing location tables, POIs, or events.
- **Local Creative Tools:** a dramatic pulse lane derived from gate, cast, conflict, result, and follow-up; threat, reward, role, and world-placement overlays; variant comparison ghosts; hypothetical participant arrangements; missing-role slots that can start a local Creature Workshop draft.
- **Future Canonical Expansion:** encounter phases, stakes, environment roles, escalation, turning points, alternate resolutions, and authored tactical readability.

A missing-role slot expresses a design need such as "ranged pressure" or "non-combat witness." It remains local until the author creates a real character/combat bundle and places it into the encounter.

### Future Expansion

- Author stakes, participant wants, dramatic roles, environment, escalation, turning points, and alternate resolutions.
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

### Living Canvas Application

- **Canonical Save Gestures:** attach effects and modifiers, edit gates and economy fields, and place the item into existing shops, loot tables, rewards, events, and POIs.
- **Local Creative Tools:** a source constellation around the item; scarcity, power, value, progression, usage, and issue overlays; a progression horizon based on inferred source context; hypothetical acquisition sources; comparison ghosts; a player-facing item journey.
- **Future Canonical Expansion:** item families, ownership history, intended progression tier, transformations, world reactions, and authored replacement or restoration journeys.

The progression horizon and earliest-source reading are estimates, not saved tier assignments. A hypothetical acquisition source becomes canonical only by creating or editing the real shop, loot, reward, event, or POI relationship.

### Future Expansion

- Author item families, variants, sets, makers, ownership history, and transformations.
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
- **Future Canonical Expansion:** authored intent, timing windows, counterplay, presentation identity, mastery paths, hazards, movement tests, and explicit ability-family relationships.

Contextual tests and rhythm timelines are interpretations of current simulation data. Related-family sketches may create suggested ability drafts, but no family relationship saves until the project models one deliberately.

### Future Expansion

- Author intent, opportunity, expression, impact, response, rhythm, and growth together.
- Evaluate player decisions, readability, counterplay, synergy, presentation, and mastery.
- Test abilities inside small playable situations with movement, groups, allies, hazards, and encounter sequences.
- Create related ability families: setup/payoff/recovery, basic/advanced/mastery, or player/enemy counter-versions.
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

### Current-Model Implementation

The current model now owns deliberate cross-domain `adventure_beats` and typed `adventure_beat_links`. The interactive workspace is available at `/author/story-timeline`; `/api/ui/adventure-timeline` remains the read aggregation contract, while rollback-only `/api/ui/adventure-timeline/preview` and atomic `/api/ui/adventure-timeline/bundle` promote reviewed local plans into canonical records.

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
| Typed `adventure_beat_links` | Canonical setting, cast, player-journey, runtime, state, reward, and reference attachments |

The aggregator explicitly separates canonical placements, runtime event chains, unplaced content, and inferred dependency relationships. It does not save visual positions or claim that current records form one canonical player path.

### Lenses

- **Story:** arcs, major beats, introductions, escalations, and payoffs.
- **Cast:** character entrances, presence, decisions, reactions, and exits.
- **Locations:** where beats happen and when important places first become relevant.
- **Quests:** ordered arc quests, objectives, entry points, and aftermath.
- **Runtime:** events, dialogue, encounters, and implementation coverage.
- **State:** requirements, flags, branches, and unlocks.
- **Issues:** contradictory placement, missing implementation, broken references, and unplaced important content.

### Living Canvas Application

- **Canonical Save Gestures:** review and commit local planning beats as one atomic `adventure_beats` and `adventure_beat_links` bundle. Existing arc quest order and character story-beat order remain editable through their owning workspaces.
- **Local Creative Tools:** drag existing content into proposed beat trays; move hypothetical story beats; focus by arc, location, character, quest, or issue; preview dependency context; frame a playable slice.
- **Future Canonical Expansion:** direct canonical beat reordering/editing, playable-story timeline kinds, optional and failure paths, pacing targets, promises, payoffs, and knowledge state.

Story Timeline arrangements remain local planning state until the author reviews and commits them. Commit creates canonical adventure beats and typed links without rewriting the linked records.

### Future Expansion

- Add direct editing and reordering of already-canonical `adventure_beats` and `adventure_beat_links` on the canvas.
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

### Lenses

- **Dead State:** flags that are set but never read.
- **Impossible Gates:** required flags with no known source.
- **Contradictions:** requirements that both require and forbid the same flag.
- **Circularity:** event and inferred quest dependency loops.
- **World Access:** routes, shops, POIs, and locations affected by requirements.
- **Narrative Impact:** quests, dialogues, events, and arcs affected by state.

### State Walkthrough

Begin with an empty temporary state, trigger existing sources, and watch available content change. This provides a simple, playable model of narrative progression without creating any new canonical sequence.

### Living Canvas Application

- **Canonical Save Gestures:** connect supported sources to flags, edit requirement flag rules, assign requirements to gated content, connect event chains, and create supported story-arc branches.
- **Local Creative Tools:** reachable-state illumination; state flood-fill walkthroughs; dead-state, impossible-gate, world-access, narrative-impact, and issue overlays; hypothetical dependency links; path comparison; playable-slice framing around a selected region, arc, or objective.
- **Future Canonical Expansion:** authored cross-domain sequences, explicit playable slices, knowledge state, pacing targets, promises, payoffs, and canonical player paths.

Hypothetical links and playable-slice framing remain dotted local planning objects. They become canonical only when translated into supported flags, requirements, event links, story-arc branches, or other real relationships.

### Future Expansion

- Arrange world journey, main story, optional discoveries, characters, encounters, rewards, knowledge, and recovery into one playable-slice view.
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
- **Place:** add an existing entity to an existing relationship.
- **Connect:** create a real reference or dependency.
- **Arrange:** reorder only when order is canonical; otherwise change local visual layout.
- **Inspect:** open a complete context packet.
- **Compare:** place similar content side by side.
- **Trace:** follow references and dependencies.
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

- Character motives, secrets, fears, and relationships.
- Encounter phases and alternate resolutions.
- Quest failure paths and optional mixed-content beats.
- Explicit dramatic pacing.
- Creature ecology rules and behavior rhythms.
- Item ownership history and intended progression tier.
- A canonical full-game player path.
- Promises, payoffs, emotional shifts, and player knowledge.

They may appear as prompts, inferred views, local planning notes, or generated suggestions. They should not be written into unrelated fields or encoded through fragile tag conventions. If the project later models one of these concepts deliberately, update the relevant workspace's current-model contract and remove it from this list.

---

## Minimum Useful Current-Model Scope

| Workspace | Minimum Useful Version |
|---|---|
| World Builder | Place and connect locations, inspect packets, apply lenses, validate world structure |
| Character Studio | Edit the identity/combat/interaction bundle, inspect world presence, compare and validate |
| Dialogue Flow Room | View/edit node graph, connect choices, trace a path, show broken links |
| Encounter Stage | Place participants by side/context, edit rewards, show simulation and placements |
| Item Ecosystem | Show all sources, add item to source/reward, compare price/power/scarcity |
| Quest Journey Board | Reorder objectives, edit gates/flags/rewards, show quest givers and aftermath |
| Story Timeline And Adventure Board | Arrange scoped story lanes, attach cross-domain content, review local plans, and commit canonical adventure beats without inventing a global sequence |
| Adventure Dependency Map | Trace flags through requirements to gated content, show impossible/dead state |
| Ability Spellcraft Lab | Compose trigger, target, effects, scaling, cost, and simulation |
| Creature Workshop | Focused enemy creator with move kit, spoils, habitat, comparison, and health |

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
