# Narrative Creation Flow Workflow Corpus

Status: V1 corpus and author decisions are approved. Golden intent fixtures and the first local-capture interactions are automated; canonical compilation and runtime execution are not yet automated or verified.

Last implementation audit: 2026-07-17

This document preserves exemplary workflows in the author's own language and derives product, compiler, schema, and acceptance-test implications from them. The original narrative is the source of truth. The structured interpretation exists to make the workflow testable; it must not overwrite the creative intent.

## Implementation Traceability

The implementation source of truth is the audited delivery plan and open-point register in `NARRATIVE_CREATION_FLOW_PLAN.md`. Acceptance scenarios in this corpus use three statuses:

- **Specified:** author intent and expected behavior are approved here.
- **Automated:** a golden, contract, or interaction test proves the behavior in the web app.
- **Runtime verified:** an external consumer proves exported execution semantics. This status is required only for behavior the web app does not execute.

As of 2026-07-17, all W1–W3 scenarios are **Specified**. Their draft normalization/restore corpus is automated through golden intent fixtures. W2 has an **Expand this place** interaction test and the dialogue continuation/reload behavior used by W1/W3 has interaction coverage. No workflow is yet automated through canonical compile/commit, and no external runtime behavior is verified.

| Workflow | Approved design outcome | Reusable implementation foundation | Main remaining evidence |
|---|---|---|---|
| W1: map to quest | Preserve a spontaneous, mostly linear map/quest/encounter/item flow with placeholders and honest inventory semantics | Golden draft fixture, local sequence capture, dialogue continuation/reload, World Builder, return links, Quest Journey, Encounter Stage, rewards, gates, consequences, and story placement | Canonical compile/export fixture plus complete map-to-quest Playwright flow; plan IDs CF-03, CF-10–11, CF-15–19 |
| W2: expand a place | Grow prose and idea cards into one scoped reference graph while separating history, discovery, runtime recruitment, farming, and artifact evolution | Golden draft fixture, selected-place expansion Playwright, shared mention/card lifecycle test, World Builder, Timeline, Character Studio, and item/encounter workspaces | Chronology/variant contracts, constellation compiler, and complete W2 interaction suite; plan IDs CF-13–15, CF-19 |
| W3: resume a city plot | Resume local/project context and promote a bounded causal faction plot with ordered reputation consequences and gated equipment | Golden draft fixture, local draft/manifest resume foundation, World Builder context, faction thresholds, shop gates, and dependency analysis | Related-edit/next-question resume, ordered rank model/trace, placeholder blocker, and canonical W3 suite; plan IDs CF-05, CF-12, CF-15–19 |

### Automated evidence — 2026-07-17

- `soa-editor/src/authoring/fixtures/workflow1-map-to-quest.json`, `workflow2-expand-place.json`, and `workflow3-resume-faction.json` are loaded by `creationFlow.test.ts` and prove versioned normalization plus honest support classification.
- `creationFlow.test.ts` proves migration, stable draft lifecycle, local storage/recovery, malformed-entry rejection, and mention/card independence.
- `soa-editor/tests/authoring-workflows.spec.ts` proves terminal-dialogue **Then…** capture/restoration and selected-location **Expand this place** prose/card/step capture in Chromium.
- `backend/tests/test_creation_flow_manifest_contracts.py` proves project-local manifest/provenance CRUD, recovery ordering, cascade behavior, and UE-export exclusion.
- `backend/tests/test_dialogue_flow_contracts.py` proves deterministic legacy `choice_id` migration and typed ordered `open_shop` action validation, including canonical target and `resume_source_dialogue` policy.

These tests automate capture and contract slices only. They do not count as W1–W3 canonical compile, Unreal execution, or writer-evaluation evidence.

### Corpus change-control rule

- Do not rewrite the original author narratives to match implementation shortcuts.
- When a scenario becomes automated, append the test/fixture path and date to that scenario; do not replace its creative-language acceptance statement.
- When external runtime behavior is verified, record the consumer/fixture and status separately from web implementation.
- Any changed author decision must be reflected both in the relevant workflow/review section and in the plan's confirmed decisions, open-point register, schemas, and golden fixtures.

## Workflow 1: An Evening Map-To-Quest Creation Session

Source: German dictated workflow supplied by the author on 2026-07-15.

### Original Author Narrative

> So, ich möchte kurz den darbringen, wie ich mir vorstelle, dass ich in diesem, hier ist es bezeichnet worden als Narrative Creation Flow, vorgehen möchte. Das heißt, wie ich als kreative Person mich in diesem Prozess wohlfühlen würde. Also, stell dir vor, ich setze mich abends an den PC, habe noch ein bisschen Zeit, halbe Stunde, Stunde vielleicht, und möchte mir was überlegen. So. Dann mache ich mir die Karte auf, dann sehe ich, ich habe verschiedene, sehe, wo ich, was für Dörfer ich habe, für Städte ich schon errichtet habe, ein bisschen die Landkarte und genau. Kann dann zwischen denen dann sehe ich Verbindungen zu den einzelnen Orten. Und genau, kann dann überall draufklicken, auf die verschiedenen Orte, kann auch auf die Points of Interest dann wechseln, oder ich kann mir alles anzeigen lassen. Und worauf klicke, sehe ich dann recht schnell, was genau passiert da. Oder kann mir dann rechts irgendwo anzeigen lassen, ja, wahrscheinlich rechts irgendwo mit Info, was passiert hier. Also, gibt's da Events, gibt's da einen Encounter und so weiter. In der Stadt kann ich mir anzeigen lassen, was gibt es dort alles für Points of Interest, gibt's da einen Shop, die Beschreibung. Also dass ich den Überblick habe, okay, und dann kann ich da reingehen und kann sehen, oh, hier fehlt mir noch zum Beispiel eine Quest. So. Dann kann ich jetzt draufklicken, Quest createn, dann weiß die Quest direkt, okay, wo wird sie initiiert, sie kommt aus dieser Stadt. Sie wird in dieser Stadt initiiert. Ich kann dann auswählen, ob ich aus dieser Stadt, das wurde auch gleich geguckt, einen Charakter, der sozusagen hier festgelegt ist, als Questgeber, auswählen kann. Und ich kann mir gleich überlegen, okay, welchen Questgeber möchte ich haben? Naja, jemand, der hier in dieser Stadt wohnt oder der gerade in der Stadt hier ist. Irgendwer, der festgelegt wurde. Wenn noch nicht festgelegt wurde, dann kann ich entweder einen Platzhalter hinterlegen oder ich kann, ja, so placeholder-mäßig jemanden benennen. Weil ich möchte ja nicht direkt, wenn ich jetzt mal die Idee auf einer Quest habe, möchte ich nicht erst mal einen Charakter erstellen. Das heißt, diesen Schritt möchte ich, wenn möglich, teilweise überspringen wollen oder einen Platzhalter erstellen. Genau. Und dann würde ich als nächsten Schritt dann die Quest formulieren, würde sagen, wie, hey, in der Quest geht es darum, dass ich, weiß ich nicht, fünf Holz sammeln soll im nahen Wald. Das heißt, wenn ich die Quest dann akzeptiere, das heißt, ich muss ja nicht auch einen Dialog erstellen für den mit diesem Platzhalter-Charakter, in der er mir erklärt, worum es da geht. Das heißt, es wird dann ein Dialog geschrieben, der das Ganze erklärt, mit Informationen, Fragen, die ich stellen kann. Und dann auch die Information, okay, du hast diese Quest akzeptiert und, weiß ich nicht, wird freigeschalten. Das heißt, hier wird ein Effekt dann aktiviert oder ein Ort wird aufgedeckt, wie auch immer. Genau. Das heißt, als nächstes würde ich dann die Route zu diesem anderen Ort machen wollen, also wieder zurück Richtung Weltkarte oder World Builder, glaube ich, heißt es ja dann in der App. Und würde dann in diesem World Builder würde ich dann, was wollte ich gerade sagen? Würde ich dann die Route erstellen wollen, würde auf dem Weg dahin einen Encounter machen oder würde einfach nur kurz schreiben, ja, hier kommt ein Encounter. Das heißt, ein Encounter mit eventuell als Platzhalter. Aber würde mich dann wieder aufs Kreative ein bisschen fokussieren und würde dann den Ort, okay, wo findet statt? Das ist ein dunkler Wald. In der Nähe ist ein Berg und da ist eine Höhle, so. Das heißt, ich weiß, okay, in diesem Wald können auf jeden Fall Monster kommen. Das heißt, es wird irgendwie wie ein typisches Encounter-Szenario. Man hat irgendwie verschiedene Monster, muss sich durchkämpfen. Und dann zum Schluss hat man eine Point of Interest, wo man dann ankommt. Und, oder Location, was auch immer. Vielleicht ob Point of Interest die richtige Bezeichnung für ist. Und kann dann dort die Quest-Items finden. So. Oder in einem anderen Beispiel sammelt man die von den Monstern, die man da begegnet. So. Und dann gibt es einen kurzen Schwenk in Richtung der Höhle und dann sieht man, dass da noch was drin ist, bevor man das sammeln kann. Dann ist da ein Boss und dann hat man einen Kampf gegen, oder man kann irgendwie vor kurzem noch überlegen, ob man jetzt wieder rein möchte oder zurück möchte. Wenn man nicht vorbereitet ist, kann man wieder zurückgehen, kann aber auch rein und dann triggert das den Kampf. Das heißt, die Option muss irgendwie auch da sein mit einem Dialog. Und ja, was passiert als nächstes? Man hat dann den Boss besiegt, dann geht man rein, findet die Items und man findet was anderes. So. Wusch, kriegt man ein neues Item. Das heißt, hier möchte ich dann ein Item einfügen, weil man dieses Item dort findet. Das fällt mir aber gerade erst in dem Moment ein. Das habe ich nicht vorher überlegt, sondern das fällt mir halt kreativ, spontan in diesem Moment ein. Genau. Das heißt, hier dann schnell ein Item hinzufügen, sagen, ja, der Spieler findet Item XYZ. Das ist wichtig für, ja, weiß ich nicht, irgendwas anderes. Das heißt, das einfach irgendwie auch placeholder-mäßig dann erstellen, mit einer Referenz auf der Weltkarte sichtbar. Hier findet man das Item oder hier ist ein Event, was dann dieses Item irgendwie finden lässt. Irgendwie so. Und dann geht man zurück, gibt es ab und das triggert dann, dass man Ruf bei der Fraktion bekommt, also einfach die Quest-Belohnung. Und es triggert dann aber ein anderes Event, weil man das Item hat, dass sie jemand anders einen anspricht. So. Das wäre zum Beispiel eine Quest, die man machen muss, wo man verschiedene Ebenen hat, Monster, die man irgendwie kurz einmal irgendwie erstellen, aber zumindest näher spezifizieren kann sollte. Vielleicht hast du da eine gute Idee, wie man das da reinschreibt mit.

