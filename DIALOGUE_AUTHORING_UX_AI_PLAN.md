# Dialogue Authoring UX and AI Import — Implementation Plan

Status: implementation-ready for canonical semantics and Script UX; DLG/import remains a gated local pilot

Primary UI: `soa-editor/src/pages/DialogueFlowPage.tsx`

Primary API: `backend/app/routes/r_ui_dialogues.py`

Last repository review: 2026-07-10

## Outcome

Deliver a keyboard-friendly Script view for writing and reviewing dialogue, make start/end semantics canonical, and then pilot a safe text-import workflow that stages generated dialogue into an empty local draft without committing it.

The work is deliberately split into independently shippable milestones. AI import does not block the authoring improvements, and direct model/provider integration is not in the initial scope.

This document is a scoped implementation plan, not a second workspace roadmap. `AUTHORING_WORKSPACES_GAME_DESIGN.md` remains authoritative for the Dialogue Scene Room's creative north star and delivery status, while `AUTHORING_UX_FRONTEND_PLAN.md` remains authoritative for shared layout, copy, accessibility, and visual conventions. Update those canonical documents when implementation status or shared UX behavior actually changes.

## Project alignment

The implementation must preserve the established Dialogue Scene Room rather than replace it with a standalone text editor:

- Keep the full-width `AuthoringPageShell`, shared `AuthoringPanel`, structured `EmptyState`, explicit “Review Dialogue Bundle” language, and “Advanced Details” schema-complete fallback.
- Keep Flow, rehearsal, World Echo, Scene Brief, Story Beat Track, Story Placement, health lenses, participant context, local layout/grouping, and the shared Consequence Composer available. Script and Focus modes change hierarchy, not the save contract.
- Keep one local draft containing dialogue, nodes, story-beat changes, beat unlinks, and deletions. Script history may cover only dialogue/node edits, but it must never discard or roll back unrelated staged beat work.
- Keep canonical story placement on `adventure_beat_links` and dialogue-linked character beats on `character_story_beats`; imported prose must not synthesize either.
- Keep requirements and consequences author-authored through the existing trusted controls. AI import deliberately produces a mechanically inert graph that the writer may enrich afterward.
- Keep graph positions, grouping, view state, focus preference, rehearsal state, and import source local. Only fields backed by models or real link tables may enter the bundle.
- Keep generic dialogue and dialogue-node editors reachable for rare fields and debugging, but do not make them part of the normal writing loop.

### Baseline that must not regress

Before Milestone 1, record or add a small regression suite for the currently working bundle: load, local draft restore/reset, node/choice editing, safe node deletion, story-beat update/unlink, consequence editing, rollback-only preview, atomic commit, rehearsal gates, and World Echo derivation. New Script/import tests supplement this baseline.

## Decisions fixed by this plan

These decisions replace the unresolved alternatives in the earlier proposal.

1. `Dialogue.starting_node_id` is the canonical start. It is a nullable string validated by the bundle API rather than a database foreign key because the current atomic upsert creates the dialogue before its new nodes.
2. `DialogueNode.is_terminal` is the canonical intentional-ending marker. It defaults to `false`. A terminal node must have no outgoing choices.
3. A valid non-empty dialogue has exactly one start and at least one reachable terminal. An empty dialogue may have no start and no terminal while it is a local draft, but backend preview/commit rejects it.
4. A node with no outgoing choices and `is_terminal=false` is an error (`unmarked_end`), not a generic warning. A terminal with outgoing choices is an error (`terminal_has_outgoing`).
5. Cycles are allowed, but every node must be reachable from the canonical start. Requiring every cycle to reach a terminal is deferred because intentional looping dialogue may exist.
6. Script view is a preorder projection of the graph, not a second data model. It edits the same `dialogue` and `nodes` state as Flow view.
7. Script view does not support arbitrary drag reorder in its first release. Graph meaning comes from edges; “move branch” is deferred until its edge-rewrite behavior is specified.
8. Undo/redo covers dialogue and node mutations only. Story-beat editing, graph layout, rehearsal state, and committed data are excluded initially.
9. DLG/1 import is allowed only when the active local draft has zero nodes. Append, merge, replace, and revision import are out of scope.
10. Imported content may set only title, slug suggestion, description/direction, speakers, line text, start, terminal markers, and topology. Requirements, flags, consequences, reputation, story beats, canonical IDs, and database writes are forbidden.
11. Parsing and staging happen in the browser. Existing `/api/ui/dialogues/preview` and `/api/ui/dialogues/bundle` remain the only persistence path.
12. No direct OpenAI or other provider integration is included. The pilot builds and copies a prompt and accepts pasted output.
13. Existing saved dialogues are allowed to load in a repairable legacy state. Read/load and source import do not reject missing canonical start/end fields; only Dialogue Scene preview/commit requires a valid final graph.
14. Start/end fields are part of source CSV and UE export contracts. They must not be treated as UI-only metadata.
15. Imported text is untrusted content. It is rendered as text, never HTML; directive-like prose, Markdown, URLs, and prompt-injection text have no executable meaning.

