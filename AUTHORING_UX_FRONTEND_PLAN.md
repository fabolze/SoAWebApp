# Authoring UX And Frontend Cleanup Plan

## Purpose

This is the canonical UX and frontend cleanup guide for the authoring web app.

`AUTHORING_WORKSPACES_GAME_DESIGN.md` owns what the authoring workspaces should let a designer create, inspect, validate, and save. This document owns how those workspaces behave on screen: layout, navigation, wording, panels, help affordances, visual standards, and frontend consistency.

The goal is to make the app usable as the project moves from web-app development into real asset and content development. An author should understand what a panel does without knowing the database schema, normalized table shape, or internal implementation vocabulary.

> If a user asks "what is this supposed to mean?", that is UX debt and belongs in this document.

## Maintenance Contract

Every recurring UX/frontend concern should have one row in the status index and one matching section or backlog item.

When adding or changing an authoring view:

1. Use the shared UX patterns in this document before inventing a one-off layout.
2. Keep game-design intent in the game-design document and interaction implementation here.
3. Add unclear wording, excessive scrolling, cramped layout, inconsistent controls, and navigation-loss issues here as cleanup work.
4. Do not hide frontend standards only inside a workspace-specific implementation note.
5. Do not treat "it works technically" as done if the author cannot tell what the action means or what it will change.

## UX Status Index

Last reviewed: 2026-07-10

| Area | Status | Notes |
|---|---|---|
| Documentation split | Done | This file is the dedicated UX/frontend companion to the game-design document. |
| Authoring view full-width audit | Done | All listed `/author/*` workspaces use the shared route shell. `ItemInspectorPage` retains an intentional reading-width cap; non-authoring utility pages and constrained reading surfaces remain outside this dense-workspace standard. |
| Collapsible authoring panels | In Progress | Shared `AuthoringPanel` now supports collapse/expand, persistent localStorage state, status chips, and collapsed summaries. Item, shop, character, and location immersive panels have initial coverage. |
| Local section navigation | Done | The shared responsive rail now highlights the active section and works as a horizontal sticky rail below wide desktop. It covers immersive authoring, Ability Spellcraft, Creature Workshop, Story Timeline, Dialogue Flow, Encounter Stage, Progression Flow, Character Studio, Item Ecosystem, Quest Journey, Dependency Map, and World Builder. |
| Contextual help affordance | Done | Shared `AuthoringPanel` now uses the app's Heroicons help icon, accessible labels, hover/focus/click/escape behavior, and optional concrete examples. Major authoring panels have direct help coverage. |
| Wording and vocabulary cleanup | Done | Primary specialized workflows and lifecycle fields now use authoring intent language; technical metadata remains available in Advanced Details. Cross-workspace actions consistently say Inspect, Review, Commit, Reset, or New Tab. |
| Navigation preservation | Done for authoring workspaces | Dense authoring links use explicit inspect/edit/review wording, dirty-state guards remain active, and story context links identify new-tab behavior. Utility-page navigation remains governed by the existing generic editor shell. |
| Shared frontend assets and controls | Done for authoring surfaces | `AuthoringPageShell`, `AuthoringPanel`, `AuthoringStatusChip`, `AuthoringHealthSummary`, `AuthoringFilterBar`, `StatusNotice`, `EmptyState`, standard issue classes, Heroicons affordances, and `uiTokens` now cover shell, panel, status, issue, filtering, empty-state, and common action behavior across the complex workspaces. |
| Scroll and density cleanup | Done for complex workspaces | Collapsible low-frequency panels, persistent summaries, section rails, context docks, and Story Timeline issue/changed filters now provide an intentional density escape hatch. |
| Responsive behavior | Done for complex workspaces | Section navigation becomes a horizontal sticky rail below wide desktop, while dense authoring areas retain grid-based layouts that reflow at laptop/tablet breakpoints. |
| Accessibility and keyboard use | Done for shared authoring primitives | Help, section links, collapse controls, status notices, filter controls, and icon affordances have semantic names, focus styles, keyboard escape behavior, and state attributes. |
| Empty/error/loading states | Done for audited authoring workspaces | Shared structured empty states and retryable notices cover the listed specialized workspaces and generic schema array/reference states; load failures now explain recovery and expose Try Again where the route owns a retryable load. |

