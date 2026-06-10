# Interactive Authoring Workspaces

## Purpose

This proposal extends the strongest idea in the current World Builder to the rest of the game's content:

> Authors should work inside a meaningful representation of the game world, not inside a collection of disconnected records.

The workspaces below are for game designers and writers. They describe content intent, relationships, pacing, and player experience. They do not attempt to become an engine editor.

## Implementation Status

Last reviewed: 2026-06-10

- **Working now:** World Builder, Character Creator, specialized item/shop/location authoring, Location Atlas, Dialogue Flow Room MVP, and Encounter Stage MVP.
- **Dialogue Flow Room:** authors can sketch, connect, edit, validate, save, restore, and play through dialogue graphs using the existing dialogue, node, requirement, flag, faction, and context data.
- **Encounter Stage:** authors can compose sides and contexts, inspect linked profiles, edit requirements and rewards, place encounters in existing location tables, compare simulation results, validate health, restore drafts, and save the bundle atomically.
- **Planned:** Item Ecosystem, Narrative Dependency Map/Quest Journey Board, Character Context Hub, Creature Workshop, Ability Spellcraft Lab, and Adventure Board.
- **Still conceptual:** writer-room metadata such as dramatic purpose, emotional arc, motives, encounter phases, promises/payoffs, and canonical cross-domain sequence. These must remain inferred or temporary unless deliberately modeled later.

The proposal sections below remain useful design direction, but only the features listed as working above describe current UI.

## Compatibility With The Current Content Model

The current schemas primarily represent **structured game content and runtime relationships**:

- What exists
- What references what
- What unlocks or follows what
- Where content appears
- Who participates
- What gameplay payload or reward is attached

They do **not** currently represent many forms of writer-room metadata such as dramatic purpose, emotional arc, character wants, encounter phases, player lessons, promises/payoffs, or authored pacing.

Therefore, the workspaces in this document must be read in two categories:

- **Current-model workspaces:** interactive views that can truthfully read and edit existing fields.
- **Aspirational workspaces:** useful design directions that would require new schemas or explicit authoring metadata before they could become canonical tools.

### Fit Audit

| Proposed Workspace | Fit With Current Schemas | What Can Be Represented Now | What Is Not Represented Now |
|---|---|---|---|
| Quest Loom | Partial | Story-arc quest lists and branches, ordered quest objectives, requirements, completion flags, rewards, event chains, dialogue graphs | Mixed-content beat graph, objective-to-location/character links, failure paths, optional beats, dramatic pacing, explicit consequences |
| Encounter Stage | Partial | Encounter type, participants, combat side, interaction/combat context, requirements, rewards, location placement through encounter tables | Stakes, participant dramatic roles, environment, phases, escalation, alternate resolutions |
| Character Web | Partial | Faction, class, home location, combat profile, interaction role, dialogue, offered quests, shop/inventory, encounter appearances | Character-to-character relationships, motives, secrets, fears, duties, changing relationships, reactions |
| Creature Workshop | Weak/Partial | Character plus combat profile, enemy type, aggression, stats, abilities, loot, quest links, encounter appearances | Ecology, behavior rhythm, silhouette, pack role, player lesson, readable signals |
| Item Forge | Strong/Partial | Item identity, type, rarity, price, requirements, effects, modifiers, shops, loot tables, quest/event/encounter rewards | Item families, variants, makers, ownership history, intended progression window, obsolescence |
| Dialogue Room | Strong/Partial | Dialogue ownership/location, node graph, speakers, text, choices, requirements, and flags | Player intention, emotional shifts, information tracking, relationship changes |
| Adventure Board | Weak | Can infer some world, quest, event, reward, and dialogue relationships | Canonical cross-domain sequence, pacing lanes, promises/payoffs, complete player-path ordering |

The safest rule is:

> A workspace may visualize inferred meaning, but it should not pretend inferred meaning is authored canonical data.

### Interactive Does Not Mean New Tables

New tables are only required when a new concept must become canonical saved data. They are not required to make existing content easier, more visual, or more enjoyable to author.

The current character workflow feels unintuitive because one authored idea is split across several technical records:

- `characters`: identity, level, class, faction, and home location
- `combat_profiles`: enemy type, aggression, stats, abilities, loot, rewards, quest links, and companion configuration
- `interaction_profiles`: role, dialogue, offered quests, inventory, and interaction flags
- `encounters`: where the character participates and on which side
- `dialogues`, `shops`, and locations: additional world context

