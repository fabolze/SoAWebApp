# Dialogue Authoring UX and AI Import Plan

Status: revised limited-prototype proposal; production implementation gated
Scope reviewed: `/author/dialogues`, `/author/dialogues/new`, `/author/dialogues/:id`  
Primary implementation: `soa-editor/src/pages/DialogueFlowPage.tsx` and `backend/app/routes/r_ui_dialogues.py`

## Goal

Help a narrative author stay in the act of writing. The workspace should make the common loop—write a line, choose the next speaker, add a response, keep going—fast and calm, while keeping graph structure, requirements, flags, story placement, rehearsal, and bundle validation close at hand when they are needed.

The second goal is a safe, **provider-neutral import contract for model-generated drafts**. A writer should be able to describe a scene in an external chat, request a small documented interchange format, paste the result into the app, inspect the generated graph, and stage it as a local draft. The format and importer can be provider-neutral; output quality and formatting consistency cannot be assumed to be model-independent.

This is deliberately a human-reviewed import workflow, not an autonomous dialogue generator. Parsing and reference validation can make malformed or unsafe output fail safely, but they cannot prove that lore, characterization, branching, or gameplay meaning is correct. AI output must never bypass review, validation, rehearsal, backend preview, or the normal commit path.

## Current workspace: what is already strong

The current Dialogue Scene Room has a solid foundation:

- It edits lines directly on a visual graph and supports explicit choices and automatic continuations.
- It preserves unsaved work in local storage and restores the draft after navigation or reload.
- It separates local drafting from rollback-only preview and atomic bundle commit.
- It offers rehearsal with temporary flags/reputation and path snapshots.
- It exposes story beats, requirements, flags, participant context, downstream world impact, reachability, cycles, and broken targets.
- It has starter recipes and can auto-layout the graph.
- Canonical character references are supported while a fallback speaker name remains possible.
- The current bundle API is already suitable for accepting generated nodes after they have been reviewed in the client.

These capabilities should be retained. The UX opportunity is chiefly one of hierarchy and flow: advanced world-state tools currently compete visually with the writing task.

## Findings and likely interruptions

### P0: the writing surface is not the first or simplest surface

The page places Scene Brief, Story Beat Track, and—on saved dialogues—Story Placement before a three-column workbench. On a typical screen the writer must scroll to reach the graph, and later scroll away from it to adjust the brief or beats. This makes planning metadata feel like a prerequisite even when the writer already knows the scene.

Recommendation:

- Make the workbench the persistent primary area beneath a compact, sticky scene bar.
- Collapse Scene Brief, Story Beats, and Story Placement into drawers or an expandable “Scene setup” region. Show concise summaries in the bar: cast, location, entry gate, beats, placement, and issues.
- Remember the writer's last open/closed state per dialogue.
- On a new dialogue, use a short setup step, then move focus directly into the first line.

### P0: graph editing is being asked to serve as prose editing

Each node card is 275px wide with a small, non-resizable textarea. A graph is excellent for understanding topology, but comparatively poor for drafting rhythm, reading an exchange, revising several adjacent lines, or pasting a scene. The inspector duplicates the selected line in another textarea, adding a choice of editing locations rather than a clear writing flow.

Recommendation: add a first-class **Script view** beside Flow, Rehearsal, and Impact.

Script view should:

- Render a branch-aware outline with speaker, line, and indented player choices.
- Allow continuous keyboard navigation through editable lines.
- Support `Enter` for a new line, `Ctrl/Cmd+Enter` for a continuation, and a discoverable command for a player choice.
- Offer speaker autocomplete when typing a speaker prefix, with the last few speakers first.
- Allow multi-line selection, cut/copy/paste, duplicate branch, and move line/branch.
- Keep structural annotations such as requirements and set flags collapsed into small chips.
- Synchronize selection with Flow view; switching views must not lose focus or scroll context.

Flow remains the best topology and debugging view. Script becomes the default creative-writing view for new scenes.

### P0: adding the next exchange requires too much pointer work

`+ Continue` creates a linked node and inherits the source speaker. In natural back-and-forth dialogue, the likely next speaker is often the other recent participant. Creating a choice also begins with generic text and then requires edge/inspector selection to complete its details. There are no page-level keyboard shortcuts or focus handoff to the new line.