## Core UX Principles

1. **Full width by default.** Authoring pages should use the whole viewport and distribute work across panes, columns, docks, or canvases. Use max-width only for small, text-heavy forms where a wide line length would harm readability.
2. **Workspace context is preserved.** A helper link should not unexpectedly pull the author away from a draft. Cross-workspace links must say whether they open elsewhere, preserve a return path, or open in a new tab.
3. **Plain language before schema language.** The primary UI should say what the action means for content creation. Technical fields can remain in Advanced or Details sections.
4. **Progressive disclosure.** Show the normal workflow first. Move rare lifecycle, schema, or debugging fields behind collapsible details.
5. **Every panel explains itself.** A panel title, one-line subtitle, and `?` helper should answer: what is this for, when should I use it, and what does it save or not save?
6. **Long pages need structure.** Large views must provide collapsible panels, section anchors, sticky local nav, or a context dock.
7. **Review before commit.** Multi-record edits should keep using shared preview/commit surfaces so authors can see exactly what will be created, changed, or removed.
8. **Visual consistency beats novelty.** Controls that do the same job should look and behave the same across workspaces.

## Shared UX Patterns To Build

### Authoring Page Shell

Every complex authoring route should share a page shell with:

- Full-width route container.
- Workspace header with title, dirty state, health summary, save/reset actions, and route-level help.
- Optional local section navigation for long views.
- Main authoring area plus context dock or right rail when useful.
- Sticky save bar only when it does not cover active controls.
- Consistent loading, restore, error, and save-success messaging.

The shell should prevent accidental narrow layouts such as centered `max-w-*` wrappers around dense authoring surfaces. Wide screens should show more useful context, not only larger margins.

Implementation note, 2026-07-09:

- `soa-editor/src/components/authoringUi/index.tsx` now exposes `AuthoringPageShell` for full-width authoring route containers.
- `ImmersiveAuthoringPage` now removes the centered `max-w-7xl` shell and uses the shared full-width route container.
- Item, shop, character, and location immersive authoring views now render beside a sticky local section rail on wide screens.
- The section rail is now shared as `AuthoringSectionNav` so long specialized workspaces can reuse one navigation pattern.
- `LocationAtlasPage` and bundled `CharacterCreatorPage` also use the shared route shell and available route width.
- `EncounterStagePage`, `ProgressionFlowPage`, `AbilitySpellcraftLabPage`, and `CreatureWorkshopPage` now use the shared full-width route shell.
- `ItemEcosystemPage` now uses the shared full-width route shell. `ItemInspectorPage` uses the shared route shell with an intentional `max-w-7xl` reading cap because it is an inspection surface rather than a dense bundle workspace.
- `QuestJourneyPage` and `DependencyMapPage` now use the shared route shell for the active quest/dependency workspaces.
- Shared `SchemaEditor` routes now use `AuthoringPageShell`, so the generic entity editors inherit the shared route container without editing each generated wrapper page.
- `WorldBuilderPage` now uses `AuthoringPageShell` for its active world authoring workspace.
- `AbilitySpellcraftLabPage`, `CreatureWorkshopPage`, `StoryTimelinePage`, and `WorldBuilderPage` now use shared local section navigation to jump between major workflow sections without losing the current workspace.
- Remaining work: audit non-authoring utility pages and intentionally constrained modals, inspectors, and reading surfaces separately.

### Collapsible Authoring Panel

Create or standardize one shared panel component for major authoring sections.

Required panel features:

- Title and concise subtitle.
- `?` helper affordance.
- Collapse/expand control.
- Optional status chips: warnings, blockers, dirty, empty, saved, shared use, missing references.
- Optional primary actions in the header.
- Collapsed summary that still shows the important state.
- Persistent collapsed state per workspace and entity where useful.

Panel collapse should hide detail without hiding critical blockers. If a collapsed panel has warnings or unsaved changes, that state must remain visible in the header.

Implementation note, 2026-07-09:

- `soa-editor/src/components/authoringUi/index.tsx` now exposes a shared `AuthoringPanel` with `help`, `status`, `collapsible`, `defaultCollapsed`, `collapsedSummary`, `storageKey`, and `id` props.
- `AuthoringPanel` help now opens visible helper text on click and keyboard focus while retaining accessible labels and title text.
- `AuthoringStatusChip` provides shared neutral/success/warning/error/info chip styling for panel headers.
- Collapsed state persists per supplied `storageKey` in `localStorage`.
- The immersive item/shop/character/location panels use the shared panel instead of a local duplicate.

### Contextual Help

Use a small `?` affordance for major panels and complex field groups. It should work on hover, focus, and click.

Good helper content:

- What this panel controls.
- When the author should use it.
- What record or relationship it saves.
- What it does not change.
- One concrete example when the concept is abstract.

Bad helper content:

- Restating the label.
- Internal implementation jargon.
- Long documentation text.
- Warnings that should be visible without opening help.

Example for Story Placement:

- "Use this when the timeline needs to know when this encounter happens. It does not build combat participants or rewards. It creates a story link used by timeline order, warnings, and aftermath."

Implementation note, 2026-07-09:

- Panel-level help is now supported by the shared `AuthoringPanel`.
- Initial help copy was added for Item Card, Economy And Access, Mechanics, Modifiers, Merchant Front, Pricing Rules, Inventory Counter, Character Sheet, Role And World Links, Location Card, Atlas Placement, Place And Ecology, Routes, Advanced Details, Story Placement, Scoped Gate Builder, and Consequence Composer.
- Progression Flow now uses shared panel help for the workspace header, shared base, source/outcome composer, compact flow, temporary player state, usage preview, and local health.
- Story Timeline now uses shared panel help for filters/lenses, Story Navigator, content library, timeline bands, runtime chains, relationship context, issue context, unplaced content, and context dock states.
- Dialogue Flow now uses shared panel help for the route header, Scene Brief, Story Beat Track, Dialogue Library, Context Dock, Rehearsal Controls, and World Echo impact panels.
- Encounter Stage now uses shared panel help for the route header, selector, identity/unlock requirement, participants, rewards, aftermath, world placement, simulation, health, dossier, and direct world context.
- Character Studio now uses shared route/panel help for the workspace header, creation steps, cast navigator, starters, content library, context dock, and presence trace.
- Bundle Review change groups now explain what created, changed, deleted, and unlinked records mean before commit.
- World Builder route/detail panels now use shared helper affordances for map context, story overlays, routes, POIs, encounter placement, travel tuning, creative briefs, and validation issues.
- Remaining work: add comparable helpers to any remaining long specialized workspaces discovered during the utility-page audit.

### Vocabulary And Copy Rules

Primary UI should avoid these terms unless the panel is explicitly technical:

- canonical
- lifecycle
- packet
- row
- schema
- target type
- occurrence kind
- dependency edge
- link payload

Preferred pattern:

| Technical Meaning | Primary UI Copy |
|---|---|
| `adventure_beat_link` | story placement |
| lifecycle metadata | story role and result |
| requirement gate | unlock requirement |
| consequence packet | reviewed outcome |
| target type / target id | affected thing |
| occurrence | story appearance |
| dependency edge | requirement or outcome link |

Technical field names may remain in advanced details when authors need schema-level control.

Implementation note, 2026-07-09:

- Immersive authoring now labels the technical fallback as "Advanced Details" instead of "Advanced Form".
- Item economy copy now uses "default value" instead of "canonical value".
- "gate" copy in the immersive item/shop panels was revised toward "unlock requirement".
- Progression Flow visible copy now uses "unlock requirement" and "temporary player state" for the main workflow while keeping backend identifiers unchanged.
- Scoped Gate Builder help now explains flags as player state and requirements as unlock rules before schema attachment details.
- Consequence Composer help now distinguishes source outcomes from explicit story consequences for another affected thing.

### Navigation Rules

- Do not use a generic "Open" label when the action navigates away from an unsaved authoring surface.
- Prefer labels such as "Open Timeline in New Tab", "Open Source Record", or "Inspect In Generic Editor".
- Cross-workspace navigation must respect dirty-state protection.
- Read-only references can open inline previews, side drawers, or new tabs.
- Workflows should not require jumping between unrelated pages to copy ids.

Implementation note, 2026-07-09:

- Immersive authoring replaced generic or vague labels with explicit actions such as "Inspect In Generic Editor", "Inspect Source Record", "Inspect Route Record", "Edit Connected Location", and "Review Acquisition Ecosystem".
- Location route links continue to use dirty-state navigation protection through `confirmNavigate`.

### Design System And Assets

The frontend should standardize these assets and controls:

- Buttons: primary, secondary, outline, danger, icon-only, compact.
- Icons: use the app's chosen icon library consistently; avoid hand-written one-off SVGs for common actions.
- Panels: shared border, radius, spacing, heading scale, action area, help affordance, collapse affordance.
- Badges and chips: consistent meanings for warning, blocker, saved, draft, inferred, explicit, local, shared.
- Empty states: same structure across workspaces.
- Review surfaces: continue converging on `BundleReview` for preview/commit workflows.
- Inputs: consistent label, hint, validation, disabled, and dirty states.
- Cards: only for repeated items, records, or framed tools; avoid nested decorative cards.

The existing `soa-editor/src/styles/uiTokens.ts` should be treated as the first place to centralize these choices before adding new ad hoc class strings.

Implementation note, 2026-07-09:

- Panel and chip behavior is now centralized in `soa-editor/src/components/authoringUi/index.tsx`.
- Full-width authoring page shell and structured empty-state behavior are now centralized in `soa-editor/src/components/authoringUi/index.tsx`.
- Bundle Review summary chips, warning/blocker notices, and no-change review state now use shared status/empty-state primitives.
- Existing button variants remain centralized in `soa-editor/src/styles/uiTokens.ts`.
- Added unit coverage for shared panel rendering, collapse summaries, page shell rendering, and structured empty states in `soa-editor/src/components/authoringUi/authoringUi.test.ts`.

### Empty, Loading, And Error States

Every empty state should answer:

1. What is missing?
2. Is that okay right now?
3. What is the next useful action?

Example:

- Weak: "No story placements found."
- Better: "No story placement yet. That is fine while drafting; add one when you want the timeline, warnings, or aftermath to know when this encounter happens."

Error states should identify whether the author can retry, needs to save first, needs to create a referenced record, or hit a real backend failure.

Implementation note, 2026-07-09:

- `EmptyState` in `soa-editor/src/components/authoringUi/index.tsx` now supports optional title and action slots so empty states can consistently explain what is missing and what to do next.
- Initial clearer empty states were added for item modifiers, shop inventory, location routes, location atlas filter results, and character encounter placement.
- Additional clearer empty states were added for Story Placement beat availability/search, Scoped Gate draft flags, Consequence Composer targets, terminal dialogue choices, and payoff rows.
- Progression Flow side panels now use structured empty states for no selected event, no progression chain, no temporary unlocks, no usage preview, no local issues, and empty producer/consumer lists.
- Story Timeline now uses structured empty states for empty library searches, empty board, missing timelines/arcs, entity occurrence tracking, scoped rows, runtime chains, relationship context, issue context, and context-dock selection.
- Dialogue Flow now uses structured empty states for no loaded dialogues, no selected story beat, empty participant beat lanes, rehearsal without lines, empty rehearsal transcript, no world echo state, no downstream consumers, and empty context lists.
- Encounter Stage now uses structured empty states for unavailable characters, empty side columns, aftermath groups, health, participant dossier, and direct world context.
- Character Studio now uses structured empty states for cast search misses, empty content-library categories, and empty presence trace beats.
- Item Ecosystem and Item Inspector now use structured empty states for missing item journey channels, missing journey rows, missing effects, missing modifiers, missing shop sources, missing relationship scans, and empty relationship groups.
- Quest Journey and Dependency Map now use structured empty states for missing objectives, missing quest givers, story-path gaps, branch exits, temporary flag walkthroughs, empty trigger queues, dependency graph filters, and empty relationship lists.
- Generic schema array fields and empty reference selects now use shared `EmptyState` copy with next-action guidance.
- World Builder now uses structured empty states for missing locations, map filters with no matches, route events, story-state overlays, inferred story beats, encounter tables, creative briefs, validation issues, and repeated detail lists.
- Shared tag, scoped-gate flag, consequence flag, and progression flag pickers now use compact structured empty states instead of terse `None`/`No ... yet` fallbacks.
- Remaining work: continue migrating any newly found terse empty copy in narrow inline pickers where authors need next-action guidance.

Implementation update, 2026-07-10:

- `AuthoringSectionNav` now tracks the visible section with `IntersectionObserver`, marks the active link, and becomes a horizontal sticky rail below wide desktop so navigation remains useful on laptop widths.
- `AuthoringPanel` now uses Heroicons for help and collapse affordances, supports hover/focus/click/escape help behavior, exposes semantic `aria-controls` state, and accepts an optional concrete `helpExample`.
- `AuthoringHealthSummary` standardizes saved/unsaved/saving, blocker, and warning counts for workspace headers. `AuthoringFilterBar` standardizes `Show All`, `Show Issues`, and `Show Changed` controls with counts.
- Progression Flow, Dialogue Flow, Encounter Stage, Character Studio, Item Ecosystem, Quest Journey, Dependency Map, and Story Timeline now expose section navigation and compact health summaries. Story Timeline's issue and changed filters actively reduce the visible workspace.
- Loading failures in the audited long workspaces now explain recovery and expose a retry action; Story Timeline and dependency navigation preserve explicit inspection wording.
- Lifecycle placement fields now describe story appearance, player/world change, visible state, and story-beat boundaries in authoring language. Story context links explicitly say when they inspect a full timeline in a new tab.
- Shared `uiTokens` now include link/icon action variants and standard issue colors. Shared authoring UI tests cover health summaries, filters, semantic panel behavior, and structured empty states.

## Audit: Game-Design Content That Also Belongs Here

The game-design document should continue to describe creative goals and current-model save contracts. The following parts also contain UX/frontend standards and should be mirrored here, refined here, or eventually replaced with links to this document.

