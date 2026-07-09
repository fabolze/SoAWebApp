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

Last reviewed: 2026-07-09

| Area | Status | Notes |
|---|---|---|
| Documentation split | Started | This file is the dedicated UX/frontend companion to the game-design document. |
| Authoring view full-width audit | Started | `ImmersiveAuthoringPage` and `LocationAtlasPage` now use full-width route containers. Continue auditing all other `/author/*` routes for remaining `max-w-*` shells. |
| Collapsible authoring panels | Started | Shared `AuthoringPanel` now supports collapse/expand, persistent localStorage state, status chips, and collapsed summaries. Item, shop, character, and location immersive panels have initial coverage. |
| Local section navigation | Started | Item, shop, character, and location immersive authoring views now have a sticky wide-screen section rail with anchors. Other long authoring workspaces still need this pattern. |
| Contextual help affordance | Started | Shared `AuthoringPanel` now supports a `?` helper with accessible labels and plain-language help. Initial panel help is added to item/shop/character/location immersive views and Advanced Details. |
| Wording and vocabulary cleanup | Started | Story Placement was the first visible example. Immersive authoring now uses "Advanced Details", "unlock requirement", "default value", and explicit inspect/review labels. Continue with lifecycle, gates, consequences, bundle review, and advanced schema terms. |
| Navigation preservation | Started | Immersive authoring links now avoid generic "Open" labels and use explicit inspect/edit/review wording. Dirty-state protection remains in existing guarded route links; new-tab/return-path behavior still needs broader audit. |
| Shared frontend assets and controls | Started | `AuthoringPanel` and `AuthoringStatusChip` centralize panel and chip behavior in `soa-editor/src/components/authoringUi`. Buttons still come from `uiTokens`; more surfaces need migration. |
| Scroll and density cleanup | Started | Low-frequency immersive panels such as modifiers, pricing, role links, atlas placement, and place/ecology can collapse with compact summaries. Broader workspace density cleanup remains. |
| Responsive behavior | Started | New local navigation is hidden below wide desktop and authoring surfaces remain grid-based. A full responsive visual pass is still needed. |
| Accessibility and keyboard use | Started | Panel help buttons, section links, and collapse buttons have accessible labels/focus styles. A full accessibility pass across icon-only buttons and custom controls remains. |
| Empty/error/loading states | Needed | Empty states should explain what is missing, why it matters, and the next useful action. |

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

- `ImmersiveAuthoringPage` now removes the centered `max-w-7xl` shell and uses a full-width route container.
- Item, shop, character, and location immersive authoring views now render beside a sticky local section rail on wide screens.
- `LocationAtlasPage` also uses the available route width.
- Remaining work: extract a dedicated reusable page-shell component instead of keeping shell composition inside `ImmersiveAuthoringPage`, then apply it to other long `/author/*` routes.

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
- Initial help copy was added for Item Card, Economy And Access, Mechanics, Modifiers, Merchant Front, Pricing Rules, Inventory Counter, Character Sheet, Role And World Links, Location Card, Atlas Placement, Place And Ecology, Routes, and Advanced Details.
- Remaining work: add comparable helpers to Story Placement, Scoped Gate Builder, Consequence Composer, Bundle Review, Encounter Stage, Story Timeline, and other long specialized workspaces.

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
- Existing button variants remain centralized in `soa-editor/src/styles/uiTokens.ts`.
- Added unit coverage for shared panel rendering and collapse summaries in `soa-editor/src/components/authoringUi/authoringUi.test.ts`.

### Empty, Loading, And Error States

Every empty state should answer:

1. What is missing?
2. Is that okay right now?
3. What is the next useful action?

Example:

- Weak: "No story placements found."
- Better: "No story placement yet. That is fine while drafting; add one when you want the timeline, warnings, or aftermath to know when this encounter happens."

Error states should identify whether the author can retry, needs to save first, needs to create a referenced record, or hit a real backend failure.

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