Recommendation:

- After adding a linked node, focus its text editor immediately.
- Add “Continue as…” with a predicted next speaker; use the other speaker in a two-person exchange, otherwise the most recent distinct speaker. Prediction is only a default.
- Let the writer type a new choice label inline under the source line, press Enter, and immediately write the target line.
- Add a command palette (`Ctrl/Cmd+K`) for Add continuation, Add choice, Change speaker, Go to node, Rehearse from here, Toggle focus mode, and Import dialogue text.
- Show a small shortcut reference on first use and in Help; do not rely on invisible shortcuts.

### P0: there is no bulk/script import path

The only fast starts are four fixed recipes, and recipes work only on an empty dialogue. There is no supported way to paste a screenplay-like exchange, AI-generated structure, or an external draft and convert it into nodes.

Recommendation: prototype the provider-neutral DLG/1 importer described below only after its grammar and canonical graph semantics are settled. Continue beyond the prototype only if it proves useful both for human-authored text import and model-generated drafts.

### P1: advanced panels compete with line writing

The permanent left Dialogue Library uses 235px and the Context Dock uses 390px. On smaller desktop widths the graph becomes the constrained middle column. The dock offers Edit, Beat, Health, and Context even when the writer only needs the selected line. The selected saved node can also expose the large shared Consequence Composer beneath the editor.

Recommendation:

- Add **Focus mode**: hide library, story planning, minimap, and advanced inspector sections; retain a thin scene bar, script/flow canvas, selected-line essentials, save state, and exit control.
- Make the library a searchable slide-over. Add title, participant, location, tag, and “recently edited” filters.
- Make the inspector resizable/collapsible and preserve its width.
- Place advanced fields (slug, fallback speaker, requirements, flags, grouping, consequences) under progressive-disclosure sections. Speaker and line text remain always visible.
- Keep Health as a compact issue count that opens a navigable issue list, rather than a peer writing tab.

### P1: context is available but not ambient

Character want and voice notes are only visible after switching the dock to Context. The writer must trade away the node editor to consult them. Relationships are a separate list without the most useful relationship summary near the current speaker.

Recommendation:

- Add a pinnable **voice card** for the selected speaker: want, voice notes, relationship to the other active speaker, and scene direction.
- Allow two or three “always visible while writing” context snippets selected by the writer.
- Add speaker color/avatar consistently in Script, Flow, and Rehearsal.
- Show the selected branch's compact “what changes” strip (requirements in, flags out) without opening the full Impact view.

### P1: change safety is broad, not granular

Local draft recovery and Reset Draft are valuable, but there is no visible undo/redo for individual writing operations. Reset discards the whole unsaved bundle. Line deletions have a special undo, while text edits, connections, speaker changes, and branch moves do not.

Recommendation:

- Add an in-memory command history for dialogue and node mutations with `Ctrl/Cmd+Z` and redo.
- Coalesce normal typing into sensible undo groups.
- Keep draft recovery; show “Saved locally just now” separately from “Committed to project.”
- Offer named local snapshots for riskier rewrites or imports.
- Before replacing an existing graph through import, automatically create a local snapshot.

### P1: terminal lines and starts are under-specified

Every node without choices is reported as a dead end, even though a normal conversation must end. This creates warning noise and weakens trust in Health. Rehearsal reads a local `soa.dialogue-flow.start.*` key, but this view currently has no action that sets it. The canonical dialogue model also has no `starting_node_id`, so start identity is inferred from inbound edges and can be ambiguous.

Recommendation and prerequisite:

- Resolve start and ending semantics in the canonical data model before defining DLG/1 or building its importer.
- Add canonical `dialogues.starting_node_id`, including ownership and existence validation in preview/commit. Browser-local state may cache selection or layout, but must not define portable dialogue meaning.
- Represent endings with a typed terminal field, or formally define every node without outgoing edges as terminal. Do not encode runtime semantics in a reserved user-editable tag.
- Add “Set as start” and “Mark as ending” actions to Flow and Script view, and make Health distinguish intentional endings from invalid or unreachable structure.

### P1: validation needs to be closer to the affected text