A designer thinks "create a swamp enemy" or "create a village quest giver." They should not need to begin by deciding which database record to open.

An interactive Character And Enemy Creator can create and edit this existing bundle as one authored subject. The workspace may present creative questions and visual controls, then translate the answers into the current records.

#### Character And Enemy Creator

**Start With A Role**

Choose a starting card:

- Civilian
- Quest Giver
- Merchant
- Trainer
- Companion
- Friendly Combatant
- Standard Enemy
- Elite Enemy
- Boss

The selected role determines which existing profile sections become important. It does not require a new saved field.

**Identity Card**

Directly edits existing character fields:

- Name, title, portrait, and description
- Level and class
- Faction and home location
- Tags

**Combat Loadout Board**

Directly edits or creates the linked combat profile:

- Enemy type and aggression as large selectable badges
- Abilities as draggable cards
- Custom stats as bars, a radar chart, or comparison against similar characters
- Loot as items dropped into a reward tray
- XP, currency, and reputation reward preview
- Companion configuration when relevant

The visual arrangement is an authoring aid. The saved result remains the existing combat-profile data.

**Interaction Role Board**

Directly edits or creates the linked interaction profile:

- Role card
- Dialogue assignment
- Offered quests
- Merchant inventory
- Flags set on interaction

**World Presence**

Uses current inbound references:

- Home location
- Encounter appearances
- Dialogue location
- Shops owned
- Quests offered

Authors can add an existing character to an encounter or create a draft encounter around them without needing a new character relationship table.

**Enemy Comparison**

Compare the current enemy with existing enemies at similar levels:

- Stats
- Ability count and targeting mix
- Reward value
- Loot chance
- Encounter usage
- Simulation results

This uses current data and the existing simulation system.

**Contextual Health Checks**

- Enemy has no combat profile
- Combat profile has no abilities
- Enemy never appears in an encounter
- Character is marked as a merchant but has no inventory or shop
- Quest giver offers no quests
- Character has dialogue but no interaction profile
- Loot or reward references are incomplete
- Boss is weaker or less rewarding than nearby standard enemies

#### Creative Prompts Without Persistence

The creator can ask useful temporary questions such as:

- What should the player do differently when this enemy appears?
- What is this character's primary function?
- What makes this enemy distinct from nearby enemies?
- Where should the player first meet them?

These answers can guide suggested abilities, stats, tags, encounters, descriptions, and rewards without requiring dedicated columns. They may remain temporary authoring prompts unless the project later decides they deserve canonical fields.

---

## 1. What The Current World Builder Gets Right

The World Builder is more than a location editor. It gives the author a small model of the world and lets them reason through it.

Its strongest qualities are:

- **A meaningful canvas:** locations are nodes and routes are connections.
- **Direct creative gestures:** sketch a place, connect two places, move a place, inspect a route.
- **Multiple lenses:** danger, story, and issues reveal different truths about the same world.
- **Context packets:** selecting a location reveals routes, POIs, encounters, story beats, creative notes, and problems together.
- **Progressive commitment:** rough ideas can begin as sketches before becoming complete content.
- **Relationship visibility:** the author sees where a piece of content lives and what it touches.
- **Health feedback:** the workspace identifies empty, disconnected, or contradictory content.

This is the reusable pattern:

1. Give each content domain a canvas that resembles how players experience it.
2. Let authors place, connect, arrange, and compare content on that canvas.
3. Let them switch between useful creative lenses.
4. Show the full context packet for the selected thing.
5. Allow rough drafts before requiring complete records.
6. Check the authored experience, not only missing fields.

The current immersive item and character views provide attractive themed forms, but they do not yet offer this same degree of creative reasoning. Their next step is not simply adding more fields. Their next step is giving each domain its own interactive mental model.

### Current Boundaries To Learn From

- The story layer is useful, but many story relationships are inferred rather than deliberately authored as a visible player path.
- Most lenses currently reveal or filter content; they do not yet help the author compare pacing, payoff, repetition, or player knowledge.
- The strongest direct gestures are concentrated around locations and routes. Much of the attached content still opens in separate editors.
- Location packets collect valuable context, but there is no full playthrough trace that follows one possible player experience across the world.
- Sketching is powerful because it lowers the cost of invention. Other content domains need the same permission to begin with an incomplete idea.

