# Schema-Free Interactive Authoring Blueprint

## Purpose

This blueprint extends the interactive authoring language of the current World Builder and Character Creator across the rest of the web app.

It is written for game designers and writers. The goal is to make authors feel that they are arranging adventures, staging conflicts, building rewards, and writing conversations rather than maintaining database records.

Every proposal in this document follows one hard constraint:

> It must save only into existing tables, fields, nested payloads, and references. No schema, model, or table changes are required.

The workspace may derive temporary visual meaning from existing data. It must clearly label inferred meaning and must not save it as if it were canonical.

---

## Implementation Status

Last reviewed: 2026-06-10

| Workspace | Status |
|---|---|
| Dialogue Flow Room | Implemented MVP |
| Encounter Stage | Implemented MVP |
| Item Ecosystem | Implemented MVP |
| Quest Journey Board | Initial MVP; richer card controls and walkthrough remain |
| Adventure Dependency Map | Initial MVP; broader lenses and focused edit UI remain |
| Ability Spellcraft Lab | Planned |
| Creature Workshop | Planned; Character Creator already covers much of the existing character/combat/interaction bundle |

The implemented Dialogue Flow Room provides graph sketching and connection, node/choice/dialogue inspectors, atomic bundle saving, local layout and draft restoration, health analysis, lenses, context links, and gated playthrough. The implemented Encounter Stage provides side composition, linked profile inspection, gates, rewards, existing-table placement, health analysis, simulation comparison, local draft restoration, and atomic bundle saving. The implemented Item Ecosystem provides direct acquisition-source controls, POI placement protection, economy and power comparison, progression and issue panels, local draft restoration, and atomic new/existing item bundle saving.

The remaining workspace descriptions include both implemented MVPs and future polish targets.

---

## Current Authoring Audit

### World Builder

The World Builder is the strongest authoring experience because it gives the author a model of how the player experiences the world.

Its useful patterns are:

- Locations are visible nodes rather than rows.
- Routes are visible, selectable connections.
- Authors can sketch a location directly onto the map before fully defining it.
- Authors can create a route by connecting two places.
- Locations can be moved to express a useful visual arrangement.
- Danger, story, and issue lenses reveal different readings of the same world.
- Selecting a location opens a context packet containing routes, POIs, encounter placement, story content, creative briefs, and validation.
- Inline editing and bundle saving let authors work on the whole location packet without repeatedly changing editors.

The central lesson is not "use a graph." It is:

> Give the author a canvas shaped like the decision they are trying to make.

### Character Creator

The Character Creator successfully applies the same principle to a subject that is distributed across several records.

Its useful patterns are:

- Start with an authored role such as merchant, quest giver, enemy, elite, or boss.
- Treat character identity, combat profile, interaction profile, and encounter appearances as one creative bundle.
- Apply starters only to empty fields so existing work is preserved.
- Show world presence rather than only outbound fields.
- Let the author create or change encounter placement inside the character workflow.
- Compare the character with similar existing characters.
- Simulate the current character bundle.
- Ask contextual health questions such as whether a boss has abilities or whether a merchant has anything to sell.
- Keep the Advanced Form as a schema-complete escape hatch.

### Current Gap

Quests, encounters, events, and most supporting content still use generic schema editors. Dialogues and dialogue nodes now also have the Dialogue Flow Room. Items have a polished authoring card, but the author mostly edits the item itself rather than deciding where it belongs in the game.

The next step is not to make every form prettier. The next step is to give each content domain:

1. A meaningful canvas.
2. Direct creative gestures.
3. A context packet.
4. Useful lenses.
5. Contextual health questions.
6. Progressive commitment through local drafts.

---

## Rules For Schema-Free Workspaces

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

## Recommended Workspace Set

## 1. Dialogue Flow Room

### Creative Fantasy

The writer stages a conversation by placing lines, connecting responses, testing branches, and seeing where player choices matter.

### Canvas

A directed conversation map:

- Dialogue nodes are cards.
- Choices are labeled arrows.
- Automatic continuation is an unlabeled or subtly styled arrow.
- Requirements appear as locks on nodes or choices.
- Flags appear as visible consequence tokens.
- The current speaker gives each node a visual identity.

### Direct Gestures

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

### Strong Starter Recipes

- Greeting with graceful exit.
- Quest briefing with accept, question, and refuse branches.
- Locked lore reveal.
- Negotiation with three differently gated approaches.
- Post-encounter reaction.