Graph health is calculated live, but most feedback is summarized in the header or Health tab. Blocker strings often identify a generated label or ID rather than bringing the writer to the exact field. Similar-consequence and dead-end warnings can be legitimate and should not all carry the same weight.

Recommendation:

- Mark affected lines/choices inline and make every issue navigable.
- Separate errors, likely mistakes, and intentional structural notes.
- Add quick fixes for missing choice target, empty speaker, duplicate consequence, unmarked ending, and multiple starts.
- Run heavier world-impact/coherence checks on pause or before review so typing stays responsive.

### P2: graph navigation will degrade with larger scenes

There is no node search, outline, breadcrumbs, branch folding, or “return to selection.” Auto Layout is global and manual positions are browser-local. Large conversations will continually reorient the writer.

Recommendation:

- Add node/speaker/text search and a compact outline.
- Add Fit selection, Back/Forward selection history, fold branch, isolate branch, and breadcrumb to root.
- Preserve the selected node when auto-layout runs; allow layout of only a selected subgraph.
- Treat browser-local layout as a collaboration limitation and decide later whether layout should become canonical/shared metadata.

### P2: accessibility and copy quality need a pass

Graph edge selection and handles are pointer-centric. Keyboard users need a non-graph editing route, another reason Script view is important. Some rendered arrow characters appear garbled in source/output and should be normalized to a real Unicode arrow or an icon with an accessible label.

Recommendation:

- Ensure the full create/edit/connect workflow is possible in Script view without drag operations.
- Add meaningful labels for node actions, branch levels, requirement states, and consequence state.
- Verify focus order after creating/removing lines and when closing review/import modals.
- Fix the mojibaked arrows and test source encoding.

## Proposed target experience

The default authoring loop should feel like this:

1. Create a dialogue and enter a title plus optional one-paragraph direction.
2. Add or resolve two or more participants.
3. Start in Script view with cursor focus on the first speaker/line.
4. Write continuously with inline choices and predicted next speakers.
5. Pin voice/context notes only when useful.
6. Switch to Flow to inspect branching and fix topology.
7. Rehearse representative branches.
8. Open Health/Impact only for structural and world-state review.
9. Review the atomic bundle and commit.

Focus mode should reduce that further to scene direction, pinned context, the script, and local/committed save status.

## AI-assisted workflow: human-reviewed draft import

### Product boundary

The limited prototype should **not require an OpenAI API integration**. The app provides a provider-neutral prompt builder, a documented DLG/1 import format, deterministic parsing, project-reference resolution, graph preview, and local staging.

Ordinary chat output has no machine-enforced contract. Extra prose, smart punctuation, renamed directives, missing targets, truncation, and invented syntax are expected product scenarios. The parser must make these failures visible and safe; the product must not imply that it makes them rare or makes the narrative correct.

V1 is suitable for short draft scenes, screenplay-to-node conversion, alternate phrasing, ambient dialogue, and branches whose outcomes the author has already chosen. It is not intended to design quest-critical state, decide canonical lore, replace existing dialogue automatically, or produce editorially final text.

### V1 authority boundary

AI may propose speakers, spoken text, choice labels, and graph topology. It may not assign entry requirements, node/choice requirements, flags, reputation changes, consequences, story beats, or other canonical gameplay state.

Those effects are added by the author after staging. If a later version permits generated effects, the author must first select an explicit allow-list of intended outcomes and confirm every attachment individually. Resolving a valid reference name is not evidence that the reference is used with the correct meaning.

### End-to-end writer workflow

For important or quest-related scenes, separate structure from prose:

1. The author selects only the participants and context needed for the scene, then records intended decisions, facts to reveal or conceal, and approved outcomes.
2. The model proposes a small branch outline without dialogue prose or gameplay effects.
3. The author approves or edits the topology and branch meanings.
4. The model writes dialogue within that approved structure and returns one DLG/1 block.
5. The app parses locally and shows syntax diagnostics, speaker/reference resolution, and a graph/change preview.
6. The author chooses **Stage local draft**. The result is not committed to the project; it is stored only in the normal local draft.
7. The author edits in Script/Flow, adds any gameplay effects, rehearses representative paths, reviews Health/Impact, runs backend preview, and commits through the existing bundle flow.

For small, non-critical scenes, the outline and prose requests may be combined, but the same review and state restrictions apply.