---

## 2. Shared Authoring Language

All specialized workspaces should feel like different rooms in the same studio.

### Common Creative Actions

- **Select:** inspect one piece of content in context.
- **Sketch:** create an incomplete idea with only a title and creative intent.
- **Connect:** establish a meaningful relationship.
- **Arrange:** express sequence, hierarchy, opposition, or importance through position.
- **Compare:** place alternatives beside each other.
- **Trace:** follow one player-facing path from beginning to end.
- **Play Through:** step through an authored experience as a hypothetical player.
- **Focus Lens:** reveal one concern such as pacing, rewards, faction influence, difficulty, or unresolved issues.

### Common Context Packet

Every selected piece of content should answer:

- What is this meant to make the player feel?
- Where and when does the player encounter it?
- What introduces it?
- What can the player do with it?
- What changes because of it?
- What other content depends on it?
- What is missing or contradictory?

### Common Lenses

- **Player Knowledge:** what the player knows at this point.
- **World Truth:** what is actually true, including secrets.
- **Pacing:** calm, tension, climax, recovery, and reward.
- **Difficulty:** expected player readiness and threat.
- **Rewards:** material, power, knowledge, access, and relationship rewards.
- **Faction Influence:** who benefits, loses, controls, or reacts.
- **Issues:** dead ends, orphaned content, contradictions, and weak payoffs.

---

## 3. Quest Loom

### Core Fantasy

The author weaves a player journey from hooks, objectives, choices, consequences, and payoffs.

The main canvas is a flow of **quest beats**, not a form. A quest beat is a player-facing moment such as:

- Hear a rumor
- Meet the quest giver
- Accept or refuse
- Travel somewhere
- Discover evidence
- Choose a side
- Defeat or negotiate
- Return
- Receive a reward
- See a world consequence

### Canvas

Quest beats appear from left to right in expected player order. Branches split vertically and can later rejoin. Each beat can carry a location, character, encounter, dialogue, item, requirement, or flag.

The author can:

- Sketch a beat with a short sentence.
- Drag beats to change pacing.
- Connect beats to define possible player paths.
- Mark a beat as optional, hidden, fail-state, or irreversible.
- Drop an existing character, location, item, or encounter onto a beat.
- Turn a rough beat into a formal quest objective, event, dialogue, or encounter.
- Group several quests into a story arc lane.

### Useful Lenses

- **Player Path:** only shows what a player can experience in one selected route.
- **Branch Consequences:** highlights choices and what changes afterward.
- **Knowledge Flow:** shows clues introduced, reinforced, and resolved.
- **Location Journey:** overlays the physical route through the world.
- **Character Presence:** reveals who appears, disappears, or lacks follow-up.
- **Reward Rhythm:** shows when the player receives power, treasure, access, lore, or reputation.
- **Failure And Lockout:** highlights ways content becomes unavailable.

### Quest Health Questions

- Does the quest have a clear hook before asking for commitment?
- Does every objective change the situation or reveal something?
- Is there a meaningful escalation between beginning and climax?
- Does every branch lead somewhere intentional?
- Are choices acknowledged later?
- Is the reward appropriate to the promise and effort?
- Does the quest use the world, or could it happen anywhere?
- Are important characters introduced before they become important?
- Can the player understand why they are doing each step?

### Example: Forest Swamp Introduction

A first quest in Altrail could be authored as:

`Village warning -> Forest trail opens -> Find abandoned cart -> Choose to follow tracks or return -> Enter Forest Swamp -> Face first challenge -> Recover proof -> Village reaction`

The Location Journey lens would immediately reveal that the swamp currently has no authored route from the forest. The Reward Rhythm lens could reveal that the quest promises danger but has no memorable reward. The Knowledge Flow lens could show whether the abandoned cart clue actually pays off.

---

## 4. Encounter Stage

### Core Fantasy

The author directs a dramatic situation: who is present, what each side wants, how pressure changes, and how the encounter can resolve.

An encounter is not only a list of participants. It is a staged conflict with an opening state, escalation, turning point, and resolution.

### Canvas

The canvas resembles a stage or confrontation board:

- Player side
- Opposing side
- Neutral or uncertain side
- Environment and hazards
- Stakes
- Escalation beats
- Possible resolutions

