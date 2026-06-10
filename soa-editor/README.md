# SoA Editor Frontend

React 19 + TypeScript + Vite frontend for the SoAWebApp local RPG content editor.

## Run

```powershell
npm install
npm run dev
```

The frontend expects the Flask backend at `http://localhost:5000` by default. Override it with `VITE_API_BASE_URL` when needed.

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
- Item, shop, character, location, atlas, and World Builder authoring.
- Dialogue Flow Room with graph editing, atomic bundle save, health analysis, local drafts/layout, and playthrough.
- Encounter Stage, Item Ecosystem, Quest Journey Board, Adventure Dependency Map, and Ability Spellcraft Lab.
- Project Health, deterministic local authoring helpers, and heuristic simulation.

Planned but not implemented:

- Focused Creature Workshop and deeper expansions of the implemented authoring workspaces.

Important limitations:

- Dialogue graph layout and selected start node are stored only in local browser state.
- Specialized views do not expose every schema field.
- Simulation results are heuristic and do not represent the runtime game.

## Authoring Modes

Use immersive Author Views for normal content entry when available:

- `/author/items/new` and `/author/items/<id>` for item mechanics
- `/author/items/new/ecosystem` and `/author/items/<id>/ecosystem` for acquisition, placement, comparisons, issues, and atomic ecosystem saving
- `/author/shops/new` and `/author/shops/<id>`
- `/author/characters/new` and `/author/characters/<id>`
- `/author/locations/new` and `/author/locations/<id>`
- `/author/locations/map`
- `/author/world`
- `/author/dialogues`, `/author/dialogues/new`, and `/author/dialogues/<id>`
- `/author/encounters`, `/author/encounters/new`, and `/author/encounters/<id>`

The Dialogue Flow Room supports Select, Sketch, Connect, and Move modes. It edits dialogues and their node graph together, reports broken or ambiguous paths, restores local unsaved drafts, and can play through requirements, flags, and temporary faction-reputation overrides.

The Encounter Stage composes participants by side and context, inspects linked profiles, edits gates and rewards, places encounters into existing location tables, restores local drafts, compares simulation results, and saves the bundle atomically.

Use the generic schema editor routes for full schema coverage, rare fields, debugging, and datasets without a specialized authoring surface. Query selection works through `?selected=<id>`.

## Validation

```powershell
npm run lint
npm run build
npm run test:e2e
```