### DLG/1 specification gate

DLG/1 is promising as a human import/export format, but the sketch below is not implementation-ready until it has all of the following:

- a formal grammar and separate semantic rules document,
- golden valid/invalid fixtures and compatibility rules for future versions,
- explicit normalization and error-recovery rules,
- semantic round-trip expectations,
- resource limits and fuzz/property tests.

If DLG is only temporary plumbing for a single model workflow, prefer a simpler internal JSON import contract. Continue with a custom language only if manual authoring, repair, and durable export are real product requirements.

### Proposed DLG/1 core profile

```dlg
!DLG 1
@title The Bell Below
@slug the-bell-below
@owner Mara Venn
@location Flooded Archive
@direction Mara needs the player to recover a bell, but hides that ringing it will wake her brother.
@start opening

:: opening
@speaker Mara Venn
| The water is rising. If we want the bell, we go now.
? "Why does it matter to you?" -> confession
? "Tell me where it is." -> route
? "No. Find someone else." -> refusal

:: confession
@speaker Mara Venn
| My brother carried it below. I heard it ring once after the vault collapsed.
> route

:: route
@speaker Mara Venn
| Take the eastern stair. Do not ring the bell until I am with you.
? "You have my word." -> accepted
? "I make no promises." -> wary_acceptance

:: refusal
@speaker Mara Venn
| Then I misjudged you.
@end

:: accepted
@speaker Mara Venn
| Then meet me below the archive.
@end

:: wary_acceptance
@speaker Mara Venn
| That is exactly what I was afraid you would say.
@end
```

Core rules to formalize:

- Exactly one fenced `dlg` block is accepted when fences are present. Multiple blocks are an error; unfenced input is allowed only when `!DLG 1` is the first meaningful line.
- Normalize only UTF-8 BOM and newline style automatically. Structural smart quotes and Unicode arrows produce a targeted diagnostic rather than silent rewriting.
- `:: local_label` labels match `[A-Za-z][A-Za-z0-9_-]*`, are unique, and are never treated as database IDs.
- `| ` begins spoken text, so dialogue may safely begin with `@`, `?`, `>`, `::`, or `//`. Consecutive `| ` lines join with newlines; a bare `|` represents an intentional blank paragraph.
- `@speaker` is required for every node. Missing speakers may be repaired only by an explicit author action.
- Choices use `? "text" -> target`; automatic continuations use `> target`. A node may have at most one continuation and may not mix continuations with choices.
- `@end` cannot coexist with outgoing edges and maps to the canonical terminal representation chosen before implementation.
- Exactly one `@start` must target a defined node and maps to canonical `starting_node_id`.
- Choice strings support only `\"`, `\\`, and `\n`. Unknown escapes are errors.
- Comments occupy their own `//` line. The semantic round trip need not preserve whitespace or comments, but must preserve all dialogue meaning.
- Unknown directives, unsupported annotations, unresolved references, duplicate labels, missing targets, terminal conflicts, and truncated nodes block staging. Nothing is silently omitted.

The V1 AI profile excludes `@entry`, `@requires`, `@sets`, `@beat`, and equivalent choice options. A later human-authored profile may add them with quoted/tokenized reference rules and lossless mapping, but they are not part of the initial model prompt.

### Mapping to canonical data

| DLG/1 construct | Canonical field/action |
|---|---|
| `@title` / `@slug` | `dialogue.title` / collision-checked `dialogue.slug` |
| `@owner` / `@location` | explicitly resolve to canonical records |
| `@direction` | `dialogue.description` |
| `@start` | canonical `dialogue.starting_node_id` |
| `:: label` | generate a new node ULID and globally unique prefixed slug |
| `@speaker` | literal `node.speaker`, plus `speaker_character_id` when explicitly resolved |
| `| text` | `node.text` |
| `? ... -> ...` | choice with generated `next_node_id`; no effects in the AI profile |
| `> target` | automatic continuation using the existing blank-choice representation |
| `@end` | canonical typed terminal semantics, never a reserved tag |

The preview must preserve one symbol-to-generated-ID map for its lifetime so re-rendering or changing speaker resolution does not churn IDs.

### Semantic review

Structural validity is necessary but insufficient. Before staging, the review UI should ask the author to inspect:

- whether every branch outcome matches its visible choice,
- whether facts are revealed only where intended,
- whether speakers know only what they should know,
- whether choices have meaningfully different outcomes,
- whether cycles/repetition are intentional,
- whether voice and lore remain consistent.

These are review prompts and evaluation criteria, not claims of automated proof. Backend preview remains authoritative for project ownership, canonical reference existence, slug/ID uniqueness, start/terminal invariants, and bundle integrity.

## Import UX, privacy, and safety

### Import modes and identity

MVP imports only into a new or empty dialogue. Existing local metadata is reconciled field by field, and generated content is staged rather than committed.

Appending, inserting, or replacing existing content is deferred until the product has stable update identity and optimistic concurrency. Local labels alone are not update identities: generating fresh ULIDs would turn a revision into delete-all/add-all.

A later revision protocol must include one of the following: verified immutable node references, immutable slugs, or a signed export-session mapping. It must also include the exported dialogue revision and reject or merge stale imports when the canonical dialogue has changed. All destructive merge modes require a visual diff and automatic local snapshot.

### Resolution behavior

Speaker and metadata references resolve by exact slug, case-insensitive exact display name, unique normalized name, then explicit author selection. New-node imports do not accept pasted canonical IDs. Ambiguous references are never fuzzy-resolved silently, and fallback speaker text is clearly distinguished from a canonical character link.

Because the V1 AI profile contains no gameplay-state references, flag and requirement resolution is not part of AI staging. Authors add those records and attachments through the existing trusted UI after import.

### Privacy and provenance policy

- Never include an entire catalog automatically. The author selects the minimum characters, locations, notes, and facts required.
- Show the exact outgoing prompt before the explicit copy/send action.
- Display the project's approved provider, account/workspace, retention, and unpublished-content policy at that action.
- Disable external prompt generation when project policy does not permit the selected content/provider combination.
- Decide whether AI provenance is stored, local-only, or omitted through the project's legal/editorial policy; do not hard-code “no provenance” as the universal default.

### Trust and technical limits

- Treat pasted content as untrusted text: never execute it or render it as raw HTML.
- Enforce document, node, choice, line, nesting, and total-record limits with line-specific diagnostics.
- Generate ULIDs locally, collision-check slugs, and keep preview IDs stable.
- Run client graph analysis and backend rollback-only `/api/ui/dialogues/preview` before commit.
- Verify project ownership, references, uniqueness, canonical start/terminal semantics, and graph invariants again on the backend at commit time.
- Malformed output is a routine recoverable state: preserve the pasted source, navigate to each error, and allow cancel without mutating the draft.

## Implementation plan

### Phase 0: schema and continuity prerequisites

1. Decide and migrate canonical start and terminal semantics.
2. Enforce those semantics and all project ownership/reference/uniqueness invariants in backend preview and commit.
3. Add Set as start, Mark as ending, focus handoff, predicted next speaker, collapsible panels, and library search.
4. Add granular undo/redo and automatic local snapshots for risky operations.
5. Fix source encoding/mojibaked arrows and verify accessible labels and focus order.

Acceptance checks:

- Start and ending meaning survives browser/device changes and export.
- Intentional endings do not create false dead-end warnings.
- A two-person linear exchange can be written from the keyboard after the initial action.
- Backend preview rejects cross-project references and invalid graph semantics even if client checks are bypassed.

### Phase 1: Script view

Suggested modules remain:

- `soa-editor/src/dialogues/script/DialogueScriptView.tsx`
- `soa-editor/src/dialogues/script/ScriptLine.tsx`
- `soa-editor/src/dialogues/history.ts`
- shared typed mutation helpers extracted from `DialogueFlowPage.tsx`

Implement the branch-aware outline, inline create/edit/remove/reorder actions, speaker prediction, pinned context, Focus mode, selection synchronization, keyboard access, and undo/redo tests before investing heavily in AI import. This provides the baseline against which AI-assisted drafting must demonstrate additional value.

### Phase 2: DLG/1 specification and parser prototype