Characters and monsters are placed onto the stage. Their distance from the center communicates how immediately involved they are. Neutral participants can visibly shift toward either side as conditions change.

The author can:

- Add participants by role: pressure, support, controller, protector, witness, objective.
- Define what each participant wants.
- Add environmental complications.
- Sketch escalation beats such as reinforcements, phase changes, surrender, betrayal, or escape.
- Create alternate non-combat resolutions.
- Attach consequences and rewards to each resolution.
- Compare normal, elite, and boss variants side by side.

### Useful Lenses

- **Threat Shape:** burst, attrition, control, numbers, environmental pressure.
- **Attention:** what the player is expected to notice and prioritize.
- **Role Coverage:** pressure, support, defense, disruption, and objective interaction.
- **Resolution:** combat, dialogue, stealth, payment, retreat, or special solution.
- **Reward Versus Risk:** compares likely effort and payoff.
- **World Fit:** shows why this encounter belongs in its assigned location.
- **Repetition:** highlights encounters with overly similar participants or rhythms.

### Encounter Health Questions

- What makes this encounter memorable beyond its enemy count?
- What is the player trying to protect, reach, interrupt, or learn?
- Is there a clear change during the encounter?
- Does every participant have a distinct purpose?
- Can the player read the threat before suffering from it?
- Does the environment matter?
- Is there an intentional resolution other than victory by elimination?
- Does the reward reinforce the encounter's story?

### Monster Creation Inside The Stage

Monsters should often be created from a missing dramatic role:

> "This swamp encounter needs a creature that forces movement and punishes standing near deep water."

That prompt is more useful than beginning with an empty monster record. The resulting monster already has a habitat, encounter purpose, behavior promise, and player lesson.

---

## 5. Character Web

### Core Fantasy

The author creates a person by placing them inside a network of loyalties, needs, conflicts, responsibilities, and secrets.

The current Character Dossier is a good identity card. The Character Web would become the larger creative workspace around it.

### Canvas

The selected character sits at the center. Around them are:

- Relationships to other characters
- Faction ties
- Home and frequented locations
- Quests they give, affect, or react to
- Dialogues
- Encounters
- Shops or services
- Secrets and knowledge
- Personal wants, fears, duties, and contradictions

Connections should carry a short author-written meaning, such as:

- Protects
- Owes a debt to
- Secretly fears
- Publicly supports
- Wants removed
- Needs approval from
- Knows the truth about

### Useful Lenses

- **Public Face / Private Truth:** separates what players first see from hidden motives.
- **Relationship Pressure:** reveals alliances, rivalries, debts, and leverage.
- **Story Presence:** shows where the character enters, changes, and exits the story.
- **Player Relationship:** tracks stranger, useful contact, ally, rival, enemy, or companion.
- **Faction Role:** shows whether the character represents, questions, exploits, or betrays a faction.
- **World Presence:** displays where the character can be found and whether their placement makes sense.
- **Voice:** collects dialogue examples and highlights inconsistent tone.

### Character Health Questions

- What does this character want right now?
- What prevents them from getting it?
- What can the player change for them?
- What can they change for the player?
- Do they have a relationship that is not purely functional?
- Do their quests and dialogue express the same personality?
- Do they react after important events?
- Are they present in the world where the player expects them?
- If removed, what part of the world becomes less interesting?

### Character Constellations

Authors should be able to create a group together, because characters become more useful through contrast.

Examples:

- Village leadership triangle: cautious elder, ambitious guard captain, trusted healer.
- Rival adventuring party: idealist, pragmatist, glory seeker.
- Swamp inhabitants: displaced hermit, territorial spirit, desperate poacher.

Creating a constellation produces immediate social tension and quest possibilities without requiring a full story arc first.

---

## 6. Creature Workshop

### Core Fantasy

The author designs a creature as a promise of behavior, ecology, and player response.

This is related to Character Web but uses a different creative language. A monster does not need a deep social biography, but it does need a strong gameplay identity and a believable place in the world.

### Canvas

The creature is assembled from five visible facets:

1. **Silhouette:** what the player reads immediately.
2. **Behavior:** what it tries to do.
3. **Pressure:** how it challenges the player.
4. **Ecology:** why it exists here.
5. **Payoff:** what the player gains by understanding or defeating it.