| Game-design section | UX/frontend concern to own here | Recommended treatment |
|---|---|---|
| Design Foundation | Meaningful canvas, direct gestures, context packet, useful lenses, progressive commitment, advanced escape hatch | Keep the creative principle there; define reusable shell, panel, navigation, and help behavior here. |
| Living Canvas Pattern | Canvas, Navigator, Lenses, Context Dock, Sketch Mode, Trace Mode, Bundle Review, Creative Shortcuts | Keep as workspace design language there; implement shared frontend patterns here. |
| Cross-Workspace Story Placement Expansion | Compact placement panels, avoiding duplicate full timeline views, semantic shortcuts, preserving workspace context | Keep data/save contract there; move wording, help, navigation, and panel usability standards here. |
| Shared Components To Build | `StoryPlacementPanel`, `PlacementTray`, `StoryContextStrip`, `BundleReview`, `ScopedGateBuilder`, `ConsequenceComposer` | Keep component purpose there; define interaction consistency, copy rules, collapse behavior, and helper affordances here. |
| Story Timeline usage notes | Story Navigator, Entity Occurrences, lenses to avoid scrolling every lane | Keep user workflow there; move anti-scroll and section-navigation standards here. |
| Shared Interaction Language | Sketch, Compose, Place, Inspect, Compare, Trace, Commit | Keep authoring verbs there; map each verb to frontend labels, icons, tooltips, and button styles here. |
| Shared Visual Grammar | Solid/dashed/dotted links, lock badge, flag token, reward tray, issue colors | Move long-term visual system ownership here; game-design doc can reference the stable grammar once implemented. |
| Shared Bundle Review | Created/changed/deleted records, blockers, warnings | Keep safety principle there; keep visual and interaction standard here. |
| Inspiration Applied | Articy, Twine, Machinations interaction lessons | Keep as design inspiration there; only copy concrete frontend patterns here when they become implementation standards. |

Migration rule: do not delete useful game-design content just to reduce duplication. First stabilize the UX standard here, then replace duplicate UI details in the game-design doc with short references.

## Cleanup Backlog

### P0: Make Authoring Views Navigable

- Done 2026-07-10: audit all `/author/*` route containers for width usage, max-width caps, and wasted side margins. Dense authoring routes use `AuthoringPageShell`; the intentionally capped `ItemInspectorPage` and non-authoring utility pages are documented exceptions.
- Done for shared primitive: create or standardize the shared authoring page shell.
- Done for shared primitive: create or standardize collapsible authoring panels.
- Done 2026-07-10: add responsive local section navigation to all long specialized workspaces. The shared rail has active-section highlighting and horizontal laptop behavior.
- Done for shared primitive: preserve collapsed state in localStorage where it helps repeated work.
- Done 2026-07-10: standardize saved/unsaved/saving, blocker, and warning counts with `AuthoringHealthSummary`; collapsed panel status remains visible through shared status chips and summaries.

### P0: Make Ambiguous Concepts Understandable

- Done for shared primitive: add panel-level `?` helper affordances with accessible labels and visible hover/focus/click help.
- Done 2026-07-10: cover Story Placement, Scoped Gate Builder, Consequence Composer, Bundle Review, Lifecycle Details, Story Context, Encounter Aftermath, World Placement, Progression Flow, Story Timeline, Dialogue Flow, Encounter Stage, Character Studio, Quest Journey, Dependency Map, and Advanced Details with direct helper behavior.
- Done 2026-07-10: rewrite primary copy to describe authoring intent instead of schema shape, including lifecycle placement terms and explicit inspect/review actions.
- Done 2026-07-10: keep technical metadata behind Advanced Details or clearly technical fallback surfaces.
- Done 2026-07-10: shared helpers support concrete examples, with examples added to abstract timeline and progression concepts.

### P0: Standardize Controls And Visual Assets

- Done 2026-07-10: centralize button, input, badge, issue, panel, shell, empty-state, and compact-card primitives. Existing virtualized tables remain the large repeated-row standard.
- Done 2026-07-10: use Heroicons for shared help and collapse affordances, with accessible labels and tooltips.
- Done 2026-07-10: migrate the audited long workspaces' primary actions to shared button/link variants.
- Done 2026-07-10: standardize issue tones through shared status notices, chips, and `ISSUE_CLASSES`.
- Done 2026-07-10: standardize New Tab, Generic Editor, Advanced Details, Review, Commit, Save, and Reset wording across audited authoring workflows.

### P1: Reduce Scroll And Cognitive Load