1. Publish the formal grammar, semantic rules, safe-normalization policy, version compatibility policy, and golden fixture corpus.
2. Implement tokenizer/parser, source spans, AST, semantic validation, serializer, and resource limits.
3. Test directive-looking prose, blank paragraphs, escapes, smart punctuation, multiple fences, forward references, cycles, duplicate/missing targets, terminal conflicts, truncation, and unknown directives.
4. Add semantic round-trip, property/fuzz, and denial-of-service tests.
5. Decide from the prototype whether DLG has durable human value; otherwise replace it with an internal structured format before UI integration.

### Phase 3: limited prompt/import pilot

1. Add the structured brief, exact outgoing-context preview, project policy notice, and Copy prompt action.
2. Prompt for topology first and prose second for important scenes; never request gameplay effects.
3. Add paste, diagnostics, speaker resolution, graph/change preview, stable generated IDs, and **Stage local draft** for empty dialogues.
4. Prove cancel does not mutate state and staging does not commit project data.
5. Run a pilot comparing the full workflow with manual Script-view authoring.

No backend parser endpoint is needed for the pilot. Existing preview/commit endpoints remain persistence authorities; a server parser is justified only for later CLI/batch use or shared format enforcement.

### Phase 4: export and revision identity

Plain DLG export may be added for inspection and backup after semantic round-trip tests pass. AI reimport into existing dialogue remains blocked until immutable identity, export revision, stale-write handling, reviewed create/update/delete diffs, and snapshot recovery are implemented.

### Phase 5: optional direct AI integration

Proceed only if the pilot demonstrates material value. A direct provider should produce a schema-constrained internal JSON AST where the provider supports it, then serialize to DLG/1 for human inspection. Generated-in-app and pasted candidates must converge on the same resolution, preview, staging, rehearsal, and commit flow. The model never receives commit authority.

## Suggested delivery priority

| Priority | Outcome | Why first |
|---|---|---|
| 1 | Canonical start/end semantics and backend invariants | Prevents temporary meaning from leaking into the format |
| 2 | Script view, focus/keyboard improvements, undo/redo | Improves all authoring and establishes the comparison baseline |
| 3 | Formal DLG/1 specification and parser prototype | Tests whether the custom format is robust and worth owning |
| 4 | Empty-dialogue AI draft pilot | Validates usefulness with limited persistence risk |
| 5 | Stable revision identity and concurrency | Required before any non-empty reimport or replacement |
| 6 | Optional schema-constrained direct provider | Convenience only after demonstrated value |

## Success measures

Compare repeated samples against manual Script-view authoring, segmented by scene size and importance:

- first-pass parse rate and percentage structurally valid without repair,
- malformed/truncated response frequency,
- time from brief to a draft the author considers usable,
- total author time saved or lost versus Script view,
- percentage of generated prose retained,
- lore, knowledge, character-voice, and branch-meaning corrections per scene,
- meaningful versus cosmetic branch rate,
- incorrect gameplay effects per import (target: zero in V1 because AI cannot author them),
- percentage reaching staging, rehearsal, backend preview, and commit,
- backend preview failure rate for imported versus manual drafts,
- writer-reported confidence and interruption cost.

The five-minute ten-node scenario is a best-case usability demonstration, not an acceptance benchmark. Approve production scope only if the pilot shows repeatable net time savings and acceptable semantic quality across representative scenes.

## Gates before production implementation

1. Canonical start and terminal semantics are migrated and enforced.
2. The V1 authority boundary is accepted: AI generates language/topology, not gameplay state or canonical lore.
3. DLG/1 has a formal grammar, semantic specification, compatibility policy, and fixture corpus.
4. Backend preview/commit independently verifies ownership, references, uniqueness, and graph invariants.
5. The project defines approved external providers/workspaces, data handling, and provenance policy.
6. A pilot demonstrates value over Script view. Stable identity and optimistic concurrency are additional gates for revision import.

## Definition of done for the limited AI workflow

The prototype is complete when a writer can select minimal approved context, see and copy the exact prompt, paste one DLG/1 candidate, navigate syntax errors, resolve speakers, preview the graph and changes, and stage it into a new/empty local draft. The author can then revise, add gameplay effects manually, rehearse, run backend preview, and commit through the existing atomic review.

At no point may generated text create gameplay-state records or effects, silently discard unsupported data, overwrite a non-empty graph, define start/end only in browser state, or commit project data. Production approval remains contingent on the pilot and all gates above.