The author can arrange abilities into a simple behavioral rhythm:

`Signal -> Threat -> Response Window -> Consequence -> Recovery`

This is not an engine combat sequence. It is the intended player-readable pattern.

### Useful Lenses

- **Player Lesson:** what skill or habit this creature teaches.
- **Readability:** signals, danger, response, and consequence.
- **Pack Role:** solitary threat, swarm, support, hunter, guardian, scavenger.
- **Habitat:** locations and environmental relationships.
- **Difficulty Tier:** early, standard, elite, boss, or late-game variant.
- **Loot Story:** what its drops say about its body, habitat, or culture.
- **Reuse Risk:** where repeated use would make it stale.

### Creature Health Questions

- Can its behavior be described in one strong sentence?
- What should the player do differently when it appears?
- Does it have a readable warning before its strongest threat?
- Why does it live in this location?
- What does it eat, protect, fear, or follow?
- Does its loot belong to it?
- What other creature makes it more interesting?

---

## 7. Item Forge

### Core Fantasy

The author creates an item by defining its fantasy, use, ownership history, and place in the world's economy.

The current item card is a good presentation surface. The Item Forge should let the author reason about why an item deserves to exist.

### Canvas

The selected item sits in the center of four surrounding rings:

- **Fantasy:** what the player imagines they can do with it.
- **Use:** effects, abilities, requirements, and meaningful situations.
- **Source:** who makes, sells, guards, drops, or awards it.
- **Destination:** who wants it, what quest uses it, and when it becomes obsolete.

The author can:

- Place the item into shops, rewards, loot sources, and quests.
- Compare variants in a horizontal family: common, rare, corrupted, restored.
- Build a set as a constellation of related items.
- Trace the item's journey from discovery to use to replacement.
- Mark an item as iconic, practical, economic, quest-critical, or world flavor.
- Write the item's player promise before assigning numbers.

### Useful Lenses

- **Acquisition:** every source and earliest availability.
- **Use Cases:** combat, exploration, dialogue, crafting, quest, or collection.
- **Economy:** price, sellers, scarcity, and competing rewards.
- **Power Journey:** when it is exciting, normal, and obsolete.
- **World Belonging:** faction, region, maker, material, and history.
- **Reward Competition:** other items offered at the same point in progression.
- **Orphans:** items with no source, no use, or no audience.

### Item Health Questions

- What fantasy does the name and description promise?
- Does its actual use fulfill that promise?
- Can the player obtain it?
- Is its source memorable and believable?
- Is it meaningfully different from nearby alternatives?
- Does a quest reward feel connected to the quest?
- Is a rare item rare in practice?
- Does the world react to important items?

### Item Families

Items should often be authored as families rather than isolated entries:

- A regional travel kit, upgraded expedition kit, and faction-issued deluxe kit.
- A relic in broken, restored, and corrupted forms.
- A monster material, crafted tool, and final trophy item.

Families create progression and world coherence with less invention than unrelated one-off items.

---

## 8. Dialogue Room

### Core Fantasy

The author rehearses a conversation and sees how player choices alter relationships, knowledge, and future possibilities.

### Canvas

Dialogue nodes are displayed as conversation cards arranged by exchange, not as a generic graph alone. Speaker lanes make it clear who controls each moment. Player choices branch downward into responses and consequences.

The author can:

- Write a short exchange directly in speaker lanes.
- Add a player intention such as ask, challenge, reassure, deceive, leave, or commit.
- Mark what information each line reveals.
- Mark emotional shifts.
- Attach choices to relationship, flag, quest, or world consequences.
- Enter rehearsal mode and read one path without graph clutter.

### Useful Lenses

- **Player Intent:** what each choice is trying to accomplish.
- **Information:** what is learned, repeated, hidden, or contradicted.
- **Emotional Arc:** trust, fear, anger, relief, suspicion, and intimacy.
- **Consequences:** flags, quests, rewards, and future dialogue.
- **Voice:** vocabulary, sentence rhythm, and recurring concerns by character.
- **Dead Ends:** choices that produce no meaningful response or consequence.

### Dialogue Health Questions

- Does every player choice express a distinct intention?
- Does the response acknowledge what the player chose?
- Does the conversation change knowledge, relationship, or action?
- Are important facts introduced naturally?
- Does each speaker sound like themselves?
- Can repeated conversations adapt to world changes?