- Started: audit all `/author/*` route containers for width usage, max-width caps, and wasted side margins. `ImmersiveAuthoringPage` and `LocationAtlasPage` are updated; other routes remain.
- Started: create or standardize the shared authoring page shell. Current implementation is inside `ImmersiveAuthoringPage`; extract a reusable shell next.
- Done for shared primitive: create or standardize collapsible authoring panels.
- Started: add local section navigation to long workspaces. Initial coverage exists for item/shop/character/location immersive authoring.
- Done for shared primitive: preserve collapsed state in localStorage where it helps repeated work.
- Started: make collapsed panel headers show warning/blocker/dirty counts. Initial status chips exist; blocker/dirty count conventions still need standardization.

### P0: Make Ambiguous Concepts Understandable

- Done for shared primitive: add panel-level `?` helper affordances.
- Started: start with Story Placement, Scoped Gate Builder, Consequence Composer, Bundle Review, Lifecycle Details, Story Context, Encounter Aftermath, World Placement, and Advanced Form. Advanced Form is now "Advanced Details"; the listed specialized panels still need direct pass-through.
- Started: rewrite primary copy to describe authoring intent instead of schema shape.
- Started: move technical metadata into "Advanced Details" sections.
- Add examples to abstract helpers where a label alone is not enough.

### P0: Standardize Controls And Visual Assets

- Started: centralize button, input, badge, issue, panel, and compact-card classes. Panels/chips now have shared primitives; buttons/inputs already have partial shared tokens; issue/card standards remain.
- Pick one icon source for common actions and use it consistently.
- Started: replace ad hoc action links with standard button/link variants.
- Standardize issue colors and wording across health panels, context strips, review panels, and empty states.
- Started: standardize "new tab", "generic editor", "advanced", "review", "commit", and "reset" actions. Immersive authoring now uses explicit inspect/review/Advanced Details wording.

### P1: Reduce Scroll And Cognitive Load

- Give each long workspace a compact top summary of saved state, draft state, blockers, and warnings.
- Started: split dense pages into main task area plus context dock instead of one long vertical stack. Immersive authoring now has a wide-screen section rail; true context docks remain future work.
- Started: collapse low-frequency sections by default after the primary workflow is complete.
- Add "show only issues" and "show only changed" modes where pages become noisy.
- Make repeated rows/cards virtualized or paged where datasets can grow large.

### P1: Make Save And Review Behavior Predictable

- Use the same language for preview, commit, save draft, reset, and discard across authoring views.
- Make it clear when a button saves immediately versus opens a review.
- Show what changed since the last saved packet in a compact form.
- Keep retryable backend errors in the same review surface when possible.

### P1: Accessibility And Responsive Pass

- Ensure all icon-only buttons have accessible names and tooltips.
- Ensure help popovers work with keyboard focus.
- Ensure collapsible panels use semantic headings and controls.
- Verify no text overlaps or spills out on common laptop widths.
- Verify wide desktop surfaces use extra width productively.

## Workspace-Specific UX Notes

### Encounter Stage

- Separate the mental models clearly: participants build the fight, rewards define payoff, world placement puts it in encounter tables, story placement tells the timeline when it matters.
- Collapse advanced consequences and lifecycle details by default.
- Add helper boxes for World Placement, Story Placement, Encounter Aftermath, Atomic Encounter Consequences, and Simulation Comparison.
- Keep timeline links from pulling the author out of the encounter draft.

### Story Placement

- Continue replacing generic lifecycle wording with entity-specific authoring language.
- Keep "Runtime Encounter" understandable as "the playable encounter happens here."
- Explain that story placement is optional until timeline order, warnings, or aftermath need it.
- Keep the full Story Timeline as a separate overview, not an embedded duplicate.

### Progression Flow And Gates

- Replace "gate", "requirement", and "flag" jargon with short helper explanations near the controls.
- Make shared-use impact visible before editing a shared requirement.
- Distinguish "temporary state for walkthrough" from saved player state.

### Consequence Composer

- Explain whether an outcome changes the current source record, a second target, or both.
- Use "affected thing" language before target-type/id language.
- Show direct payoff, story consequence, and follow-up link as separate collapsed groups.

### Story Timeline

- Continue improving navigation so authors do not scroll across every lane.
- Keep Story Navigator and Entity Occurrences as first-class navigation, not secondary panels.
- Make lens state and focused entity state obvious.

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