### Compact Creative Path

```text
Open the world map for a short creative session
  → Browse cities, villages, routes, POIs, events, encounters, and shops
  → Notice that a selected city needs a quest
  → Create a quest that inherits the city as its starting context
  → Choose a resident/present quest giver or name a placeholder
  → Write the premise: collect five wood in the nearby forest
  → Sketch the quest-giver dialogue, questions, and assignment
  → Reveal a place, route, or other effect when the quest is assigned
  → Return to the map without losing the quest context
  → Create the route toward the forest
  → Add a route encounter as a placeholder
  → Describe the dark forest, nearby mountain, cave, and monster pressure
  → Choose whether quest items come from a POI or monster drops
  → Reveal the cave and let the player enter or return to prepare
      → Enter
          → Trigger the boss encounter
          → Defeat the boss
          → Find the quest items
          → Spontaneously invent and place a new important item
      → Return
          → Leave the boss encounter available for later
  → Return to the quest giver and turn in the quest
  → Gain faction reputation
  → Possessing the newly found item causes another person to approach
  → Continue into a new event or quest idea
```

## Provisional Semantic Fixture

### Creative setup

The author has roughly 30–60 minutes in the evening and wants to explore the existing world until an idea appears. The session does not begin from a predefined quest form. It begins from spatial orientation and curiosity.

### Starting context

- Primary surface: World Builder/map.
- Selected context: an existing city or village.
- Visible context: connected locations, routes, POIs, shops, events, encounters, descriptions, and gaps.
- Desired support: a right-side context dock that answers “what already happens here?” quickly.

### Core author intention

Create a small quest journey from the place where the missing content becomes visible, while remaining free to introduce placeholder characters, encounters, monsters, POIs, items, dialogue, rewards, and follow-up hooks without completing each owning schema immediately.

### Immediate actions in the imagined player flow

- Talk to the quest giver.
- Ask questions and receive the quest; once given, it cannot be declined but may remain undone.
- Reveal or enable the destination/route/effect associated with assignment.
- Travel along the new or selected route.
- Encounter monsters on the way.
- Reach the forest/cave destination.
- Choose whether to enter the dangerous cave or return to prepare.
- Start the boss encounter when entering.
- Collect quest items after the boss or from ordinary monsters, depending on the authored variant.
- Discover an additional important item.
- Return and turn in the quest.
- Apply the quest reward.
- Trigger a follow-up approach/event because the player possesses the important item.

### Persistent state and later availability

- Quest assigned and recorded.
- Destination or route revealed/available.
- Boss still available if the player turns back.
- Boss defeated.
- Required quest-item progress or completion.
- Important item obtained and possessed.
- Quest completed.
- Faction reputation changed.
- Follow-up event or quest eligible because of the important item.

### Story placement candidates

- Quest introduction in the city.
- First forest/route encounter.
- Cave reveal and enter/return decision.
- Boss conflict.
- Important item discovery.
- Quest return and faction payoff.
- Follow-up character approach.

Story placement should remain optional during initial capture. The composer may suggest these moments later.

### Placeholder content

- Quest giver with a working name and role.
- Quest-giver dialogue outline.
- Forest route encounter.
- One or more monster concepts.
- Cave boss.
- Forest/cave POI or destination location.
- Quest resource item if it needs a canonical item record.
- Spontaneously discovered important item.
- Follow-up character and event/quest.

### Repeatability and failure questions

- Is quest assignment one-shot, or can the source interaction repeat without assigning it again?
- Can the route encounter repeat?
- Does declining the cave preserve the decision and allow later entry?
- Does leaving the cave reset anything?
- Can the boss encounter repeat after victory?
- Are quest items unique, counted inventory items, objective progress, or abstract completion state?
- Does losing or consuming the important item disable the follow-up event?
- Is the follow-up triggered immediately on pickup, on returning to town, or on entering a relevant location?

## Product Requirements Derived From Workflow 1

### The map is a creative starting surface, not only a placement editor

The author must be able to browse before deciding what to create. Selecting a location should expose a concise content inventory and meaningful gaps without opening several pages.

The context dock should distinguish:

- Content physically owned by or placed in the location.
- Content invoked there by POIs, events, routes, or encounter tables.
- Characters whose home is there.
- Characters canonically placed there at a story moment, if known.
- Content merely related by inference.
- Locally proposed content in the current creation flow.

“Lives here” and “is currently here” must not be presented as the same fact.

### New content inherits creative context

Creating a quest from a city should prefill a local origin context even where the current quest schema has no direct `location_id` field. The composer must preserve:

- The originating location.
- The selected map/POI context.
- The intended initiation point.
- The return path to the map.

During compilation, it must resolve that intention through honest records such as a POI, event, dialogue, story placement, or a future explicit quest-origin contract. It must not silently encode the city in a tag and call that implemented.

### Creation needs a protected return stack

The author repeatedly moves from map to quest to dialogue to route to encounter to item and back. This should feel like expanding one idea, not navigating unrelated pages.

Required behavior:

- Open scoped creation trays where practical.
- Preserve the Creation Flow draft across owning-workspace handoffs.
- Show a breadcrumb such as `Greyhaven → Wood For Winter → Forest Route → Cave Boss`.
- Offer **Return to flow** and **Return to map** without losing selection or scroll position.
- Carry the relevant placeholder and origin context into the owning workspace.

### Placeholder-first creation is essential

The author must be able to write “a forester,” “forest monsters,” “cave boss,” or “important item XYZ” and continue immediately.

Creating the full Character, Creature, Encounter, or Item record is a later resolution action. An unresolved placeholder is not an error during capture.

### New ideas can be inserted anywhere

The important item is invented only after the boss sequence already exists. The flow editor must allow a step to be inserted between existing steps without rebuilding downstream records or losing branch context.

It should support:

- Insert before/after.
- Add a parallel consequence after one outcome.
- Convert a note into an item/reward/event later.
- Preserve stable local step identity after reorder.
- Recompile proposed follow-up links deterministically.

### “POI or location?” should not block the idea

During capture, the author may describe “the cave,” “the forest clearing,” or “the place where the wood is found” without deciding its scale.

Resolution can offer:

- Existing location.
- New child location.
- POI inside the selected location.
- Encounter-table placement.
- Event-only destination.

The UI should explain the behavioral difference and recommend a default from context, while keeping the original wording.

### Quest assignment needs explicit semantics

The imagined flow treats receiving the quest as an action that can record it, reveal a route/location, and begin objective evaluation. Author review clarified that once the quest is given or discovered it cannot be declined; the player may simply leave it undone. The current model has quest requirements and completion flags but no clearly modeled assignment, turn-in, or reward-timing contract.

The canonical decision must distinguish:

- Quest becomes visible.
- Quest becomes available.
- Quest is discovered or assigned through dialogue/content and is recorded without a decline state.
- Quest objectives become evaluable.
- Assignment sets persistent state where required.
- Assignment reveals a route, location, POI, marker, or event where authored.
- Objectives are met.
- The player turns in through manual confirmation, a dialogue/person, or automatic completion.
- Rewards occur on objective completion or turn-in, with turn-in as the normal default.

### Objective progress needs more than description text

The current quest objective shape stores description, requirement, and completion flags. It does not canonically express “collect five units of this item,” acquisition source, progress count, or consumption on turn-in.

The workflow therefore creates a schema decision for typed objectives, for example:

```text
objective_type      collect_item | defeat | visit | interact | custom
target_id           item, encounter, character, location, or POI id
required_count      5
consume_on_turn_in  true/false
completion_policy   inventory | cumulative_acquired | explicit_event
```

Ordinary items and protected items use the same current-inventory count rule. Ordinary items may be spent, sold, consumed, or lost, causing progress to fall until they are obtained again. Quest items and explicitly unique artifacts are protected from ordinary disposal. Every required item needs a sufficient reachable acquisition source. Workflow 3 and Author Review 4 confirm this V1 direction; the plan owns the exact schema/export transcription.

### Item possession as a trigger needs honest semantics

Current requirements consume flags and faction reputation, not item possession. A paired “item obtained” flag could model permanent discovery, but it is not equivalent to “the player currently possesses the item.”

The composer must ask whether the follow-up means:

- The item was ever discovered.
- The item is currently in inventory.
- The item is equipped.
- The item was returned or consumed.

Only the first meaning maps honestly to a permanent discovery flag today. Current possession requires a new requirement/runtime contract or must remain unresolved.

## Lightweight Monster And Encounter Placeholders

The author's final question asks how monsters can be specified enough to preserve the encounter idea without forcing full creature creation. A useful local **Encounter Sketch** should capture dramatic and tactical intent rather than full stats.

Suggested minimal fields:

```text
Working name: Forest scavenger ambush
Where: Dark forest route near the cave
Why now: Pressure the player before the cave decision
Group shape: several common creatures plus one threatening variant
Roles: close pressure, ranged pressure, support, witness, boss, or custom
Behavior hook: attacks from cover / protects the resource / retreats toward cave
Player response: fight through, avoid, prepare, or investigate
Quest relationship: drops wood / guards wood POI / foreshadows boss
Reward or consequence: quest progress, clue, item, state, or none
Placeholder creatures:
  - 3 × “Forest scavenger” — close pressure
  - 1 × “Spore caller” — ranged/support pressure
```

All fields remain local until resolved into honest records. Resolution may:

- Reuse existing creatures matching the roles/habitat.
- Create minimal Creature Workshop drafts for missing roles.
- Create the encounter and keep unresolved participant slots.
- Place the encounter into a route binding or location encounter table.
- Attach quest-item drops only when a real loot/reward contract supports them.

This lets the author specify what the encounter should feel like and why it exists without choosing levels, abilities, combat profiles, or final creature identities during the creative pass.

## Current-Model Capability Map

| Workflow intention | Current support | Gap or caution |
|---|---|---|
| Browse locations, routes, POIs, events, encounters, and shops | Largely supported by World Builder and context packets | Needs a faster content/gap summary optimized for ideation |
| Create quest from selected city | Quest can be created | Quest has no direct origin location or quest-giver field |
| Suggest residents as quest givers | Character `home_location_id` can identify residents | “Currently present” needs explicit story/runtime occurrence evidence |
| Use placeholder quest giver | Local draft can preserve it | Cannot commit as a canonical character reference until resolved |
| Describe collect-five-wood objective | Objective description supports prose | Typed item target/count/progress semantics are absent |
| Create explanatory dialogue | Dialogue authoring is supported | Quest assignment and turn-in relationships need explicit linking semantics |
| Reveal route after assignment | Route requirements are supported | Assignment needs a persistent producer and exported action contract |
| Add route encounter | Route event bindings and encounter events are supported | Scoped placeholder handoff is needed |
| Create forest/cave place | Locations and POIs are supported | Author should not need to choose the scale during capture |
| Collect quest items from POI | POI can reference one item | Quantity/progress/turn-in behavior is not modeled by that reference alone |
| Collect ordinary or protected items from monsters | Loot/reward sources exist in other systems | Current-inventory counting, protection, sufficient source quantity, and turn-in consumption need explicit contracts |
| Enter cave or return | Dialogue choice can express the decision locally | Choice-specific runtime transition needs immutable choice identity |
| Trigger boss on entry | Encounter event/POI reference can invoke the boss | Outcome and re-entry semantics need runtime confirmation |
| Discover important item after boss | Encounter/event reward or POI item placement is supported | Timing and acquisition source must be chosen explicitly |
| Show item source on map | Item journey and POI/location context can derive this | Must distinguish canonical placement from inferred display |
| Grant faction reputation on turn-in | Quest reputation rewards are supported | Reward timing and manual/dialogue/automatic turn-in mode need explicit export fields |
| Trigger follow-up because item is possessed | Permanent discovery can be approximated with a flag | Current possession is not a supported requirement condition |

## Acceptance Scenarios From Workflow 1

### W1-A: browse and begin without a form-first decision

Given the author opens World Builder with a city selected, they can see the city's directly owned, invoked, inferred, and locally proposed content in one dock and start **Create something here → Quest** without losing the map context.

### W1-B: inherit context and defer the quest giver

The new quest draft remembers the city as its intended initiation context, suggests residents separately from story-present characters, and accepts a named quest-giver placeholder without opening Character Studio.

### W1-C: expand one idea across workspaces

The author can add dialogue, route, encounter, place, boss, item, reward, and follow-up steps to the same Creation Flow draft. Specialized handoffs return to the same step and map context.

### W1-D: insert a spontaneous important item

After drafting the boss outcome, the author can insert “player finds Item XYZ,” create a local item placeholder, attach a provisional acquisition location/event, and continue to quest turn-in without completing Item Authoring.

### W1-E: preserve the cave choice

The author can represent **Enter cave** and **Return to prepare** as separate branches. Rehearsal shows that returning does not complete or remove the boss opportunity.

### W1-F: distinguish discovery from possession

When the author says another person approaches “because the player has the item,” the composer asks whether this means ever discovered or currently possessed and refuses to compile current possession into a permanent discovery flag without acknowledgement.

### W1-G: sketch monster intent without full creature records

The author can add encounter roles, group shape, behavior hook, quest relationship, and named creature placeholders. The draft remains valid locally and later offers reuse or Creature Workshop promotion.

### W1-H: distinguish ordinary and protected collection items

The author can require a current quantity of an ordinary item without making it a Quest item. Preview warns or blocks when no sufficient acquisition source exists, explains that spending or losing ordinary copies reduces progress, and separately preserves universal protection for Quest items and explicitly unique artifacts.

## Review Findings After Workflow 1

- This workflow strongly supports making the World Builder an origin surface for Creation Flow, not only embedding **Then…** in Dialogue Flow.
- It introduces **context inheritance** and **protected return** as first-class requirements.
- It demonstrates that placeholders are needed for characters, encounters, creatures, locations/POIs, items, dialogue, and follow-up events—not only one entity type.
- It suggests that the plan's likely event extension is not sufficient by itself. Quest assignment, typed objectives, current item possession, and durable branch outcomes require separate schema/export decisions.
- At this point it provided a test for whether a first-class playable sequence would become necessary. The completed corpus later selected Option B without a universal runtime sequence model.
- The later reference workflows and author reviews completed the required comparison before typed quest-objective and transition schema implementation.

## Workflow 2: Giving An Underdeveloped Place A Story

Source: German dictated workflow supplied by the author on 2026-07-15.

### Original Author Narrative

> So, weiteres Beispiel für den Workflow könnte sein, dass man sich eine Stadt anguckt wieder im Worldbuilder und dann merkt, hm, so richtig hatten wir jetzt für diese Stadt oder diesen Ort, kann auch ein Ort oder eine Region, noch keine Story. Also man hat irgendwie, ja, der geht da hin und es gibt da irgendwie was zu holen, aber was macht diesen Ort eigentlich aus? Und dazu gehören für mich aber Charaktere, es gehört eine Geschichte, wie kommt es dazu? Da gehört es dazu, dass man also, ja, Charaktere erstellt, dass man eine Fraktion erstellt, dass man klarstellt, was da passiert ist, also ein bisschen Lore mit reinbringt, eventuell Gegenstände erstellt, die in dieser Lore vorkommen, dass man neue Orte erstellt, die dann mit dazukommen. Was würde ich als nächsten, wie die Sachen alle so ein bisschen aufschreiben. Ich würde, was würde ich als nächstes machen? Also, noch mal von Anfang angefangen, ich würde die Weltkarte aufmachen, also Worldbuilder aufmachen, würde schauen, dass ich mir dann einen Ort anschaue, würde dort irgendwie Lore-Texten hinzufügen und basierend auf dem Lore dann die Charaktere erstellen wollen, die daran vorkommen, wenn sie noch leben, wenn sie nicht leben. Wenn sie nicht mehr leben, kann man auch von Ort hinzufügen, wo sie gestorben sind, dass man dort einen Item findet oder dass man dort was erfährt darüber. Wenn da ein Kult dann ist, ist eine neue Fraktion, die auftaucht, die hat dann wieder einen bestimmten Boss, die hat bestimmte Gegnertypen, die man definieren muss oder erstmal Platzhalter aktiviert. Die müssen dann bestimmte Encounter in dieser Region auf jeden Fall erstellt werden. Dann gibt es aber auch Bosskämpfe da drin, dann gibt es einen Dungeon, der erstellt werden muss. Dafür gibt es irgendwie eine Quest, es gibt dann eine Charaktere, der da drin ist, den man als Companion haben kann. Dann gibt es aber lore-technisch sind die auf der Suche nach irgendeinem magischen, starken Relikt aus vergangenen Zeiten, das dann wiederum in den Kriegen genutzt wurde. Das heißt, ich möchte das einfügen in die ursprüngliche Timeline-Lore oder in die, ja, Lore der Welt-Lore sozusagen. Dann sollen da aber bestimmte Möglichkeiten geben für den Charakter, Items zu farmen oder was auch immer, irgendwie sowas in die Richtung. Er kann sich aber auch mit der Fraktion, kann ich mit der Gutstellen, vielleicht gibt es auch eine andere Fraktion, mit der ich gutstellen kann. Dann gibt es da Dialoge, für so eine Freiheitskämpfer oder was auch immer. Also, die dagegen aufgehen, ja. Sowas wäre auch eine Möglichkeit, wie ich vorgehen würde. Dann kann ich mir schon über die Ideen machen, wofür das hin, wo müssen die wieder auftauchen, wann kann der Charakter dann das erste Mal aufzukommen. Würde das dann in einem bestimmten Chapter tun wollen, in einem bestimmten Kapitel, genau. Vielleicht sowas wäre auch ein möglicher Workflow für den Abend.

### Compact Creative Constellation

```text
Open World Builder and inspect a city, place, or region
  → Notice that it has content but no identity or meaningful story
  → Start “Expand this place” with the selected place as the story seed
  → Write lore about what happened here and why the place matters
      ↔ Create or name characters mentioned by the lore
          ↔ Mark whether they still live
          ↔ If dead, connect their death to a place, clue, or discoverable item
      ↔ Create the cult/faction involved
          ↔ Name its boss
          ↔ Sketch its enemy types
          ↔ Place recurring regional encounters
      ↔ Create the dungeon and boss encounter
          ↔ Create the quest leading into it
          ↔ Create a recruitable companion found there
      ↔ Create the ancient magical relic the cult seeks
          ↔ Place it into older war/history lore and the world timeline
      ↔ Add repeatable item-farming opportunities
      ↔ Create an opposing faction or freedom fighters
          ↔ Write their dialogues and alliance path
  → Decide where these people and factions reappear later
  → Decide when they are first introduced
  → Place the regional story into a chapter
```