## Repository constraints

- Models are SQLAlchemy classes in `backend/app/models/`.
- Existing SQLite files are upgraded additively in `backend/app/db/init_db.py::_upgrade_sqlite_schema`; no migration revision directory is currently used.
- Generic editors depend on JSON schemas in `backend/app/schemas/`.
- Dialogue bundle validation is transactional and already validates same-dialogue targets, reference shapes, deletions, and story-beat concurrency.
- The frontend currently keeps dialogue state, graph analysis, mutation functions, and most UI in one large page component.
- There is no project/tenant identifier on dialogue data. Same-project ownership cannot be enforced until the wider data model adds one; this plan requires same-dialogue target validation and existence validation only.
- Source CSVs in `backend/data/` are the portable rebuild truth, and UE CSV output is a downstream integration contract. Model/schema changes require source headers, coercion/export coverage, and UE documentation/consumer review.
- The shared authoring vocabulary and primitives are already implemented. New UI should compose them rather than introducing dialogue-only substitutes.
- The current bundle route reports most validation failures through Flask `abort(400, description=...)`; clickable issue navigation requires a deliberately defined structured error payload or a stable adapter, not parsing human-readable strings.

## Target module layout

Create the following modules while keeping `DialogueFlowPage.tsx` as the route-level coordinator:

```text
soa-editor/src/dialogues/
  types.ts
  graph.ts
  mutations.ts
  speakerPrediction.ts
  history.ts
  script/
    DialogueScriptView.tsx
    ScriptNode.tsx
  import/
    dlgTypes.ts
    dlgParser.ts
    dlgSemantics.ts
    dlgSerializer.ts
    dlgStaging.ts
    DialogueImportDialog.tsx
    DialoguePromptBuilder.tsx
    fixtures/
backend/app/models/
  m_dialogues.py
  m_dialogue_nodes.py
backend/app/routes/
  r_ui_dialogues.py
```

`types.ts` owns typed dialogue, node, and choice shapes used by new code. Existing `EntryRecord` API boundaries may be normalized into these types incrementally; a full application-wide type migration is not required.

## Milestone 1 — Canonical graph semantics

Goal: start/end meaning survives reload, export, preview, and commit.

### M1.1 Persist the fields

Change:

- `backend/app/models/m_dialogues.py`: add `starting_node_id = Column(String, nullable=True)`.
- `backend/app/models/m_dialogue_nodes.py`: add `is_terminal = Column(Boolean, nullable=False, default=False)`.
- `backend/app/db/init_db.py`: add SQLite upgrades for both columns and backfill `is_terminal = 0` where null.
- `backend/app/schemas/dialogues.json`: expose `starting_node_id` as a dialogue-node reference.
- `backend/app/schemas/dialogue_nodes.json`: expose `is_terminal` as a checkbox.
- `backend/data/dialogues_seed.csv` and `backend/data/dialogue_nodes_seed.csv`: add the columns. Seed starts and terminals explicitly where they can be inferred safely.

Legacy-data rule:

- The upgrade does not guess starts or endings. Existing rows remain `starting_node_id = NULL` and `is_terminal = false` until seed data or an author fixes them.
- This avoids silently choosing among multiple roots or treating unfinished lines as intentional endings.
- Existing records remain loadable and editable. Dialogue Scene preview/commit blocks until the author explicitly repairs start/end semantics; unrelated generic reads, exports, and startup are not blocked.
- Do not silently rewrite all source dialogue CSVs by inference. For tracked seed/source rows, add explicit values only after each graph has been checked; document any rows intentionally left for manual repair.

Export/integration work:

- Add both columns to the tracked source CSV headers and verify lossless source export/import round trips them.
- Verify UE CSV serialization includes `starting_node_id` and `is_terminal` with the expected reference/boolean representation, then update the relevant UE relationship/authoring documentation if its consumer contract changes.
- Confirm full-source preflight/rebuild accepts the new headers and that old SQLite upgrade plus a subsequent source export produces a rebuildable dataset.

Tests:

- Add a persistence-contract test proving old-style SQLite tables receive both columns.
- Update dialogue fixtures to include canonical start/end values.
- Add source CSV round-trip and UE export assertions for the new fields.

### M1.2 Centralize graph analysis

Extract pure frontend graph analysis from `DialogueFlowPage.tsx` into `soa-editor/src/dialogues/graph.ts`.

Return structured issues rather than display strings:

```ts
type DialogueIssueCode =
  | "missing_start"
  | "start_not_found"
  | "unreachable_node"
  | "missing_target"
  | "unmarked_end"
  | "terminal_has_outgoing"
  | "missing_terminal";

interface DialogueIssue {
  code: DialogueIssueCode;
  severity: "error" | "warning" | "note";
  nodeId?: string;
  choiceIndex?: number;
  message: string;
}
```

`analyzeDialogue(dialogue, nodes)` must be deterministic and must not read local storage. Retain cycle detection as a note/lens feature.

Tests in `graph.test.ts` cover empty graphs, missing/invalid start, unreachable nodes, broken targets, marked and unmarked endings, terminal conflicts, and cycles.

### M1.3 Enforce the same invariants on the backend

Extend `_validate_node_graph` in `r_ui_dialogues.py` to receive `dialogue_data` and validate the final submitted graph before any upsert:

- non-empty `nodes`;
- `starting_node_id` exists in submitted node IDs;
- all choice targets exist in submitted node IDs;
- all submitted nodes have the matching `dialogue_id`;
- terminal nodes have no outgoing choices;
- every node is reachable from `starting_node_id`;
- at least one reachable terminal exists.

Return bundle errors with a stable `path` (`dialogue.starting_node_id`, `nodes[i].is_terminal`, or `nodes[i].choices[j].next_node_id`). Preview and commit must execute the identical validator.

Define one machine-readable error shape for graph blockers, for example `{ code, path, message, node_id?, choice_index? }`, while retaining a readable top-level message for existing callers. The frontend maps backend `code`/`path` to the same issue-navigation model used by client analysis. Do not make UI behavior depend on matching English error text.

Backend contract tests:

- accept a valid linear graph and valid branching graph;
- reject missing/foreign start, unreachable node, unmarked ending, terminal with choices, and missing terminal;
- prove preview rolls back and commit persists `starting_node_id`/`is_terminal`;
- retain existing cross-dialogue target, safe deletion, and malformed-reference tests.

### M1.4 Add author actions and remove browser-local start

In Flow view:

- Add “Set as start” to each node action menu.
- Add a terminal checkbox/action. Enabling it removes no edges automatically; show the resulting inline error until the author removes them.
- Render start and terminal badges.
- Rehearsal starts from `packet.dialogue.starting_node_id`.
- Delete `startKey()` and all reads/writes of `soa.dialogue-flow.start.*`.
- Replace “dead end” strings with structured inline issues.

Acceptance:

- Reloading a committed dialogue preserves its start and endings.
- Clicking any issue selects and scrolls/fits the affected node.
- A valid graph passes both client analysis and backend preview.
- A legacy dialogue loads with repair actions and cannot be committed accidentally until repaired.
- Source and UE exports preserve the new semantics.

## Milestone 2 — Typed mutations, history, and writing ergonomics

Goal: establish one safe mutation layer before adding a second editing view.

### M2.1 Extract mutations

Implement pure functions in `mutations.ts`:

- `updateDialogue`
- `updateNode`
- `addContinuation`
- `addChoiceBranch`
- `deleteNodeAndIncomingEdges`
- `setStartingNode`
- `setTerminal`
- `duplicateBranch` (only if all duplicated nodes are exclusively owned by that branch; otherwise return a typed refusal)

Every function returns a new state and a selection/focus hint. Both Flow and Script views call these functions; neither view rewrites edges independently.

The shared state contract must retain story beats, beat unlinks, deletion tracking, and local-only grouping even though these helpers mutate only dialogue/nodes. Add regression tests proving node undo/redo does not overwrite concurrently staged story-beat or placement changes.

### M2.2 Speaker prediction

Implement `predictNextSpeaker(sourceId, nodes)`:

1. Walk the current branch backward through a unique inbound chain, up to 10 nodes.
2. If exactly two distinct recent canonical speaker IDs exist, choose the one different from the source.
3. Otherwise choose the most recent distinct speaker.
4. Fall back to the source speaker and then `NPC`.

Copy both `speaker` and `speaker_character_id` from the prediction. Unit-test two-person alternation, branches with multiple inbound edges, one-speaker scenes, and fallback speakers.

### M2.3 Undo/redo

Implement `history.ts` as a reducer-backed bounded history:

- maximum 100 structural entries;
- text edits within the same field coalesce while focus remains in that field or until 750 ms idle;
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and Windows `Ctrl+Y`;
- undo/redo restores dialogue/nodes plus selected node, not layout or inspector state;
- loading, resetting, restoring a local draft, staging an import, and successful commit clear history;
- staging import creates one undoable entry after an automatic named snapshot.

Do not use browser undo as the application history. Add reducer and keyboard-handler unit tests.

### M2.4 Focus handoff

After adding a continuation or choice branch, render the new node, select it, and focus its text area using a pending focus target keyed by node ID. Add an accessible live announcement (“Line added for {speaker}”).

Acceptance:

- In a two-speaker scene, a writer can add alternating continuations, type, undo, and redo without leaving the keyboard.
- No mutation bypasses the shared mutation layer.

## Milestone 3 — Script view and focus mode

Goal: make prose drafting the default creative surface while Flow remains the topology surface.

### M3.1 Script projection

Add `"script"` to `CenterView`. Build a stable preorder traversal from the canonical start:

- emit the current node;
- emit outgoing choices in stored array order;
- indent descendants by branch depth;
- when a node has already been emitted, render a compact link row instead of duplicating its editor;
- append unreachable nodes in an “Unreachable” error section so they remain repairable.

Each row contains speaker picker, editable text, start/terminal badges, collapsed requirement/effect chips, add-continuation, add-choice, and overflow actions. Choice labels edit inline above their targets.

### M3.2 Keyboard contract

Inside a line editor:

- `Enter` inserts a newline (normal textarea behavior).
- `Ctrl/Cmd+Enter` adds a predicted-speaker continuation.
- `Ctrl/Cmd+Shift+Enter` adds a choice branch and focuses its choice label.
- `Alt+ArrowUp/Down` moves focus to the previous/next visible script row; it does not mutate topology.
- `Escape` returns focus to the row action bar.

Avoid plain-Enter structural behavior because multiline dialogue text is already supported.

### M3.3 Selection and view synchronization

- Maintain one selected node ID in the page coordinator.
- Switching views selects the same node.
- Flow fits/centers the selected node; Script scrolls it into view.
- Store each view’s scroll/viewport state in memory for the route lifetime, not as canonical data.

### M3.4 Focus mode and panel hierarchy

Add Focus mode that hides Scene Brief, Story Beat Track, Story Placement, library, minimap, and advanced inspector content. Retain:

- compact scene title/status bar;
- Script/Flow switch;
- selected-line essentials;
- issue count;
- local-draft/committed state;
- exit Focus mode action.

Persist only the user preference in local storage. It must not affect dialogue data.

Implement this with the existing shared shell/panel vocabulary. Hidden panels must remain reachable after exiting Focus mode, and their draft state must remain mounted or otherwise preserved. Focus mode must not hide the committed/local status, bundle review entry point, blocker count, or an accessible route back to advanced controls.

