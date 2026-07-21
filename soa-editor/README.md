# SoA Editor Frontend

React 19 + TypeScript + Vite frontend for the SoAWebApp local RPG content editor.

For authoring UX standards, cleanup backlog, full-width layout rules, collapsible panel expectations, helper affordances, and shared frontend assets, see `../AUTHORING_UX_FRONTEND_PLAN.md`.

## Run

```powershell
npm ci
npm run dev
```

Run these commands from `soa-editor`, using Node.js 22 LTS (recommended; Node.js 20 is also supported). The frontend expects the Flask backend at `http://localhost:5000` by default. Override it with `VITE_API_BASE_URL` when needed. See `../README.md` for the complete fresh-PC setup, including Python, the backend, Playwright, and local data.

## Main Systems

- `src/AppRoot.tsx`: route registration.
- `src/components/SchemaEditor.tsx`: generic dataset editor used by the normal CRUD pages and Advanced Form fallback.
- `src/config/editorDatasets.ts`: dataset registry used for navigation, reference scans, and relationship helpers.
- `src/components/authoring`: immersive authoring components for item, shop, character, location, world, and dialogue workflows.
- `src/studio` and `src/presets`: offline recipes, generation providers, variants, and draft bundle helpers.
- `src/health`: project health and reference-quality scanning.
- `src/simulation`: local heuristic balancing sandbox.

## Current Status

Working:

- Generic schema editors and Advanced Form fallback for all registered datasets.
- Item, shop, Character Studio, location, atlas, and World Builder authoring.
- Dialogue Flow Room with graph editing, atomic bundle save, health analysis, local drafts/layout, and playthrough.
- Encounter Stage, Item Ecosystem, Quest Journey Board, Adventure Dependency Map, and Ability Spellcraft Lab.
- Narrative Creation Flow through embedded Dialogue/World/Encounter/Quest/Event/POI entry points and `/author/creation-flow`, with safe insert/duplicate/undo editing, local recovery, typed branch rehearsal, canonical review, and atomic commit.
- Interactive Story Timeline and Adventure Board with scoped canonical lanes, Story Navigator overview, switchable entity occurrence tracks, focused lenses, drag/drop local planning, typed lifecycle attachments, preview, and atomic commit to canonical adventure beats.
- Project Health, deterministic local authoring helpers, and heuristic simulation.

Planned but not implemented:

- Direct editing/reordering of already-canonical adventure beats on the Story Timeline canvas, richer editing of entity lifecycle tracks, focused Creature Workshop, and deeper expansions of the implemented authoring workspaces.

Important limitations:

- Dialogue graph layout and selected start node are stored only in local browser state.
- Specialized views do not expose every schema field.
- Simulation results are heuristic and do not represent the runtime game.

## Authoring Modes

Use immersive Author Views for normal content entry when available:

- `/author/items/new` and `/author/items/<id>` for item mechanics
- `/author/items/new/ecosystem` and `/author/items/<id>/ecosystem` for acquisition, placement, comparisons, issues, and atomic ecosystem saving
- `/author/shops/new` and `/author/shops/<id>`
- `/author/characters/new` and `/author/characters/<id>` for Character Studio constellation, dossier, directed relationships, Presence Trace, staged bundle review, and ensemble editing
- `/author/locations/new` and `/author/locations/<id>`
- `/author/locations/map`
- `/author/world`
- `/author/dialogues`, `/author/dialogues/new`, and `/author/dialogues/<id>`
- `/author/encounters`, `/author/encounters/new`, and `/author/encounters/<id>`
- `/author/story-timeline` for scoped story lanes, drag/drop planning, typed links, and canonical bundle review

Story Timeline workflow:

- Start with **Story Navigator** to jump to a timeline or arc.
- Use **Entity Occurrences** to inspect repeated locations, characters, important items, quests, or factions without scrolling through every story lane.
- Use lenses to narrow the board to story, cast, locations, quests, runtime, state, or issues.
- Drag library content onto an arc lane to create a local planning beat; drag or attach more content to that local beat to build its implementation context.
- Review and commit the local plan when it should become canonical `adventure_beats` and lifecycle-aware `adventure_beat_links`.

Current capability: `adventure_beat_links` can now mark occurrence kind, change type, state label, optional start/end beats, continuity group, and importance. The navigator uses that metadata to show focused tracks for locations, characters, important items, quests, and factions; full direct editing of existing canonical links on the canvas is still a future workflow.

The Dialogue Flow Room supports Select, Sketch, Connect, and Move modes. It edits dialogues and their node graph together, reports broken or ambiguous paths, restores local unsaved drafts, and can play through requirements, flags, and temporary faction-reputation overrides.

The Encounter Stage composes participants by side and context, inspects linked profiles, edits gates and rewards, places encounters into existing location tables, restores local drafts, compares simulation results, and saves the bundle atomically.

Character Studio stages all edits locally until preview and atomic commit. Canvas arrangement remains browser-local; character story profiles, directed relationships, and story beats are canonical source data. Dialogue nodes may link a speaker character while retaining fallback speaker text.

Use the generic schema editor routes for full schema coverage, rare fields, debugging, and datasets without a specialized authoring surface. Query selection works through `?selected=<id>`.

## Validation

```powershell
npm run lint
npm run test:unit
npm run build
npx playwright install chromium
npm run test:e2e
```