Unlike Workflow 1, most arrows here mean **belongs to or grows from the same story seed**, not **executes immediately afterward**.

## Provisional Semantic Fixture

### Creative setup

The author has another short evening session and begins by exploring the existing map. They discover a qualitative gap: the selected place may already contain loot or traversal content, but it lacks identity, history, people, conflict, and a reason to remember it.

### Starting context

- Primary surface: World Builder/map.
- Scope: a city, location, group of child locations, or region.
- Existing content: potentially routes, loot, POIs, and mechanical reasons to visit.
- Missing content: a coherent local story ecosystem.
- Desired first action: **Expand this place**, not “create one specific record.”

### Core author intention

Write enough lore to discover who, what, and which conflicts belong to the place; preserve every emerging idea as a connected placeholder; then decide which ideas become present-day playable content, historical world lore, recurring systems, or later chapter appearances.

### Story-seed branches

#### Place identity and history

- What happened here?
- Why does it still matter?
- Which older war or era shaped it?
- What evidence remains in the environment?
- Which relic, location, death, or faction connects past and present?

#### Characters

- Living characters who currently inhabit or visit the place.
- Historical/dead characters mentioned by the lore.
- A cult boss.
- A recruitable companion in the dungeon.
- Freedom fighters or members of an opposing faction.
- Later appearances and first introduction timing.

#### Factions and choices

- A cult with purpose, leader, enemy types, and regional influence.
- A possible opposing faction or freedom fighters.
- The player's ability to improve relations with one or both.
- Dialogue and quest content expressing those choices.

#### Playable content

- Regional encounters using cult enemy types.
- One or more boss encounters.
- A dungeon.
- A quest that leads into the dungeon and local conflict.
- A companion recruitment opportunity.
- Repeatable item acquisition or farming opportunities.

#### Lore objects and historical continuity

- A powerful magical relic from an earlier age.
- Its use during past wars.
- The cult's present search for it.
- Where the player first learns about it.
- Where it appears later in the story.
- Its placement in world-history lore and the playable chapter structure.

### Immediate runtime actions

This workflow does not initially define a complete runtime sequence. Immediate actions emerge later as quests, dialogues, dungeon entry, encounters, boss outcomes, recruitment, faction choices, and item acquisition are resolved.

### Persistent state and later availability

- Knowledge of historical lore discovered.
- Faction reputation or allegiance changes.
- Boss and encounter outcomes.
- Dungeon availability/completion.
- Companion introduction, recruitment, departure, or return.
- Relic discovery/possession/state.
- Chapter-specific introductions and later reappearances.

### Story placement candidates

- Historical war and relic use in a world-history timeline.
- Death of a historical character at a specific location.
- Founding/rise of the cult.
- First present-day signs of the cult.
- First introduction of the companion.
- Dungeon quest and boss conflict.
- Faction decision.
- Relic reveal or acquisition.
- Later reappearances in subsequent chapters.

### Placeholder content

- Lore passages and historical events.
- Living and dead characters.
- Cult and opposing faction.
- Cult boss and enemy archetypes.
- Regional encounters.
- Dungeon and internal POIs.
- Dungeon quest.
- Recruitable companion.
- Ancient relic and related historical items.
- Farming sources and rewards.
- Dialogue scenes.
- Chapter/story-arc placements.

## Product Requirements Derived From Workflow 2

### Creation Flow needs two composition shapes

Workflow 1 is mostly a **sequence**: this happens, then that happens, with branches and outcomes.

Workflow 2 is mostly a **constellation**: these characters, factions, places, relics, historical moments, and playable packages belong to one regional story seed.

The product should therefore support:

1. **Sequence mode — “What happens next?”**
2. **Story Seed mode — “What belongs to this idea/place?”**
3. **Promotion between them** when a constellation branch becomes a playable quest, dialogue, encounter, or event sequence.

Story Seed mode must remain scoped to one selected place, conflict, lore idea, or chapter. It must not become a universal project graph.

### Add “Expand this place” to World Builder

From a selected city, place, or region, the author should be able to start a local story seed that inherits:

- Selected location and parent/child scope.
- Existing lore.
- Known characters and factions.
- POIs, routes, encounters, shops, quests, and items already placed there.
- Story/timeline occurrences.
- Current gaps and unresolved local proposals.

The initial prompt should be creative and broad:

> What makes this place matter?

Optional prompts may ask about history, people, conflict, evidence, present danger, reward, and future consequence, but they should not become required form fields.

### Lore text should be able to grow references

The author wants to write lore first and create the mentioned people, factions, objects, and places afterward.

The lore editor should allow selected text or an inline mention to become a local reference candidate:

- **Make “The Ash Regent” a character placeholder**
- **Make “The Veiled Choir” a faction placeholder**
- **Make “The Crown Beneath” an item/relic placeholder**
- **Make “The Hollow Basilica” a location/dungeon placeholder**
- **Make “The War of Glass” a historical moment placeholder**

This can be a deterministic selection action. It does not require automatic entity extraction or AI. Suggestions may be added later, but the author confirms every new reference.

The original lore text remains readable prose. References are stored separately; markup must not corrupt the text or rely on names as immutable identity.

Authors may also create the same reference candidates as free-standing idea cards before exact prose exists. Selecting a prose span creates or links such a card; it does not create a second placeholder. Cards and text mentions are therefore two authoring views over one local idea identity, allowing brainstorming to move directly toward later resolution and implementation without manual transcription.

### One timeline needs distinct history, discovery, and playable lenses

The workflow moves between:

- Past wars and relic use.
- A historical character's death.
- Present-day cult activity.
- The player's current chapter.
- Later reappearances.

The author confirmed that these belong to one overall world timeline. The authoring surface should show distinct lenses within that chronology:

- **World history** — when eras, wars, deaths, origins, and old relic states actually occurred.
- **Player discovery** — when the player can learn about earlier history through lore, evidence, dialogue, or items.
- **Playable story** — the part of the timeline the player inhabits directly through chapters/arcs, quests, encounters, choices, and consequences.

Lore can reference a historical timeline today, and adventure beats can place entities in playable story order. The unified view must preserve both occurrence time and discovery/play time without treating chronological adjacency as an executable transition.

### Living, dead, and remembered characters need honest modeling

The author may create a character solely because lore names them, even if they died before the playable story.

The draft should capture:

- Historical or present-day role.
- Alive, dead, missing, unknown, undead, or other author wording.
- Death/disappearance moment if known.
- Associated location.
- Evidence left behind: item, lore, POI, event, descendant, or faction legacy.

Current lifecycle-aware story links can represent a character dying at an adventure beat, and the same beat can link a location and item. They do not provide a simple canonical “current life status” field or a direct `death_location_id`. The composer should use linked occurrences where appropriate and leave stronger status semantics unresolved until deliberately modeled.

### Build regional antagonists as a package

Creating a cult implies more than one faction row. The local story seed should hold a proposed package:

- Faction identity, belief, goal, visual/motif notes, and relationship intentions.
- Leader/boss placeholder.
- Common, elite, support, and specialist enemy-role placeholders.
- Habitat/region association.
- Recurring encounter sketches.
- Dungeon/boss payoff.
- Relic or objective pursued.
- Player-facing clues and early appearances.

Each part can later resolve through Faction, Creature Workshop, Encounter Stage, World Builder, Item Authoring, Lore, and Story Timeline without losing the package context.

### Dungeon creation should begin as a playable-place brief

The author should not need to build every room before connecting the dungeon to the regional idea.

A local dungeon placeholder can capture:

```text
Working name
Parent region/location
Why it exists in the lore
Entrance/reveal condition
Major areas or POIs
Enemy family/faction
Boss and stakes
Quest/companion relationship
Relic, rewards, and farming sources
Exit/aftermath
```

Resolution may create a child location, routes/doors, POIs, encounter tables, event triggers, and story placements through their owning contracts.

### Companion capability and recruitment are different

The current model contains companion-oriented interaction/combat configuration, which can describe that a character is usable as a companion. The workflow additionally needs the story action through which the character joins.

The composer should distinguish:

- This character can function as a companion.
- This is where the character is introduced.
- These conditions allow recruitment.
- This choice/event causes the character to join.
- This is where they may leave, die, or return.

Lifecycle links can describe `joins`/`leaves` in story placement, but runtime party membership and recruitment conditions require an explicit runtime/state contract.

### Faction friendliness needs a path, not only a number

Reputation requirements and rewards can model thresholds and changes. The story seed should additionally preserve:

- Why the player might support this faction.
- Which quests/dialogues create or close that path.
- Whether factions are mutually exclusive.
- Consequences for the region, companion, dungeon, or relic.
- Later acknowledgement and reappearances.

Do not infer an exclusive allegiance merely from positive reputation with one faction and negative reputation with another.

### Farming content is a loop, not a story beat

The author wants places where the player can repeatedly obtain items. Creation Flow should distinguish:

- One-time authored acquisition.
- Repeatable encounter/loot source.
- Shop/restock source.
- Resource-node/POI source.
- Quest reward.
- Story-important relic acquisition.

Farming loops may be connected to the same regional story seed without being forced onto the story timeline or linear **Then…** chain.

### First appearance and chapter planning need explicit support

The author wants to decide where characters/factions first appear and in which chapter the regional content belongs.

The composer should offer:

- Place first introduction in an existing adventure beat/story arc.
- Create a local chapter/arc placeholder.
- Mark later intended reappearances as local planning notes.
- Promote those notes into canonical beats/links when ready.
- Warn when a major character/faction has several usages before any canonical introduction.

The current model has story arcs, timelines, and adventure beats but no dedicated general `chapter` record. Product review must decide whether “chapter” is author-facing grouping over story arcs/beats or a new canonical concept.

## Current-Model Capability Map

