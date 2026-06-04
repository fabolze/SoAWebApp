# SoAWebApp

This repository contains a Flask backend and a React frontend for local game-content authoring. The app stores RPG data in SQLite, exposes JSON-schema-driven CRUD APIs, and exports Unreal-friendly CSV files.

## Documentation guide

- `PROJECT_CONTEXT.md`: current architecture, system status, and next work for handoff.
- `backend/data/IMPORT_ORDER_GUIDE.txt`: CSV import order and dependency rules.
- `UE5_Integration_Plan.md`: canonical UE5 Real-Time Able prototype plan.
- `UE5_Integration/UE5_Prototype_Step_By_Step.md`: concrete Real-Time Able build sequence, including the current restart checklist and detailed Phase 2-4 Blueprint steps.
- `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`: canonical UE structs, enums, and DataTable import checklist.
- `UE5_Integration/UE5_Data_Relationship_Map.md`: field-level relationships and import validation reference.
- `UE5_Integration/World_Building_Authoring_Guide.md`: engine-agnostic world-building authoring capabilities, validation, CSV handoff, and remaining limits.
- `UE5_Integration/World_Travel_System.md`: location route graph and travel system design.

Current UE prototype implementation path: follow `UE5_Integration/UE5_Prototype_Step_By_Step.md`, especially the "Returning After A Long Break" checklist and "What To Do First" section. The immediate Blueprint sequence is `BP_GameDataService` helper access, `BP_BattleCharacter`, manual `BP_EnemyCharacter`, arena reset, and then player/controller targeting with `CurrentEnemyTarget`, `CurrentAllyTarget`, and `PartyFocusTarget`.

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
  - Many link tables do not have a `slug` column; import/export will therefore not include it for those tables.
  - `location_routes` is a real export/import table for graph movement edges. Import it after `locations`, and after `requirements` if routes use locks.
  - For development, you can reset the database with `POST /api/db/reset`.
  - To rebuild the active local SQLite database from tracked source CSVs, run `python scripts/rebuild_source_db.py --source-dir backend/data`.

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
- `/author/shops/new` and `/author/shops/<id>`: merchant-counter editing for shop context, pricing, and embedded inventory.
- `/author/characters/new` and `/author/characters/<id>`: character dossier editing with class/faction/home context and linked combat/interaction profile summaries.
- `/author/locations/new` and `/author/locations/<id>`: location-card and atlas placement editing, including `location_routes` summaries.
- `/author/locations/map`: atlas view showing locations as graph nodes and `location_routes` as styled edges.

Use these Author Views when creating normal content. They are input surfaces that save through the same CRUD endpoints as the generic editors. Use the Advanced Form inside an authoring view when you need a rare technical field, full schema coverage, or debugging access.

### Core frontend routes

- `/`: editor landing page and project health summary.
- `/<dataset>`: generic schema editor for a dataset, for example `/items`, `/shops`, or `/location-routes`.
- `/<dataset>?selected=<id>`: opens a generic editor with a specific entry selected when available.
- `/author/items/new`, `/author/shops/new`, `/author/characters/new`, `/author/locations/new`: create local drafts in immersive authoring mode.
- `/author/world`: world-building workspace for hierarchy, atlas, POIs/interactables, encounter placement, route events, travel tuning, creative briefs, and validation.
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
```