### M3.5 Tests

- Component tests: preorder/branch rendering, shared-node link rows, unreachable section, inline choice editing, focus after add, and keyboard commands.
- Playwright: create a dialogue, author a two-person exchange in Script view, branch once, mark endings, set start, switch to Flow, preview, and commit.
- Accessibility: every structural action has an accessible name; focus returns to the invoking control after dialogs close.
- Regression: story-beat edits, beat unlinks, Story Placement, Consequence Composer drafts, and local graph layout survive Script/Flow/Focus transitions.
- Responsive: at the supported narrow desktop breakpoint, Script remains writable and Flow can still expose the Context Dock without horizontal control loss.

Acceptance:

- The complete create/edit/connect workflow is possible without graph dragging.
- Switching Script/Flow does not lose selection or edits.
- A 10-node two-speaker dialogue with one branch can be authored and previewed using the keyboard.

## Milestone 4 — DLG/1 parser package

Goal: prove the interchange format independently of AI UX.

### M4.1 Supported grammar

The V1 grammar supports exactly:

```text
document      := header metadata* node+
header        := "!DLG 1" EOL
metadata      := title | slug | owner | location | direction | start
node          := node_header speaker text_line+ (choice+ | continuation | end)
node_header   := ":: " LABEL EOL
speaker       := "@speaker " VALUE EOL
text_line     := "|" (" " TEXT)? EOL
choice        := "? " QUOTED " -> " LABEL EOL
continuation  := "> " LABEL EOL
end           := "@end" EOL
```

`LABEL = [A-Za-z][A-Za-z0-9_-]*`. Metadata directives are `@title`, `@slug`, `@owner`, `@location`, `@direction`, and exactly one `@start`. A node cannot mix choices, continuation, and `@end`. Consecutive text lines join with `\n`; bare `|` is a blank line.

Quoted choice text supports only `\"`, `\\`, and `\n`. Unknown directives/escapes are errors. UTF-8 BOM and CRLF are normalized. Smart quotes/arrows produce diagnostics and are not silently rewritten.

Accept either one fenced `dlg` block with no non-whitespace content outside it, or unfenced input whose first meaningful line is `!DLG 1`. Multiple blocks are errors.

### M4.2 Parser contract

`parseDlg(source)` returns:

```ts
interface ParseResult {
  ast?: DlgDocument;
  diagnostics: Array<{
    code: string;
    severity: "error" | "warning";
    message: string;
    span: { start: number; end: number; line: number; column: number };
  }>;
}
```

No partial AST may be staged when any error exists. The original source is retained by the import dialog.

Parsing must be a total, side-effect-free operation over a JavaScript string. It must not evaluate Markdown/HTML, follow links, interpolate directives into code, access storage, resolve project references, or perform network requests. Diagnostics should escape source excerpts and cap excerpt length.

Resource limits:

- 100 KiB source;
- 200 nodes;
- 20 choices per node;
- 10,000 characters per spoken line block;
- 500 total edges;
- parser completes in linear time relative to source length.

### M4.3 Semantic validation and serialization

Validate unique labels, one defined start, defined targets, terminal conflicts, reachability, at least one terminal, and speaker presence. Cycles are allowed.

`serializeDlg(ast)` emits normalized unfenced DLG/1. Required round-trip property:

```text
semantic(parse(serialize(parse(source)))) == semantic(parse(source))
```

Whitespace and comments need not round-trip; comments are not supported in V1.

Fixtures/tests:

- at least 10 valid and 20 invalid golden files;
- forward targets, branches, cycles, multiline/blank text, escaped choices;
- duplicate labels, missing targets/start/speaker, multiple fences, smart punctuation, mixed edge kinds, terminal conflicts, truncation, unknown directives, and every resource limit;
- property tests may be added with an existing/new lightweight generator, but golden and round-trip tests are mandatory for the milestone.

Exit gate: proceed to Milestone 5 only if the format can represent every seed dialogue after canonical start/end data is supplied. Otherwise use internal JSON for the pilot and record the rejected DLG cases.

## Milestone 5 — Empty-draft import pilot

Goal: stage a reviewed candidate locally without adding a persistence bypass.