- Done 2026-07-10: add compact saved/draft/blocker/warning summaries to the audited long workspaces.
- Done 2026-07-10: split dense workspaces with section rails and context docks where the workflow benefits from side-by-side inspection.
- Done 2026-07-10: collapse low-frequency sections with persistent state and meaningful summaries.
- Done 2026-07-10: Story Timeline now provides working Show Issues and Show Changed modes; domain-specific lenses remain available where a workspace already has a more precise filter model.
- Done 2026-07-10: retain `VirtualizedTable` and virtualized searchable pickers as the repeated-row strategy for datasets that can grow; audited specialized cards remain bounded/scrollable.

### P1: Empty, Loading, And Error States

- Done for shared primitive: add a reusable structured empty-state component with title/body/action slots.
- Done 2026-07-10: replace terse empty text in high-traffic immersive/creator and specialized workspace surfaces with shared copy that explains whether the missing content is okay and what action helps next.
- Done 2026-07-10: audit loading and error states in the long workspaces; route-owned loads now provide retry guidance, while generic editor recovery remains in the shared shell.
- Done 2026-07-10: migrate the audited specialized `None`, missing-link, and no-result states to structured empty or explanatory states.

### P1: Make Save And Review Behavior Predictable

- Done 2026-07-10: use the same Preview/Review, Commit, Save Bundle, Reset Draft, and Discard Draft vocabulary across audited authoring views.
- Done 2026-07-10: header help and action labels identify whether an action opens review or writes immediately; Bundle Review remains the commit gate for multi-record bundles.
- Done 2026-07-10: compact health summaries expose draft state and issue counts before review; Bundle Review continues to show record-level changes.
- Done 2026-07-10: retryable preview/commit errors stay in Bundle Review where supported, and route-load errors expose Try Again.

### P1: Accessibility And Responsive Pass

- Done 2026-07-10: shared icon affordances have accessible names and tooltips; existing custom controls retain explicit labels or `aria-label`s.
- Done 2026-07-10: help popovers work on hover, focus, click, and Escape.
- Done 2026-07-10: collapsible panels use semantic sections/headings, buttons, `aria-expanded`, and `aria-controls`.
- Done 2026-07-10: responsive section rails and grid breakpoints prevent the dense authoring layouts from relying on fixed desktop-only navigation.
- Done 2026-07-10: wide desktop surfaces use the extra width for navigation, main authoring areas, context docks, or bounded reading columns.

## Workspace-Specific UX Notes

### Encounter Stage

- Separate the mental models clearly: participants build the fight, rewards define payoff, world placement puts it in encounter tables, story placement tells the timeline when it matters.
- Collapse advanced consequences and lifecycle details by default.
- Add helper boxes for World Placement, Story Placement, Encounter Aftermath, Atomic Encounter Consequences, and Simulation Comparison.
- Keep timeline links from pulling the author out of the encounter draft.

2026-07-09 update:

- Encounter Stage local panels now use shared `AuthoringPanel`, `StatusNotice`, and `EmptyState` primitives.
- Route actions now use explicit labels such as "Inspect In Generic Editor", "Reset Draft", and "Save Encounter Bundle".
- Visible "gate" copy was revised toward "unlock requirement" in the route workflow while internal scoped-gate APIs remain unchanged.
- Participants, rewards, aftermath, world placement, simulation, health, dossier, and direct world context panels now have helper copy.
- Empty participant columns, missing character lists, aftermath groups, health, participant dossier, and direct world context now explain what is missing and what to do next.

### Story Placement

- Continue replacing generic lifecycle wording with entity-specific authoring language.
- Keep "Runtime Encounter" understandable as "the playable encounter happens here."
- Explain that story placement is optional until timeline order, warnings, or aftermath need it.
- Keep the full Story Timeline as a separate overview, not an embedded duplicate.

### Progression Flow And Gates

- Replace "gate", "requirement", and "flag" jargon with short helper explanations near the controls.
- Make shared-use impact visible before editing a shared requirement.
- Distinguish "temporary state for walkthrough" from saved player state.

2026-07-09 update:

- Progression Flow now uses shared `AuthoringPanel` helpers for its main composer and side panels.
- Visible labels now use "unlock requirement" and "temporary player state" for the authoring workflow, while code and saved record fields still use their existing backend names.
- Empty states in the flow canvas, temporary state, usage preview, local health, and producer/consumer lists now explain what is missing and what to do next.
- Compact Flow, Temporary Player State, and Usage Preview can collapse with persisted summaries.

### Consequence Composer

- Explain whether an outcome changes the current source record, a second target, or both.
- Use "affected thing" language before target-type/id language.
- Show direct payoff, story consequence, and follow-up link as separate collapsed groups.

### Story Timeline

- Continue improving navigation so authors do not scroll across every lane.
- Keep Story Navigator and Entity Occurrences as first-class navigation, not secondary panels.
- Make lens state and focused entity state obvious.

2026-07-09 update:

- Story Timeline now uses the shared `AuthoringPageShell` and shared `AuthoringPanel` for filters/lenses, navigator, content library, timeline bands, runtime/state/issue sections, unplaced content, and context dock states.
- Story Navigator and Entity Occurrences now have panel-level helper copy and structured empty states explaining what is missing and what to do next.
- Content Library can collapse with a persisted summary, and empty library/search states now explain how to recover.
- Navigation labels in the timeline/context dock now use explicit inspect wording such as "Inspect Timeline Record", "Inspect Arc Record", "Inspect Attached Record", and "Inspect Owning Workspace".

### Dialogue Flow

- Keep the dialogue graph, rehearsal, impact, story beats, and context dock in one full-width authoring workspace.
- Make save/review language clear because dialogue lines, story beats, and beat unlinks commit as one bundle.
- Explain that rehearsal player state is temporary and does not save flags or reputation.
- Keep generic dialogue editing available as an explicit fallback, not the primary workflow.

2026-07-09 update:

- Dialogue Flow now uses the shared `AuthoringPageShell` and shared `AuthoringPanel` for the route header and local panels.
- Route actions now use explicit labels: "Inspect In Generic Editor", "Reset Draft", and "Review Dialogue Bundle".
- Scene Brief, Story Beat Track, Dialogue Library, Context Dock, Rehearsal Controls, and World Echo panels now have helper copy.
- Empty states for missing dialogues, story beats, participants, rehearsal lines, transcripts, world echo state, downstream consumers, and context links now use structured next-action copy.

### Character Studio

- Keep identity, story profile, combat/interaction roles, relationships, presence trace, and context dock in one full-width workspace.
- Make starter presets and drag/drop library actions clearly local until bundle review.
- Keep Advanced as the explicit schema fallback, not the primary character workflow.

2026-07-09 update:

- Character Studio now uses the shared `AuthoringPageShell` instead of a centered route wrapper.
- Route actions now use "Reset Draft" and "Review Character Bundle" language.
- Workspace header, creation steps, cast navigator, starters, content library, context dock, and presence trace now have helper copy through shared `AuthoringPanel`.
- Empty cast searches, empty content-library categories, and empty presence trace beats now use structured `EmptyState` copy.

### Generic Schema Editors

- Keep them as the complete technical fallback.
- Do not spend UX polish trying to make every generic form feel like a custom authoring workspace.
- Do add consistent help for Advanced Details access from specialized views.

2026-07-09 update:

- Immersive authoring now calls the fallback "Advanced Details" and adds helper text explaining that it edits the same record as the focused authoring workflow.

## Definition Of Done For UX Cleanup Work

A UX/frontend cleanup change is done when:

- The user-facing label describes the authoring action in plain language.
- The panel has a clear title, subtitle, and helper if the concept is not obvious.
- The layout uses available screen width intentionally.
- Long content can be collapsed, navigated, filtered, or summarized.
- Navigation away from the current draft is explicit and protected.
- Empty states explain what is missing and what to do next.
- Controls match shared frontend tokens and visual patterns.
- Build and relevant frontend tests pass, or any unrun/failing checks are documented.