| Workflow intention | Current support | Gap or caution |
|---|---|---|
| Inspect a city/place/region and its content | World Builder, location hierarchy, and context packets support much of this | Needs story-identity/gap summary and a scoped story-seed draft |
| Add lore to a place | Lore entry supports `location_id` | Inline durable references to mentioned entities are absent |
| Place lore in world history | Lore entry supports `timeline_id` and related story arcs | Historical events inside an era are not as richly modeled as adventure beats |
| Create living/historical characters | Character records are supported | Life status and historical-only intent need explicit semantics |
| Record where a character died | Character lifecycle link and location link can share a beat | No direct death-location field or simple current-status contract |
| Leave an item/clue at the death place | POI item/lore/event references are supported | The causal relationship must be authored, not inferred from co-location |
| Create a cult or opposing faction | Faction records and relationships are supported | No focused faction-story package or allegiance-path model |
| Create boss/enemy types | Creature Workshop and combat profiles support resolved creatures | Local enemy-family/archetype placeholders remain necessary |
| Require regional encounters | Encounter tables, route bindings, POIs, and events support placement | Coverage intent such as “must recur across region” is local planning unless modeled |
| Create a dungeon | Location hierarchy, routes, POIs, and encounters can compose it | No single dungeon brief/package currently owns the whole idea |
| Create a quest for the dungeon | Quest creation is supported | Origin, giver, assignment, turn-in, and mixed-content path gaps from Workflow 1 remain |
| Make a character companion-capable | Interaction profile and combat-profile companion config support capability | Recruitment/join runtime transition is not fully modeled |
| Create an ancient relic | Item and lore records support the object and prose | Historical item-state continuity relies on story links and notes |
| Let an ancient relic awaken, corrupt, or be restored over time | The same item can be referenced repeatedly in story placement | No canonical stable-identity item variant or executable activation contract exists |
| Connect relic to an old war | Lore timeline and story links can provide context | World-history event granularity and ordering need review |
| Add repeatable farming | Loot, encounters, shops, and resource POIs provide sources | Repeat/restock/drop behavior varies and must not be inferred uniformly |
| Support faction alignment | Reputation rewards and minimum-reputation requirements are supported | Exclusive allegiance and faction-story branching need explicit state/flow design |
| Plan first and later appearances | Adventure beats/links and entity occurrence tracks support canonical placements | Local future-intent notes and chapter semantics need a better capture surface |

## Acceptance Scenarios From Workflow 2

### W2-A: identify a story gap and expand the place

Given a city, location, or region with mechanical content but weak story identity, the author can start **Expand this place**, write why it matters, and see a scoped local constellation without selecting a target schema first.

### W2-B: grow placeholders from lore prose

While writing lore, the author can select a mentioned name or phrase and create a typed character, faction, item, location, or historical-moment placeholder. The prose remains intact and the placeholder appears in the same story seed.

### W2-C: connect a dead historical character to place and evidence

The author can mark a character as historically dead in the draft, describe where they died, and attach a discoverable item/lore clue there without being forced to pretend that story placement alone implements current runtime state.

### W2-D: sketch a complete cult package without resolving every record

The author can preserve the cult, boss, enemy roles, regional encounter intentions, dungeon, quest, relic goal, and opposing faction as one local package. Any subset can later be promoted through its owning workspace while the rest remains connected placeholders.

### W2-E: distinguish companion capability from recruitment

The author can mark the dungeon character as companion-capable and separately sketch the introduction, recruitment conditions, join outcome, and later presence. Preview explains which parts compile today and which remain runtime/state work.

### W2-F: connect ancient history to the playable chapter

The author can place the relic and its wartime use in world-history context, then separately plan its present-day reveal, cult pursuit, dungeon payoff, and later chapter reappearance without treating both timelines as one executable chain.

### W2-G: keep farming loops outside forced story order

The author can attach repeatable item sources to the regional story seed while leaving them outside the canonical story timeline and distinguishing them from one-time relic acquisition.

### W2-H: plan faction alternatives and introductions

The author can sketch cult and freedom-fighter paths, dialogues, reputation changes, exclusivity questions, first introductions, and later appearances before committing flags, requirements, or chapter placements.

### W2-I: evolve one unique artifact without duplicating its identity

The author can create an awakened, reforged, corrupted, restored, or custom progression variant from a unique relic's current form. Lore, quests, acquisition history, and story occurrences continue to reference the same artifact; explicit replace/add/remove operations describe changed effects and modifiers. Ordinary duplicated inventory items do not gain per-instance variants in V1.

## Cross-Workflow Findings After Workflows 1 And 2

- World Builder is a primary creative origin surface in both examples.
- The selected place provides context, but the creative output may become a temporal sequence or a parallel story constellation.
- **Then…** remains the right gesture for execution and consequence chains.
- **Expand this place** is the better gesture for lore-first ecosystem building.
- Both shapes need the same placeholder system, context inheritance, protected return, local autosave, snapshots, and reviewed promotion.
- A story constellation branch should be promotable into a **Then…** sequence without copying or renaming its placeholders.
- The author repeatedly discovers entities while writing; entity-first forms cannot be the only creation path.
- World history and the playable era share one overall chronology but need different occurrence/discovery/play lenses; repeatable gameplay loops remain outside forced chronological order.
- The current event extension remains relevant for runtime sequences, but it cannot serve as the sole intermediate representation for lore-first creation.
- The capture contract should therefore support `sequence`, `constellation`, and `hybrid` draft shapes while keeping canonical compilation scoped and explicit.
- At this two-workflow stage, canonical sequence, chapter, typed objective, item-possession, recruitment, and historical-event changes remained gated. Workflow 3 and Author Review 4 later close or narrow those V1 gates.

## Review Notes From Workflow 2 — Current Status

- Use **Expand this place** as the V1 entry label and **Story Seed** as the local draft concept; wording may still be refined after author testing without changing the data contract.
- Selected-text promotion and linked idea cards are both required and share one placeholder/reference identity, confirmed in Author Review 6.
- Region means a canonical `LocationType.Region` hierarchy node below a Continent, resolved in Author Review 4.
- Determine whether historical characters need a canonical life-status field or whether lifecycle occurrences plus a derived “latest known state” are sufficient.
- Ordered era Timelines preserve historical occurrence separately from playable-present discovery, confirmed in Author Review 5.
- Companion recruitment has a confirmed typed web/export action; actual runtime party-state execution remains an external integration audit.
- Compare the next workflow before changing the provisional Creation Flow draft contract. **Completed by Workflow 3 and Author Review 4.**

## Author Review 1: Runtime And State Decisions

Source: answers to the plan's first ten behavioral questions, supplied by the author on 2026-07-15.

### Confirmed behavior

1. **Trade dialogue opens the shop immediately.** The player selects a trade option, the dialogue closes, and the shop UI opens.
2. **Dialogue-triggered encounters start immediately.** There is no save/pause gap between selecting the action and entering the encounter.
3. **Retreat happens before the encounter.** Where retreat is plausible, the dialogue offers **Retreat for now** or **Look for an exit**. Choosing it closes the dialogue and returns to the originating map, POI, character, item, or other view. The player may interact again later.
4. **Forced encounters may omit retreat.** If retreat would be narratively absurd, the encounter can lock in, but the player should have received warning and an earlier opportunity to save or prepare.
5. **Encounter outcomes are victory and defeat for V1.** Victory may continue through authored consequences; defeat enters a retry/load/respawn policy rather than an ordinary narrative continuation. More outcome types are intentionally deferred.
6. **Quest surfacing has several meanings.** A quest may be discovered because the player previously heard something and later finds the relevant place, offered by an NPC, and/or represented by a newly visible map marker.
7. **Collection objectives use current inventory.** “Collect five wood” is satisfied when five required items are currently in inventory.
8. **Important content items are quest items.** They are normally non-consumable and non-sellable, so current possession can be used as meaningful quest state.
9. **Companions commonly join through dialogue.** A dialogue option causes the character to join the party.
10. **Cities can have state variants.** At minimum an intact and damaged presentation may differ in description, shops and inventory, visible inhabitants, and POIs.
11. **History and playable story share one timeline.** The player occupies one part of the world's chronology and can discover the broader history of the universe.

### Direct implications for Workflow 1

- The cave decision's retreat branch ends the dialogue, returns to the cave/POI context, and leaves the interaction available for later.
- Entering the cave closes the decision dialogue and starts the boss encounter immediately.
- The boss requires a victory consequence branch and a defeat policy in the first release.
- The five-wood objective checks current inventory quantity rather than cumulative acquisition.
- A quest item that triggers a follow-up should be protected from sale/consumption; current possession is the intended condition.
- Quest discovery, NPC offering, and marker revelation must remain separate author actions even when one quest uses several of them.

### Current-model consequences

- Item type `Quest` already exists, but the current item schema does not explicitly enforce non-consumable or non-sellable behavior.
- Requirements currently evaluate flags and faction reputation, not current item quantity/possession.
- Dialogue choices need immutable identity before they can own stable shop, encounter, or companion-join transitions.
- Encounters do not provide a complete defeat-policy export contract.
- Character lifecycle `joins` can record story meaning but does not itself implement party membership.
- Locations have no canonical intact/damaged variant or override system.
- Items have no canonical stable-identity variant system for evolving presentation, effects, requirements, or modifiers.
- Current lore timelines and adventure beats need a unified chronology view with occurrence and discovery semantics.

### Questions remaining at that point

Several questions below were subsequently resolved by Author Reviews 2 and 3; they are retained here as review history rather than current blockers.

- What happens when an immediately opened shop closes?
- What exact runtime result follows encounter defeat?
- When does a discovered/offered quest enter the journal or become active?
- Are quest-item protections universal defaults or author-overridable? **Resolved by Author Review 2: universal.**
- How are active location, character, and item variants switched, persisted, restored, and exported?
- How should the author link or describe the earlier save/preparation opportunity before a forced encounter?

## Author Review 2: Nested Interaction, Defeat, Journal, And Variants

Source: follow-up answers supplied by the author on 2026-07-15.

### Confirmed behavior