---

## 2. Encounter Stage

### Creative Fantasy

The designer casts characters into a scene, assigns sides and functions, tests the threat, and decides where the scene belongs in the world.

### Canvas

A stage divided into three visible zones:

- Friendly
- Neutral
- Hostile

Characters are placed on the stage as cards. Each card shows whether it has the combat or interaction profile required by its selected contexts.

The stage is not a tactical battle map. Position inside a side is visual only.

### Direct Gestures

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

### Strong Starter Recipes

- Road ambush.
- Elite guardian.
- Neutral faction checkpoint.
- Dialogue that can become combat.
- Companion introduction.
- Boss scene with reward and completion flag.

---

## 3. Quest Journey Board

### Creative Fantasy

The writer lays out what the player is asked to do, what each step changes, how the quest is unlocked, and what the player receives at the end.

The board must remain honest about the current model: quest objectives are an ordered list, not a fully modeled mixed-content beat graph.

### Canvas

The main board is a horizontal journey:

- **Invitation:** quest requirement and known quest-giver links.
- **Objectives:** ordered objective cards.
- **Completion:** quest completion flags.
- **Payoff:** XP, items, currency, and reputation.
- **Aftermath:** content elsewhere unlocked by completion flags.

Story-arc context appears above the journey. Real story-arc branch relationships appear between quest cards.

### Direct Gestures

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

### Strong Starter Recipes

- Investigation: discover, confront, report.
- Hunt: track, defeat, return.
- Delivery with gated destination.
- Faction choice with completion flag and reputation payoff.
- Dungeon contract with elite encounter reward.

---

## 4. Item Ecosystem

### Creative Fantasy

The designer does not merely forge an item. They decide how the player discovers it, earns it, buys it, uses it, and whether it has a meaningful place in progression.

### Canvas

The selected item sits in the center of an ecosystem with four surrounding regions:

- **Sources:** shops, combat-profile loot, quest rewards, encounter rewards, event rewards, and POIs.
- **Power:** effects, stat modifiers, attribute modifiers, equipment identity, and requirements.
- **Economy:** base price, currencies, shop prices, and stock.
- **World Role:** quest-item use, reward frequency, tags, and locations inferred through its sources.

### Direct Gestures

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

### Strong Starter Recipes

- Common shop weapon.
- Rare elite drop.
- Quest reward with one memorable effect.
- Discoverable lore-linked item at a POI.
- Consumable sold early and dropped by matching enemies.

---

## 5. Creature Workshop

### Creative Fantasy

The designer creates an enemy as a gameplay proposition:

> When this creature appears, what does the player need to notice and do?

This workspace is a focused mode of the existing Character Creator, not a new creature entity.

### Canvas

A creature workbench with five trays:

- **Identity:** character fields and enemy tags.
- **Threat Profile:** enemy type, aggression, level, class, and custom stats.
- **Move Kit:** ordered ability cards.
- **Spoils:** loot, currencies, reputation, and XP.
- **Habitat:** home location, encounter appearances, and location encounter-table placements.

### Direct Gestures

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

### Health Questions

- Does the creature have a distinct move kit compared with nearby enemies?
- Does it ever appear in the world?
- Is its home location compatible with its actual encounter placement?
- Is an elite or boss meaningfully stronger and more rewarding?
- Are its abilities internally redundant?
- Does its loot reinforce the creature's identity?

---

## 6. Ability Spellcraft Lab

### Creative Fantasy

The designer assembles an ability as a readable gameplay sentence:

> When this triggers, it reaches these targets, applies these effects, scales from these stats, and asks this cost from the player.

### Canvas

A left-to-right spellcraft chain:

1. **Trigger:** active, passive, toggle, and trigger condition.
2. **Reach:** targeting and damage-type source.
3. **Payload:** linked effect cards.
4. **Scaling:** stat contribution cards.
5. **Cost And Rhythm:** resource cost, cooldown, and requirements.

The ability's simulation result and player-facing description remain visible while the chain changes.

### Direct Gestures

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

### Lenses

- **Combat Sentence:** trigger, target, payload, and scaling in one readable line.
- **Effect Mix:** damage, healing, control, status, shield, and modifier balance.
- **Efficiency:** simulated impact against cost and cooldown.
- **Usage:** characters, combat profiles, and other content that references the ability.
- **Damage Identity:** fixed, weapon-derived, and effect damage types.
- **Issues:** no effects, contradictory targeting, weak scaling, or extreme efficiency.

