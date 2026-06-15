# SoAWebApp

This repository contains a Flask backend and a React frontend for local game-content authoring. The app stores RPG data in SQLite, exposes JSON-schema-driven CRUD APIs, and exports Unreal-friendly CSV files.

## Documentation guide

- `PROJECT_CONTEXT.md`: current web-app architecture, implementation status, limitations, and next work.
- `soa-editor/README.md`: frontend routes, authoring modes, and frontend validation.
- `AUTHORING_WORKSPACES_GAME_DESIGN.md`: canonical interactive-authoring vision, current-model implementation guide, and workspace status.
- `backend/data/IMPORT_ORDER_GUIDE.txt`: source CSV rebuild, dependency, preflight, and cascade rules.

UE5-specific documentation remains under `UE5_Integration` and is maintained separately from these web-app guides.

## Current web-app status

Working:

- Generic schema-driven CRUD editors and Advanced Form fallback for all registered datasets.
- Specialized Item Ecosystem, Quest Journey Board, Adventure Dependency Map, shop, Character Studio, location, atlas, world-builder, Dialogue Flow, and Encounter Stage authoring.
- Atomic bundle APIs for cross-record authoring workspaces.
- Dialogue Scene graph authoring, story-beat tracks, inline branching, validation, local layout/grouping restore, rehearsal, World Echo, and atomic bundle review.
- Source CSV export/import and staged full-source rebuilds with preflight, foreign-key checks, and atomic SQLite replacement.
- Database-enforced faction reputation references on fresh or rebuilt databases, with faction deletion cascading only linked minimum-reputation rows.
- Project Health, local deterministic authoring helpers, and the local heuristic simulation sandbox.

Planned:

- Focused Creature Workshop and future Ability Spellcraft Lab expansions.
- Broader cross-domain context and impact views using existing data contracts.

Known limitations:

- Source rebuild is preflighted but still sequential after reset; an unexpected runtime failure can leave a partial rebuilt database.
- Existing SQLite files receive newly added physical constraints only after reset or source rebuild.
- Per-table source imports use replace-all semantics and can remove omitted rows.
- Graph layout and selected Dialogue Flow start node are local-only.
- Specialized authoring does not cover every field or dataset; Advanced Form remains necessary.
- Simulation is a client-side heuristic tool, not runtime game simulation.

## Backend setup