1. **The shop is nested inside the dialogue interaction.** Selecting trade temporarily replaces/hides the dialogue with the shop. Closing the shop returns to the same dialogue so the player can ask more questions, receive a quest, or trade again. The interaction does not end.
2. **Discovered quests enter the journal automatically.** The player receives information about what needs to be done. The log is not capacity-limited and should be organized by useful context such as region, city, and associated person.
3. **All quest items are universally protected.** They cannot be ordinarily consumed or sold. The quest system may remove them when the quest is completed or turned in.
4. **World changes need executable activation and timeline meaning.** A city becoming damaged is both something that must be triggered in runtime and an important story moment.
5. **Characters also need state/progression variants.** The same person may have an early, later, stronger, injured, or changed-allegiance presentation without becoming an unrelated duplicate character.
6. **Legendary and custom items also need state/progression variants.** The same mighty artifact may be dormant, awakened, reforged, corrupted, restored, or otherwise changed over time without becoming an unrelated duplicate item.

### Refined implementation meaning

#### Nested shop interaction

The shop action needs a continuation frame rather than a one-way event transition:

```text
Dialogue session at trade choice
  → suspend dialogue session
  → open shop
  → close shop
  → resume the same dialogue session
```

The runtime must remember the current dialogue/node context and which effects have already been applied. Returning from the shop must not grant rewards, set flags, or replay dialogue-entry consequences a second time.

#### Event and story beat are complementary

- The **event/action** changes the active location, character, or item variant in executable game state.
- The **story beat** places and explains that change in the unified timeline.

For example, defeating the portal boss may activate the damaged-city variant and also create the timeline moment “Greyhaven After the Portal Assault.”

#### Stable identity with variants

The author's practical instinct is to copy the earlier city, character, or item and edit the copy. The authoring tool can preserve that convenience through **Create variant from current**, while keeping one logical identity underneath.

This avoids separate unrelated records such as “Rosner Beginning” and “Rosner End” when both are the same person, or “Ashblade Dormant” and “Ashblade Awakened” when both are the same artifact. A variant may change description, appearance, faction/allegiance, level, combat profile, available dialogue, shops, inhabitants, POIs, item rarity, effects, requirements, modifiers, icon/presentation, or other explicitly supported state-specific fields.

Separate canonical entities remain appropriate only when they are genuinely distinct beings, places, or objects. Independently ownable copies, replicas, coexisting fragments, and successor artifacts remain separate items; ordinary evolution of one unique artifact does not.

### Defeat and saving remain a design decision

The current direction is that defeat returns the player to a respawn/save reference rather than continuing from the defeated encounter. The exact rollback policy is not yet confirmed:

- Restore the exact last manual save.
- Retry from an automatic pre-fight checkpoint.
- Respawn at an anchor while keeping selected progress.
- Restart a dungeon or challenge run.

The existing location model already supports `has_respawn_point`, but this is only a world-location marker. It does not define what state is saved, restored, or retained.

### Recommended default for this game

Because the game is intended to be story-heavy and dialogue-heavy, the recommended default is:

- Manual saving in safe non-combat states.
- Automatic checkpoint immediately before forced/boss encounters.
- **Retry encounter** from that checkpoint after defeat.
- **Load another save** as a secondary option.
- Whole-dungeon repetition only for content deliberately authored as a challenge run.

This avoids losing substantial dialogue, exploration, and worldbuilding progress while retaining meaningful respawn points and optional harsher encounter policies.

### Quest recording and in-game journal boundary

The confirmed authoring requirement is that a discovered or assigned quest is recorded automatically and cannot be declined; the player may leave it undone. The web app must export assignment, objective completion, turn-in, and reward timing. Tracking, hiding, notifications, journal capacity/presentation, and abandonment UI are in-game concerns and are not implemented as part of this web workflow unless a later data requirement makes them relevant.

### Questions remaining after Review 3, resolved or narrowed by Review 4

- Approve or change the recommended automatic pre-fight checkpoint and retry default.
- Define which state a respawn-with-persistence policy retains.
- Decide whether authors may disable automatic checkpoints for forced encounters.
- Finalize the explicit field lists for location, character, and item variant tables and their DataTable exports.

## Author Review 3: Pre-Implementation Contract Decisions

Source: author feedback on the pre-implementation ambiguity/conflict review, supplied on 2026-07-15.

### Confirmed behavior and scope

1. **One additional workflow will be supplied before canonical schema approval.** Capture design may continue, but the corpus gate remains open for canonical grouping decisions.
2. **Nested shop handoff is a dialogue-choice action.** A stable choice owns `open_shop` plus `resume_source_dialogue`; it is not modeled as ordinary dialogue completion.
3. **Defeat does not continue into a normal narrative consequence.** It invokes a retry/load/respawn policy. The exact restore target still needs final selection.
4. **Committed flows are project-local durable authoring records.** Work in progress may autosave in the browser, but commit stores a flow manifest and step/artifact provenance in project data. The manifest is not a runtime DataTable.
5. **V1 variants use a base entity plus one active progression variant.** Temporary combinable conditions stay separate. Item variants initially apply to explicitly unique/story-artifact items, not individual copies of ordinary stacked items.
6. **Quests cannot be declined after discovery or assignment.** They are recorded and may simply remain undone. V1 does not need a separate accepted/declined state.
7. **Quest rewards support two timings.** Rewards may occur when objectives are met or on turn-in; turn-in is the normal default. Turn-in may be manual confirmation, dialogue with the associated person, or automatic completion.
8. **Collection objectives may target ordinary items.** Losing, consuming, spending, or selling an unprotected item lowers current-inventory progress and requires reacquisition. A sufficient acquisition source must exist.
9. **Quest items and explicitly unique artifacts are protected.** They cannot be removed through ordinary player sale, consumption, or disposal, though authored system turn-in may remove them.
10. **This repository implements authoring and export contracts, not Unreal execution or in-game UI.** It should output honest DataTable-ready structures. Applying shop handoffs, retry/load behavior, quest-journal presentation, variants, and other runtime effects belongs to the consuming game implementation.

### Still open after this review

- Additional workflow: supplied as Workflow 3; consequences are ordered and atomically committed by default.
- Defeat default: automatic pre-fight save and retry; author may override with a respawn point.
- Chapter: existing Story Arc. Region: hierarchy node below Continent. Timelines: ordered era records.
- Variant families: semantic field scopes confirmed in Review 4; exact database/table serialization remains implementation work.

## Author Review 4: Defeat, World Structure, Variants, And Commit Boundaries

Source: author feedback supplied together with Workflow 3 on 2026-07-15.

### Confirmed behavior and scope

1. **Pre-fight save is the default defeat policy.** The game saves immediately before the fight. Defeat returns the player directly before the encounter, where a short lead-in dialogue can be invoked again or the encounter can be restarted from its interaction/button.
2. **Authors may override defeat with a respawn point.** Each encounter may choose pre-fight retry or a linked respawn point. State retained by respawn is deferred to the consuming runtime and is not required for the initial web contract.
3. **Story Arcs are Chapters.** V1 does not add a separate Chapter entity.
4. **Regions are hierarchy nodes below Continents.** A Region groups several settlements, forests, dungeons, and other places. Countries are not required for the current world structure.
5. **Timeline records represent eras.** Several ordered timelines may exist; the last or explicitly current era contains the main character's playable present.
6. **Location variants preserve place identity and position.** The stable location name, hierarchy identity, Region/Continent membership, and coordinates remain on the base place. Description, size/presentation scale, inhabitants, quests, availability/visitability, respawn behavior, services, POIs, encounters, and related content may vary.
7. **Character variants may change almost all presentation and gameplay configuration.** Displayed name, class, abilities, stats, attributes, inventory/equipment, profiles, faction/allegiance, dialogue, quests, and encounters may vary while `character_id` preserves identity.
8. **Item variants may change displayed name, appearance/icon, description, stats, attributes, effects, rarity, requirements, and other supported mechanics.** `item_id` preserves the artifact's identity.
9. **Returning to base is an explicit state selection.** An exported `activate_base` action clears the active variant; `activate_variant` selects a named state. The web app defines the choice and the consuming runtime applies it.
10. **Every unresolved placeholder blocks canonical commit.** Draft saving remains allowed. Commit never drops the placeholder; the author must link an existing record or promote it to a canonical record first.

### Clarification: occurrence versus later discovery

Different Timeline records can represent different eras while still forming one ordered chronology. The distinction is about two separate facts, not a special UI:

```text
Earlier era occurrence:
  The Ashblade is forged and used during the War of Glass.

Playable-present discovery:
  The main character finds evidence and learns who forged the Ashblade.
```

Both facts reference the same artifact/lore identity. The first says when something happened in the world; the second says when it becomes known or playable. Neither automatically creates runtime transition order.

### Remaining external or review questions

- The occurrence/discovery example was confirmed in Author Review 5.
- Respawn state retention remains intentionally deferred to the consuming runtime, as confirmed again in Author Review 5.

## Workflow 3: Resume Existing City Work And Grow A Bounded Faction Plot

Source: German dictated workflow supplied by the author on 2026-07-15.

### Original Author Narrative