### Ability Test Bench

Use the existing simulation to compare:

- Current draft versus similar abilities.
- Different effect combinations.
- Different resource budgets and encounter pressures.
- Ability impact when assigned to a selected combat profile.

### Health Questions

- Does the ability have a clear trigger, target, and payload?
- Does its target agree with the targets of its linked effects?
- Is the cost/cooldown proportionate to simulated impact?
- Is a fixed damage type missing when required?
- Does the ability duplicate an existing ability without meaningful difference?
- Is it unused by every character and combat profile?

### Strong Starter Recipes

- Direct strike.
- Area control spell.
- Defensive self-buff.
- Ally heal with status cleanse.
- Passive on-hit effect.
- Boss signature ability.

---

## 7. Adventure Dependency Map

### Creative Fantasy

The designer sees what changes the world: which flags are produced, which content consumes them, and where the player's journey can become blocked.

This is the cross-domain workspace that current schemas support most honestly. It should not pretend to be a complete narrative timeline.

### Canvas

A graph with real dependency roles:

- **Sources:** quests, objectives, events, encounters, dialogue nodes, dialogue choices, and interactions that set flags.
- **State:** flags and faction reputation.
- **Gates:** requirements.
- **Consumers:** quests, events, dialogues, encounters, routes, shops, POIs, items, abilities, story arcs, and objectives.

The author can focus on one flag, requirement, quest, or story arc and expand outward.

### Direct Gestures

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

### Health Questions

- Which flags have no source?
- Which flags have no consumer?
- Which requirements are impossible or contradictory?
- Which event chains loop forever or point to missing events?
- Which story-arc branch conditions can never occur?
- Which major rewards or routes are gated by obscure, unreachable state?

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

## What Must Remain Temporary

The following are creatively valuable but cannot become canonical with the current model:

- Character motives, secrets, fears, and relationships.
- Encounter phases and alternate resolutions.
- Quest failure paths and optional mixed-content beats.
- Explicit dramatic pacing.
- Creature ecology rules and behavior rhythms.
- Item ownership history and intended progression tier.
- A canonical full-game player path.
- Promises, payoffs, emotional shifts, and player knowledge.

They may appear as prompts, inferred views, local planning notes, or generated suggestions. They should not be written into unrelated fields or encoded through fragile tag conventions.

---

## Recommended Delivery Order

### Phase 1: Dialogue Flow Room

Status: implemented MVP.

The delivered workspace uses the existing directed node graph, requirements, flags, factions, and linked world context. Its graph, health-analysis, and playthrough patterns establish the first reusable foundation for the later phases.

### Phase 2: Encounter Stage

Status: next planned workspace.

Why second:

- Participant placement is already a visual composition problem.
- Existing simulation can provide immediate feedback.
- Character Creator already proves bundled participant editing.
- World placement is already modeled through encounter tables, POIs, and events.

### Phase 3: Item Ecosystem

Why third:

- Item authoring already exists and can become the center of a richer context workspace.
- The item has many useful inbound references.
- Acquisition, scarcity, price, power, and placement are all inferable now.

### Phase 4: Quest Journey Board

Why fourth:

- Ordered objectives, rewards, requirements, completion flags, quest givers, and story-arc ordering are useful now.
- The workspace must carefully distinguish real arc branches from inferred flag dependencies.

### Phase 5: Adventure Dependency Map

Why fifth:

- It brings all existing flag and requirement relationships together.
- It benefits from graph and trace components developed for dialogue and quests.
- It becomes the strongest cross-domain validation workspace.

### Phase 6: Ability Spellcraft Lab

Why sixth:

- Abilities and effects already compose into a truthful visual chain.
- Existing simulation provides immediate feedback.
- It expands reusable drag-and-drop payload and comparison patterns.

### Phase 7: Creature Workshop

Why seventh:

- Most of its underlying bundle already exists in Character Creator.
- It is primarily a more focused creative mode, with habitat and variety analysis added.

---

## Minimum Useful Version Of Each Workspace

| Workspace | Minimum Useful Version |
|---|---|
| Dialogue Flow Room | View/edit node graph, connect choices, trace a path, show broken links |
| Encounter Stage | Place participants by side/context, edit rewards, show simulation and placements |
| Item Ecosystem | Show all sources, add item to source/reward, compare price/power/scarcity |
| Quest Journey Board | Reorder objectives, edit gates/flags/rewards, show quest givers and aftermath |
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