---

## 9. Adventure Board

### Core Fantasy

The author assembles a complete playable slice of the world and checks whether its pieces support one another.

This is the cross-domain successor to the current World Builder. It does not replace specialized workspaces. It brings their authored content together.

### Canvas

An Adventure Board contains a chosen scope such as:

- The first hour
- A village and surrounding wilderness
- One dungeon delve
- One faction chapter
- One companion recruitment arc

The board has lanes:

- World journey
- Main story
- Optional discoveries
- Characters
- Encounters
- Rewards
- Knowledge and revelations
- Recovery and downtime

Authors place existing content into the lanes and arrange it in approximate player order. One item can appear first as a rumor, later as a quest target, and finally as a reward. One character can appear first as a stranger, then an ally, then a rival.

### Useful Lenses

- **First-Time Player:** only information and access available on a fresh playthrough.
- **Completionist:** optional routes, secrets, and missable content.
- **Critical Path:** minimum route through the slice.
- **Pacing:** tension, relief, novelty, repetition, and climax.
- **Content Density:** empty spaces and overloaded moments.
- **Payoff:** promises and their eventual resolutions.
- **Dependency Risk:** fragile chains where one missing requirement blocks too much.

### Adventure Health Questions

- Is there a clear reason to begin?
- Does the player alternate between action, decision, discovery, and recovery?
- Are new concepts introduced before they are tested?
- Does the world react to player progress?
- Are optional discoveries worth the detour?
- Does the climax resolve something established earlier?
- Does the ending point toward the next adventure?

---

## 10. Recommended Priority For The Current Schemas

### Completed First: Dialogue Flow Room

Dialogue nodes already form a real directed graph through choices and `next_node_id`. Requirements and flags make locked choices and consequences visible without inventing new meaning.

The implemented MVP includes:

- Sketching dialogue nodes
- Connecting choices
- Showing requirements and flags on branches
- Playing through conversation paths with temporary state
- Revealing unreachable nodes, dead ends, loops, and choices with no consequence
- Atomic bundle saving, safe deletion, local layout, and local draft restoration

### Next: Encounter Composer

Encounter composition is the next recommended schema-free workspace because participants, sides, requirements, rewards, simulation, and world placement already map to existing data.

The first version should focus on:

- Participant roster and combat sides
- Linked character combat and interaction profiles
- Rewards and requirements
- Location encounter-table placement
- Comparison through the existing encounter simulation
- Missing profiles, empty sides, and reward issues

### Then: Item Ecosystem

Items already participate in a rich inbound relationship network: shops, combat-profile loot, quest rewards, event rewards, encounter rewards, effects, requirements, currencies, stats, and attributes.

The first version should focus on:

- Acquisition sources
- Reward and shop placement
- Effects and modifier payload
- Requirement gates
- Items with no source or no meaningful use
- Side-by-side comparison of existing items

### Then: Narrative Dependency Map

This is a narrower, current-model version of the Quest Loom. It should visualize the relationships that truly exist: story arcs, related quests, quest-level branches, requirements, flags, event chains, dialogue links, locations, and rewards.

The first version should focus on:

- Story-arc quest ordering and branches
- Event `next_event_id` chains
- Requirement-to-flag dependencies
- Quest rewards and completion flags
- Broken, circular, or unreachable dependencies
- Inferred links clearly labeled as inferred

### Then: Character Context Hub

This is a current-model version of the Character Web. It should collect a character's real inbound and outbound references without inventing social relationships.

The first version should focus on:

- Faction, class, and home location
- Combat and interaction profiles
- Dialogue ownership
- Offered quests and shop role
- Encounter appearances
- Loot, abilities, and companion configuration

### Later, After New Authoring Metadata

The full Quest Loom, dramatic Encounter Stage, Character Web, Creature Workshop, and Adventure Board remain useful directions, but they should only become canonical authoring tools after their missing concepts are deliberately modeled.

---

## 11. Guiding Principle

The best interactive authoring gesture is not "edit this field."

It is:

- Put this place on the journey.
- Connect this choice to its consequence.
- Place this character inside a conflict.
- Give this monster a purpose in an encounter.
- Give this item a memorable source and destination.
- Follow the player's experience and see where it becomes unclear, repetitive, empty, or unrewarding.

That is the quality worth carrying from the World Builder into the rest of the app.