> So, kurzem aktuellen Stand, dieses Update, deine Fragen. Was... Ich fange mal mit Zweitens an, mit der Niederlagen-Policy. Genau, also es geht in der Handlung nicht weiter und man wird dann zurück zu einem, ja, ich glaube, before dem Kampf-Speicher macht schon Sinn. Und man kann dann noch mal auf diese, also wenn es kurzen Dialog kommt, kann man noch mal auf diesen Dialog aufklicken, bisschen noch mal starten. Wenn das in der View ist, einfach ein Button, den man klickt für Aufrufen Boss-Kampf. Dann, ja, geht's halt direkt los. Also man ist sozusagen direkt davor. Und mit dem Respawn, das muss ich noch überlegen. Ich würde erst mal sagen, wir machen das mit Speicherpunkten, dass man, dass das Spiel speichert. Genau. Von daher würde ich mir Respawn jetzt keine Gedanken machen, was erhalten bleibt oder nicht. Genau. Das heißt, du kannst mal einfügen, dass ein Autor überschreiben kann, ob es ein Respawn sein soll, also Respawnpunkt, oder ein Pre-fight Save. Genau, aber das erstmal so. Dann zum dritten Punkt, Chronologie, Kapitel und so. Aber ich habe gerade noch mal nachgeguckt. Und genau, also ich habe für mich sind Story-Arcs aktuell einfach die Kapitel, die Chapter in dem Spiel. Das heißt, genau. Es ist wirklich einfach ein Story-Arc. Eine Region ist für mich einfach nur eine Zusammenfassung mehrerer Gebiete. Also, es ist weniger als ein Kontinent, vielleicht auch weniger als ein Land in einem Kontinent. Aber ja, ich glaube, für mich, es gibt keine Länder so im Mittelalter, sondern es gibt nur Regionen. Es gibt dann den Kontinent irgendwie und dann gibt es halt in diesem Kontinent verschiedene Regionen. In einer Region können dann mehrere Dörfer oder Städte oder Wälder, was auch immer liegen. Den Punkt mit, wie unterscheiden wir historische Ereignisse, spätere Entdeckung und spielbare Gegenwart? Verstehe ich jetzt nicht ganz. Worauf willst du damit hinaus? Und beim vierten Punkt, was meinst du mit, warum willst du eine Gesamtchronologie einordnen? Also, was ich jetzt gemacht hätte, war, verschiedene Timelines zu erstellen, wobei das wahrscheinlich auch nicht ganz, naja, so... Ja, ja, zumindest das Gefühl verschiedene, ich kann mal gucken. Genau, verschiedene Timelines, die verschiedene Era abbilden. Und ja, ich glaube, das ist so. Und die letzte Timeline zum Beispiel ist einfach jetzt die, wo der Hauptcharakter ist. Bei den Varianten, da bin ich mir unsicher, was du da genau, also, welche Location-Felder dürfen variieren? Okay, ich probiere es mal mit meinen eigenen Worten zu sagen und alles, was quasi noch fehlt, was irgendwie Sinn macht, kannst du ergänzen. Also der Name bleibt natürlich. Wenn es nicht gerade teleportiert wird, die Gegend, dann dürfte eigentlich der Ort auch bleiben. Also die Location selbst. Dann können natürlich die Leute da drin, die Quests da drin, Größe, Beschreibung, Spawnpunkt, besuchbar, nicht besuchbar. Ja, irgendwie solche Sachen können dann irgendwie variieren. Bei Characters ist es dann Name, würde ich sagen, wenn er sich verändert. Dann Klasse, Fähigkeiten, Stats, Attribute, Inventar. Gefühlt kann sich da fast alles ändern. Ich wüsste gerade nicht, ja, weiß ich nicht recht viel. Bei Items würde ich sagen auch Name, Aussehen auf jeden Fall, also das Icon. Beschreibung, Stats, Attribute, die Effekte, alles sowas, wenn es mächtiger wird, zum Beispiel. Und was meinst du mit, wie wird die Rückkehr zur Basisform exportiert? Das muss dann irgendwie verschiedene States geben und dann kann man im Spiel dann entscheiden oder beim Programmieren entscheiden, welchen State braucht man gerade oder will man gerade. Irgendwie so, oder? Weiß ich nicht. Ich hasse da eine Idee. Und was meinst du mit unfertiger Platzhalter beim Commit? Ja, ich würde schon sagen, wenn es irgendwo noch Platzhalter gibt, der gelöst werden muss, kann das den Commit blocken. Weil ich wüsste gerade nicht, was man damit machen soll, wenn man das nicht blockiert. Würde man das einfach dann verwerfen, oder? Also, was wäre die Alternative? Vielleicht kannst du das mal ein bisschen genauer aufschreiben, diese Fragen dahingehend. Okay, und für die Sachen, die du lösen kannst, ist es ganz gut. So, jetzt zum Workflow. Du möchtest daraus herleiten... Also, ich glaube, es fällt mir schwer, jetzt jeden möglichen Workflow irgendwie aufzuzählen. Zum Beispiel jetzt, ich bin fertig mit Arbeiten und setze mich gerade noch mal hin, will mit dir ein bisschen, oder spreche gerade mit dir noch ein bisschen, und würde dann schauen, okay, wo bin ich jetzt noch stehen geblieben. Jetzt mal habe ich über ChatGPT gesprochen und habe mit ihm geklärt, wie jetzt die erste Stadt aussehen könnte. Das heißt, ich würde jetzt den Worldbuilder aufmachen, würde dann die erste Stadt aufrufen, würde dort die Infos einpflegen, würde dann gucken, dass ich das bisherige Notdokument update, was die Story angeht, würde dann den Charakter updaten, der da drin vorkommt, müsste mir dann noch überlegen, was es noch so für Plots gibt in dieser Stadt. Also, ich weiß jetzt, wie der Hauptcharakter begegnet und was er macht, aber nicht so viel, was es dann noch so für Geheimnisse gibt und dass eine Stadt auch immer irgendwas, was sie in Bewegung hält, was sie gerade beschäftigt, wer noch Hilfe braucht, irgendwie sowas. Also müsste ich da so ein bisschen brainstormen. Das heißt, ich müsste jetzt hier schauen, okay, was für Fraktionen gibt es dort, in welcher Region befinde ich mich, haben wir da schon Fraktionen? Wenn nicht, würde ich da eine Platzhalter-Fraktion machen, würde dieser Fraktion dann was zuordnen. Dann gibt es vielleicht auch eine andere Fraktion, die dem entgegenspielt, irgendwelche Banditen, so als typische Anfänger-Sache für Abenteurer. Und die Banditen haben aber nicht einfach Banditen, sondern die haben auch eine Story, die haben einen bestimmten Charakter, der sie anführt, die haben einen Plan, die haben einen Ort, wo sie herkommen, wo sie wohnen normalerweise. Das wird aber gerade irgendwie auch, also das wird hier gerade besetzt genommen von Schattenwesen. Und die Schattenwesen sind aber sauer auf die Stadt, weil die Stadt was gemacht hat. Und so schließt sich irgendwie der Zirkel, dass im Grunde da alle das gleiche Problem haben, aber die Stärkeren dann die Schwächeren unterdrücken und die sich irgendwie zu wehren versuchen. Und das heißt, ich müsste jetzt hier einen Counter machen, ich müsste Dialoge schreiben dazu und müsste dann gucken, okay, wie, ich bräuchte einen Dialog zwischen Charakter und einem bestimmten banditen. bekomme quests von ihm muss schattenwesen töten, bekomme ruf steige im rank bei denen, erfahre mehr, kann bestimmte ausrüstung kaufen die ich platzhaltermäßig erstellen muss schnell oder zumindest vermerken dass man sie dort mit rufstufen gewinnung erhalten kann. dann konflikt stadt vs banditen. klarer ausgang (wir wollen kein spiel das so komplex ist mit entscheidungen als indie dev) und so weiter

### Compact Creative Path

```text
Resume after work and ask: where did I stop?
  → Open World Builder and select the first city
  → Bring in the city decisions developed in external notes/conversation
  → Update the city's canonical information
  → Update the existing story note and involved character
  → Inspect what still makes the city feel alive: secrets, pressure, and people needing help
  → Review the containing Region and existing factions
  → Create a placeholder faction when one is missing
  → Add an opposing bandit faction with a leader, plan, and home
  → Reveal that shadow creatures occupy the bandit home
  → Connect the shadow creatures' anger to something the city previously did
  → Preserve the causal pressure chain: city → shadows → bandits → weaker people
  → Sketch encounters and dialogues
  → Write a dialogue between an existing character and a bandit
  → Assign quests to defeat shadow creatures
  → On progress/turn-in, gain bandit reputation
  → Cross reputation ranks and learn more about the faction
  → Unlock reputation-gated equipment for purchase
  → Create quick item placeholders or record the gated equipment intent
  → Resolve the city-versus-bandit conflict toward one clear authored outcome
```

## Provisional Semantic Fixture

### Creative setup

The author resumes a short evening session after earlier design work occurred in conversation and notes. The need is not to start a new blank flow, but to recover context, update existing content, see what remains thin, and continue the same idea without reconstructing its relationships.

### Starting context

- Primary surface: World Builder.
- Selected context: an existing first city inside a canonical Region.
- Existing material: city decisions, a story note, an involved character, and partial knowledge of the protagonist's first meeting.
- Desired support: a resume/context summary showing recent local drafts, committed flow manifests, unresolved placeholders, directly related content, and notable gaps.

### Core author intention

Turn a partially described starter city into a bounded causal plot involving the city, bandits, shadow creatures, quests, encounters, dialogue, reputation ranks, discoveries, and reputation-gated equipment, while deliberately avoiding a highly branching narrative that would be too expensive for an indie project.

### Persistent state and availability

- Quest assigned and recorded.
- Shadow-creature objectives completed and normally turned in.
- Bandit-faction reputation increased.
- One or more reputation rank thresholds crossed.
- New faction information/dialogue becomes available.
- Reputation-gated equipment becomes purchasable.
- Placeholder equipment remains uncommittable until resolved.
- The regional conflict advances toward one clear authored result.

### Placeholder content

- Missing local faction.
- Bandit faction, leader, plan, and home if not already canonical.
- Shadow-creature roles and encounters.
- Quest/dialogue pieces not yet authored.
- Reputation-rank equipment items.
- Any additional city secrets or people needing help discovered during brainstorming.

## Product Requirements Derived From Workflow 3

### Resume is a first-class creative action

The author needs a concise **Continue where I stopped** entry that can recover:

- Recently selected or edited place.
- Browser-local work-in-progress drafts.
- Project-local committed-flow manifests.
- Unresolved placeholders.
- Recently changed related characters, lore, factions, quests, dialogues, and encounters.
- The next unresolved or intentionally noted question.