### M5.1 Prompt builder

Build a dialog that lets the author select:

- participants (required, explicit selection);
- optional location;
- scene direction;
- facts to reveal/withhold;
- intended branch outcomes;
- maximum node count.

Show the exact generated prompt before enabling Copy. Never include the full character/location catalog. The prompt requests DLG/1 and explicitly forbids requirements, flags, effects, IDs, and story beats.

Project provider/retention policy has no current canonical storage location. For the pilot, show configurable static policy copy from one frontend config module. Do not claim enforcement until a project-policy model exists.

The prompt preview must clearly distinguish authored project context from instructions. Treat all stored names, notes, descriptions, and pasted model output as data even if they contain instruction-like text. Copy is an explicit user action; opening the builder performs no clipboard or network operation.

### M5.2 Import review dialog

The import dialog has four states:

1. Paste source.
2. Parse diagnostics with clickable source spans.
3. Resolve `@owner`, `@location`, and every unique `@speaker` by exact slug, case-insensitive exact display name, then explicit selection. Never fuzzy-resolve silently and never accept pasted IDs.
4. Preview graph summary and stage.

The preview must show at least node/edge/terminal counts, start label, speakers and fallback speakers, unresolved/ambiguous references, cycles, and unreachable nodes. It must also state that requirements, flags, consequences, beats, and canonical IDs will not be imported.

Staging is disabled when:

- the current draft contains any node;
- any parse/semantic error exists;
- a metadata reference is ambiguous;
- any speaker has neither an explicit canonical selection nor an explicitly confirmed fallback string;
- resource limits are exceeded.

### M5.3 Stable staging

`dlgStaging.ts` converts the resolved AST to the normal frontend state:

- generate all ULIDs once when entering preview and retain the label-to-ID map while the dialog is open;
- use `generateSlug` plus collision checks against the current packet’s nodes;
- map `@start` to `dialogue.starting_node_id`;
- map `@end` to `node.is_terminal=true`;
- choice/continuation edges contain only `choice_text` and `next_node_id` (plus empty `set_flags` for current schema compatibility);
- imported nodes have empty requirements, flags, and tags;
- never call an API.

Before staging, write a named local snapshot using the existing draft storage namespace. Then replace the empty local node array as one undoable mutation, select the start node, close the dialog, and focus Script view. Cancel at every earlier step leaves packet state byte-for-byte unchanged.

Only the dialogue fields explicitly accepted in the review may replace local metadata; show a field-level before/after summary for title, slug suggestion, description, owner, and location. Blank generated metadata does not erase an existing local value. The empty-node restriction applies to active nodes, but staging is also blocked when pending node deletions or other state makes “empty” ambiguous.

Tests:

- unit tests for resolution order, ambiguity, ID stability, forbidden-field absence, and staging mapping;
- component tests for error navigation and cancel safety;
- Playwright happy path from prompt copy through paste, resolve, stage, edit, backend preview, and commit;
- spy/assert that staging performs no fetch request.

Acceptance:

- A valid 10-node DLG/1 scene can be parsed, resolved, previewed, and staged into an empty local draft.
- Malformed or ambiguous input cannot mutate the draft.
- Imported data cannot create gameplay effects or commit data.

## Deferred work

The following are explicitly not part of Milestones 1–5:

- direct provider/API integration;
- append, merge, replace, or revision reimport;
- immutable export-session identity and optimistic concurrency for dialogue nodes;
- AI-authored requirements, flags, consequences, reputation, beats, or lore;
- collaborative/shared graph layout;
- arbitrary branch reorder/move;
- project/tenant ownership validation (requires a project identity in the broader schema);
- command palette, library slide-over/search, pinned voice cards, branch folding, and subgraph layout.
- automated lore, voice, knowledge-state, emotional-intent, or branch-quality scoring; these remain human health questions until the project has honest canonical inputs and validated evaluation behavior.

These may become separate follow-up plans after the Script view and import pilot produce usage evidence.

## Delivery sequence and pull-request boundaries

Keep pull requests small enough to review and revert independently:

| PR | Contents | Depends on |
|---|---|---|
| 1 | Model/schema/SQLite/seed fields | — |
| 2 | Frontend graph analysis and structured issues | PR 1 |
| 3 | Backend graph invariants and contract tests | PR 1 |
| 4 | Flow start/end actions and rehearsal migration | PRs 2–3 |
| 5 | Typed mutations, speaker prediction, focus handoff | PR 4 |
| 6 | History/undo/redo | PR 5 |
| 7 | Script view projection and editing | PRs 5–6 |
| 8 | Focus mode, synchronization, E2E/accessibility | PR 7 |
| 9 | DLG parser, semantics, serializer, fixtures | PR 4 |
| 10 | Prompt builder and import review | PRs 8–9 |
| 11 | Local staging and pilot E2E | PR 10 |

PRs 5–8 may proceed in parallel with PR 9 after canonical graph semantics are merged.

## Verification commands

Run the smallest relevant set during development and the full set before each milestone closes:

```powershell
python -m pytest backend/tests/test_dialogue_flow_contracts.py backend/tests/test_persistence_contracts.py
Set-Location soa-editor
npm run test:unit
npm run lint
npm run build
npm run test:e2e -- authoring-workflows.spec.ts
```

Any new Playwright spec may be run by its own filename while iterating. A milestone is not complete if build, lint, relevant unit tests, or its acceptance E2E fails.

For model/schema milestones, also run the CSV contract suite and rebuild preflight relevant to the changed source files. Before final delivery, run the repository-standard backend `pytest` and frontend unit/lint/build suites; run the focused dialogue Playwright workflow and document any unrelated pre-existing failures rather than weakening the gate.

## Rollout, recovery, and documentation

- Ship canonical semantics before making Script the default or exposing import.
- After migration, open representative linear, branching, cyclic, gated, and story-linked dialogues and repair them explicitly. Keep a source backup before rewriting tracked canonical CSVs.
- Feature-gate the import pilot in frontend configuration so Script authoring can ship independently and the pilot can be disabled without affecting normal dialogue editing.
- A failed parse, cancelled dialog, failed preview, or failed commit leaves the current local draft recoverable. Successful commit clears history according to M2.3 but retains the normal committed bundle and draft-recovery behavior.
- Update `PROJECT_CONTEXT.md`, `README.md`, and `soa-editor/README.md` only when their stated current behavior changes. Update the Dialogue Scene Room status/catalog entry in `AUTHORING_WORKSPACES_GAME_DESIGN.md` in the same change that ships a milestone; keep shared UX details in `AUTHORING_UX_FRONTEND_PLAN.md`.
- Record the DLG/1 grammar/version in one canonical developer-facing location (this document until code ships, then a colocated README/spec referenced here). Do not allow prompt examples, parser behavior, and fixtures to become three competing specifications.

## Definition of done

The planned work is complete when:

1. Canonical start and terminal state persist and are enforced identically by client analysis, backend preview, and backend commit.
2. A writer can author, branch, repair, undo/redo, rehearse, and commit a dialogue from Script view without graph dragging.
3. Flow and Script share one mutation/state model and preserve selection when switching.
4. DLG/1 has executable parser/semantic/round-trip tests and passes the seed-dialogue representation gate.
5. A writer can inspect the exact prompt, paste one candidate, navigate errors, resolve references, preview stable generated nodes, and stage into an empty local draft.
6. Cancel and invalid input do not mutate the draft; staging does not call the backend; imported content contains no gameplay state.
7. The staged draft still passes the normal rehearsal, backend preview, review, and atomic commit path before becoming canonical.

## Pilot decision after delivery

Measure manual Script authoring against import-assisted authoring for representative small scenes: time to usable draft, parse/repair rate, prose retained, semantic/voice corrections, staging-to-commit rate, and writer confidence. Direct provider integration or revision import receives a new plan only if the pilot shows repeatable net value.

Segment results by scene size and importance, and record malformed/truncated output rate, backend-preview failure rate, meaningful versus cosmetic branch rate, lore/knowledge corrections, and total author time including prompt repair. The pilot succeeds only when it saves net author time without lowering confidence or producing gameplay-state writes (target: zero). No single “five-minute scene” demonstration is sufficient evidence for direct-provider or revision-import scope.