```
python -m venv .venv
# On Windows
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

To run the backend locally:

```
python app.py
```

The app will start with debug mode enabled and will initialize the SQLite database if it doesn't exist.

### CSV Import/Export

- Endpoints:
  - `GET /api/export/csv/<table>` or `GET /api/export/ue/csv/<table>`: Exports Unreal-friendly CSV for one table.
  - `GET /api/export/all-csv-zip` or `GET /api/export/ue/all-csv-zip`: Exports all Unreal-friendly CSV tables in a ZIP.
  - `GET /api/source/export/csv/<table>`: Exports lossless source CSV for one table, preserving arrays/objects as JSON-in-CSV.
  - `GET /api/source/export/all-csv-zip`: Exports all lossless source CSV tables in a ZIP.
  - `POST /api/source/import/csv/<table>/preview`: Parses a source CSV import and reports added/updated/deleted/unchanged rows without committing.
  - `POST /api/source/import/csv/<table>`: Imports a source CSV into a table. Existing rows are cleared before import (replace-all behavior).
  - `POST /api/import/csv/<table>` remains available as the legacy permissive import path.

- Required columns when importing:
  - `id`: Required for all entities (ULID string). Imports fail if missing or empty.
  - `slug`: Optional. If missing for tables that have a slug column, the server will derive one from `name` or `title` (fallback: `id`).

- Notes:
  - UE CSVs are generated artifacts for Unreal DataTables. Source CSVs are the database-regeneration format.
  - Full-source restore/rebuild validates the complete source set, imports into a sibling staging SQLite database, runs `PRAGMA foreign_key_check`, and atomically replaces the active database only after success.
  - Staged rebuild is intended for the local single-user runtime. Do not serve concurrent authoring requests while a full restore/rebuild is running.
  - `requirement_min_faction_reputation.faction_id` references `factions.id` with `ON DELETE CASCADE` on fresh or rebuilt databases. Faction deletion reports the linked reputation rows removed.
  - Many link tables do not have a `slug` column; import/export will therefore not include it for those tables.
  - `location_routes` is a real export/import table for graph movement edges. Import it after `locations`, and after `requirements` if routes use locks.
  - For development, you can reset the database with `POST /api/db/reset`.
  - To rebuild the active local SQLite database from tracked source CSVs, run `python scripts/rebuild_source_db.py --source-dir backend/data`.
  - Recovery endpoints are `GET /api/recovery/status`, `POST /api/recovery/export-source`, `POST /api/recovery/restore-source`, and `POST /api/recovery/import-source`.
  - Dialogue Scene uses `GET /api/ui/dialogues/<dialogue_id>`, rollback-only `POST /api/ui/dialogues/preview`, and atomic `POST /api/ui/dialogues/bundle`.
  - Character Studio uses `GET /api/ui/character-studio/<character_id>`, rollback-only `POST /api/ui/character-studio/preview`, and atomic `POST /api/ui/character-studio/bundle`.
  - Character narrative records plus canonical adventure beats and typed beat links are included in source recovery exports and intentionally excluded from UE exports.

## Frontend setup

The React frontend lives in the `soa-editor` directory.

```
cd soa-editor
npm install
npm run dev
```

This starts the Vite dev server with hot reload enabled.

### Authoring Views

The generic schema editors remain available for every table. In addition, the frontend has immersive authoring routes for common input workflows:

- `/author/items/new` and `/author/items/<id>`: RPG item-card editing for identity, economy, effects, requirements, and modifiers.
- `/author/abilities`, `/author/abilities/new`, and `/author/abilities/<id>`: interactive Ability Spellcraft Lab for timed payload composition, advanced status lifecycles, impact-field and rhythm traces, local variants, saved ability relationships, contextual profile/encounter contribution, bundle review, and atomic saves.
- `/author/shops/new` and `/author/shops/<id>`: merchant-counter editing for shop context, pricing, and embedded inventory.
- `/author/characters/new` and `/author/characters/<id>`: character dossier editing with class/faction/home context and linked combat/interaction profile summaries.
- `/author/locations/new` and `/author/locations/<id>`: location-card and atlas placement editing, including `location_routes` summaries.
- `/author/locations/map`: atlas view showing locations as graph nodes and `location_routes` as styled edges.
- `/author/dialogues`, `/author/dialogues/new`, and `/author/dialogues/<id>`: Dialogue Scene Room for graph authoring, story beats, rehearsal, World Echo, health analysis, context review, and atomic bundle review.
- `/author/encounters`, `/author/encounters/new`, and `/author/encounters/<id>`: Encounter Stage for side composition, profile inspection, rewards, gates, placement, health analysis, simulation comparison, and atomic bundle saving.
- `/author/items/new` and `/author/items/<id>`: rich item mechanics authoring; `/author/items/new/ecosystem` and `/author/items/<id>/ecosystem` compose acquisition sources, placement, comparisons, validation, and atomic bundle saving.
- `/author/quests`, `/author/quests/new`, and `/author/quests/<id>`: Quest Journey Board for ordered objectives, requirements, arc placement, quest givers, rewards, walkthrough context, and atomic bundle saving.
- `/author/story-timeline`: Story Timeline and Adventure Board for scoped story lanes, focused lenses, drag/drop planning, typed cross-domain attachments, and reviewed atomic promotion into canonical adventure beats.
- `/author/dependencies`: Adventure Dependency Map for flag, requirement, gated-content, event-chain, and story-arc tracing.

The backend exposes `/api/ui/adventure-timeline` as the read aggregation contract, plus rollback-only `/api/ui/adventure-timeline/preview` and atomic `/api/ui/adventure-timeline/bundle`. Canonical `adventure_beats` and typed `adventure_beat_links` preserve cross-domain story intent without claiming one global player path or rewriting linked quests, events, locations, characters, dialogue, or encounters.

Use these Author Views when creating normal content. They are input surfaces that save through the same CRUD endpoints as the generic editors. Use the Advanced Form inside an authoring view when you need a rare technical field, full schema coverage, or debugging access.

### Core frontend routes

- `/`: editor landing page and project health summary.
- `/<dataset>`: generic schema editor for a dataset, for example `/items`, `/shops`, or `/location-routes`.
- `/<dataset>?selected=<id>`: opens a generic editor with a specific entry selected when available.
- `/author/items/new`, `/author/shops/new`, `/author/characters/new`, `/author/locations/new`: create local drafts in immersive authoring mode.
- `/author/world`: world-building workspace for hierarchy, atlas, POIs/interactables, encounter placement, route events, travel tuning, creative briefs, and validation.
- `/author/dialogues`, `/author/dialogues/new`, `/author/dialogues/:id`: Dialogue Flow graph workspace.
- `/author/encounters`, `/author/encounters/new`, `/author/encounters/:id`: Encounter Stage workspace.
- `/inspect/items/:id`: read-focused item context inspector.
- `/simulation`: local heuristic simulation sandbox.

## Validation

Backend:

```
pytest
```

Frontend:

```
cd soa-editor
npm run lint
npm run build
npm run test:e2e
```