This is an orientation aid in the web authoring tool, not an in-game UI or runtime feature.

### Existing records and emerging placeholders belong in one draft

The flow must update the city and an existing character while also adding placeholder factions, enemies, encounters, dialogue, quests, and items. Placeholder promotion must preserve all local relations and return to the same selected city/flow context.

### Story seeds need explicit causal relations

The city, shadows, bandits, and weaker inhabitants are not merely co-located. The local constellation should preserve author-labeled causal relations such as:

```text
city action → angered shadow creatures
shadow occupation → displaced bandits
bandit pressure → harms weaker inhabitants
shared root problem → creates quest and eventual resolution
```

These relations remain authoring intent until resolved through lore, faction relations, encounters, quests, events, requirements, or story placements.

### Reputation progression is a dependency chain

Faction reputation is not only a numeric reward. Workflow 3 needs explicit rank thresholds that can unlock:

- New faction information.
- Dialogue options or scenes.
- Quests.
- Shop access or inventory rows.
- Equipment availability.

The dependency view and compiler must show which actions produce reputation, which thresholds define ranks, and which content consumes each rank requirement.

### Multiple consequences are ordered and atomic in V1

One quest result may grant reputation, cross a rank threshold, reveal information, and unlock equipment. V1 treats this as an explicitly ordered consequence group committed in one atomic bundle. It is not a set of alternative branches unless the author deliberately creates mutually exclusive conditions.

### Bounded complexity is a product requirement

The author explicitly does not want an indie project to require highly complex choice topology. The composer should support clear linear outcomes, small local choices, and faction requirements without encouraging combinatorial branching. A small branch graph plus linked flows is sufficient for V1; nested executable subflows and a universal runtime sequence model are not required.

## Current-Model Capability Map

| Workflow intention | Current support | Gap or caution |
|---|---|---|
| Resume a prior city idea | Local drafts, recent navigation, and canonical context packets exist separately | Needs one resume summary over local drafts, committed manifests, related edits, and unresolved placeholders |
| Update city and character together | Owning workspaces and atomic bundle patterns exist | Creation Flow needs protected handoff and cross-step provenance |
| Preserve a causal local conflict | Story Seed relations can remain local intent | Canonical compilation must use real lore/faction/event/quest/story contracts, not visual proximity |
| Create faction placeholders | Local placeholder contract supports this | Commit blocks until each placeholder is linked or promoted |
| Gain faction reputation | Quest/event/encounter reputation rewards exist | Reward timing and source must be explicit |
| Define faction ranks | Minimum faction reputation requirements exist | Named ordered rank tiers and their consumers need a focused authoring/export contract |
| Unlock information at a rank | Requirements can gate dialogues/events/lore | Producer/consumer trace and rank wording need author-facing support |
| Unlock equipment at a rank | Shop inventory and requirements can represent gated availability | Item placeholders and shop-inventory requirement attachment need one reviewed packet |
| Keep the outcome mostly linear | Existing `next_event_id`, requirements, and small typed transitions can support this | Avoid introducing Option C merely for visual grouping |

## Acceptance Scenarios From Workflow 3

### W3-A: resume without reconstructing context

Given the author returns after earlier note/conversation work, they can reopen the city and see related recent edits, local drafts, committed flows, unresolved placeholders, and the next recorded question in one context summary.

### W3-B: update existing content and grow new content together

The author can stage city and character updates while adding faction, enemy, encounter, dialogue, quest, and item placeholders in one hybrid draft without prematurely saving empty canonical records.

### W3-C: preserve the causal pressure chain

The constellation records why the shadows oppose the city, why the bandits were displaced, and how that pressure reaches weaker inhabitants. Promotion never reduces those meanings to unlabeled co-location.

### W3-D: compile reputation progression honestly

Quest progress or turn-in grants faction reputation; crossing a named rank threshold makes the linked information, dialogue, quests, shop access, or equipment eligible through explicit requirements.

### W3-E: gate equipment without blocking the idea

The author can first name reputation-gated equipment as placeholders and continue shaping the plot. Canonical commit remains blocked until every equipment placeholder in the flow is linked or promoted.

### W3-F: keep consequences ordered without inventing branches

One outcome can produce several ordered consequences in one atomic review. Rehearsal and preview show their dependency order, while the author is not forced to create parallel or mutually exclusive branches.

### W3-G: finish with one clear regional outcome

The author can resolve the city/bandit/shadow conflict toward one clear authored result, using only small explicit choices where needed, without a universal branching narrative graph.

## Cross-Workflow Findings After Workflow 3

- World Builder is the primary origin and resume surface across all three workflows.
- The same selected place may produce a sequence, constellation, or hybrid draft.
- Resuming existing work is as important as starting a new idea.
- Existing canonical records and unresolved placeholders must coexist locally without creating empty canonical shells.
- Reputation progression needs named thresholds and producer/consumer tracing, not only numeric rewards.
- Several consequences after one outcome are ordered and atomically committed by default; explicit conditions create branches.
- The desired narrative complexity is bounded. Option B plus committed authoring manifests is sufficient for V1; Option C is deferred.
- All actual placeholders block canonical commit, while draft saving remains loss-resistant.
- The third workflow satisfies the V1 corpus gate. Remaining questions are field-level export design or explicitly deferred runtime concerns, not a need to enumerate every possible author session.

## Author Review 5: Timeline, Gameplay Actions, Repeatability, And Lore Capture

Source: author feedback supplied on 2026-07-15.

### Confirmed behavior and scope

1. **Occurrence versus discovery matches the intended Timeline use.** An event may occur in an earlier era while the player discovers its evidence or meaning in the playable-present era. Both placements may reference the same canonical subject and neither creates runtime order by itself.
2. **Respawn state retention stays external.** The initial web/export work does not define what inventory, quest, currency, world, or temporary state survives a respawn override.
3. **Narrative gameplay actions must be general, not damage-only.** Authored sources may cause damage, heal life or another approved resource, apply or remove statuses, cleanse curses or other matching removable statuses, grant or take currency, and produce similar typed effects.
4. **Healer interactions are an explicit motivating example.** Visiting a healer may restore health and remove curses or statuses. A benefactor or other character may grant currency. Several results from one interaction are ordered consequences in one atomic group.
5. **Repeatability is decided per content.** An interaction, encounter, reward source, or other owner may be one-shot or repeatable; existing canonical behavior may be inherited explicitly. There is no universal repeatability default for all narrative content.

### Web/export implication

Gameplay results use a discriminated action envelope with a typed source, target, timing, repeat policy, and action-specific canonical references. Existing Effects cover Damage, Heal, Modifier, Shield, Control, and Status behavior; existing Status records provide stacking/reapplication and cleanse/dispel permissions; Currency, Item, Stat, and reputation records remain canonical payload owners. New behavior is not stored as arbitrary JSON. It stays unresolved until typed fields and validation exist. The web app authors and exports the contract but does not execute the action in Unreal.

### Clarification: selected text and idea cards

- **Selected-text promotion** means the author writes normal lore prose, highlights a phrase such as “the Ash Regent,” and chooses **Create character reference/placeholder**. The prose remains intact while that exact text span links to the new or existing entity.
- **Idea cards** are small separate entries beside or below the prose, such as **Character: Ash Regent**, **Faction: Veiled Choir**, or **Place: Hollow Basilica**. They can be created before the wording or exact position in the prose is known and can be connected to other ideas.

Recommended V1 interaction at this point: use the same placeholder/reference record for both. Selecting text creates a linked idea card automatically, while authors may also create cards directly during brainstorming. This was confirmed in Author Review 6.

## Author Review 6: Combined Lore Brainstorming Confirmation

Source: author feedback supplied on 2026-07-15.

### Confirmed behavior and product meaning

1. **Selected text and idea cards are combined.** Both interactions are required rather than alternative editor designs.
2. **They share one idea identity.** Promoting a selected prose span creates or links the same local reference/placeholder used by an idea card. It must not duplicate the entity idea.
3. **Cards can precede prose.** During free brainstorming, the author may create a character, faction, place, item, event, or other idea card before deciding its exact wording or location in lore text.
4. **Prose can produce cards.** While writing, the author may select a phrase and promote it into a typed or unresolved card without leaving the text surface.
5. **Brainstorming is implementation-adjacent.** Unlike a disconnected paper mind map, these captured ideas retain context and links and can later be resolved, promoted, compiled, and reviewed without manual transcription into another authoring system.

### Acceptance consequence

The **Expand this place** surface is not merely a text editor beside a card board. Text spans and cards are two views and creation gestures over the same local idea/reference graph. Editing prose must not destroy cards; moving or editing a card must not corrupt prose; deleting a mention must not silently delete the underlying idea when another relation or card still uses it. Canonical commit remains blocked until every required placeholder is resolved or promoted.

## Documentation Change Log

### 2026-07-17 — capture, provenance, and choice-action implementation evidence

- Marked W1–W3 golden draft normalization as automated without claiming canonical compilation.
- Linked the dialogue continuation/reload and selected-location expansion interaction tests.
- Recorded local mention/card identity, manifest recovery/UE exclusion, and stable choice/typed action contract evidence.
- Kept compiler, runtime verification, full workflow interactions, and writer evaluation explicitly open.

### 2026-07-17 — implementation traceability audit

- Clarified that W1–W3 and Author Reviews 1–6 are approved requirements, not claims of implemented Creation Flow behavior.
- Added the **Specified**, **Automated**, and **Runtime verified** status model.
- Mapped each workflow to reusable repository foundations, remaining evidence, and CF open-point IDs in `NARRATIVE_CREATION_FLOW_PLAN.md`.
- Added change-control rules so future implementation updates add test/runtime evidence without rewriting the original author narratives.
- Made no changes to the original narratives, confirmed author decisions, provisional semantic fixtures, or acceptance intent.
