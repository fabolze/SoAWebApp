# SoAWebApp Project Context

Last reviewed: 2026-04-30

## Purpose

SoAWebApp is a local content-authoring tool for a game project. It has a Flask/SQLite backend that stores game data, a React/Vite frontend that edits that data through JSON-schema-driven forms, and UE5 integration docs/export paths for turning the data into Unreal-friendly CSV/DataTable assets.

The core entities cover gameplay, economy, world, narrative, encounters, and progression: abilities, effects, statuses, stats, attributes, character classes, talent trees/nodes, items, currencies, shops, requirements, locations, factions, lore, characters, combat profiles, interaction profiles, dialogues, quests, story arcs, timelines, events, encounters, flags, and content packs.

## Repository Layout

- `app.py`: Flask entry point; imports `backend.app.create_app()`.
- `backend/app`: backend application code.
- `backend/app/models`: SQLAlchemy declarative models. Most files are named `m_<entity>.py`.
- `backend/app/routes`: Flask blueprints. Most files are named `r_<entity>.py` and subclass `BaseRoute`.
- `backend/app/schemas`: JSON schemas used both for backend required-field validation and frontend form generation.
- `backend/app/data`: SQLite databases and seed CSV files. The active default DB is `backend/data/db.sqlite`.
- `backend/app/utils`: shared utilities, especially CSV/UE export helpers.
- `backend/tests`: pytest tests, currently focused on CSV export helpers.
- `soa-editor`: React 19 + TypeScript + Vite frontend.
- `soa-editor/src/components`: reusable editor UI, schema field renderers, dirty-state handling, nested editor drawer, command/creative/simulation widgets.
- `soa-editor/src/pages`: page wrappers for each editor route, usually just a `SchemaEditor` instance.
- `soa-editor/src/config/editorDatasets.ts`: central frontend dataset registry used by reference scanning and navigation.
- `soa-editor/src/simulation`: local heuristic simulation engine and scenario definitions.
- `soa-editor/src/presets` and `soa-editor/src/creative`: authoring helpers for presets, clone/mutate, and generated suggestions.
- `UE5_Integration*`: planning and relationship docs for Unreal import, Blueprint systems, and DataTable relationships.

## Backend Architecture

The backend is a Flask app assembled in `backend/app/__init__.py`.

- `create_app()` enables CORS, initializes the SQLite schema with `init_db()`, registers all entity blueprints, and installs a JSON global error handler.
- Runtime database setup is in `backend/app/db/init_db.py`. It builds a SQLAlchemy engine from `SQLALCHEMY_DATABASE_URI`, enables SQLite foreign keys, exposes `get_db_session()`, and supports switching active SQLite files.
- `backend/app/config.py` resolves `DATA_DIR` and defaults to `sqlite:///backend/data/db.sqlite`.
- Models use a shared declarative `Base` from `backend/app/models/base.py`. They do not use the Flask-SQLAlchemy `db.Model` pattern.
- `backend/app/models/__init__.py` dynamically imports every model module and builds `ALL_MODELS`, which export/import routes use.

Most entity routes inherit from `backend/app/routes/base_route.py`.

- `BaseRoute` registers `GET /api/<resource>`, `GET /api/<resource>/<id>`, `POST /api/<resource>`, and `DELETE /api/<resource>/<id>`.
- Subclasses provide `get_id_from_data()`, `serialize_item()`, and often custom `process_input_data()`.
- `BaseRoute` also maintains `ROUTE_REGISTRY`, used by CSV import/export to resolve serializers and processors.
- Common behavior includes enum coercion, relationship validation, dynamic serialization fallback, JSON tag filtering, and slug/tag normalization.

CSV and DB admin endpoints:

- `GET /api/export/csv/<table>` exports a table to CSV.
- `GET /api/export/all-csv-zip` exports every model table as CSV files in a ZIP.
- `POST /api/import/csv/<table>` imports a CSV with replace-all semantics for that table.
- `POST /api/db/reset`, `/api/db/create`, `/api/db/delete`, `/api/db/select`, `GET /api/db/list`, and `GET /api/db/active` manage local SQLite database files.

## Frontend Architecture

The frontend is in `soa-editor` and uses React 19, React Router 7, TypeScript, Vite 6, Tailwind/DaisyUI classes, Heroicons, dnd-kit, and react-window.

- `src/main.tsx` renders `AppRoot`.
- `src/AppRoot.tsx` defines all routes under `Layout` and wraps everything in `DirtyStateProvider` and `EditorStackProvider`.
- `src/components/Layout.tsx` provides the sidebar plus routed page outlet.
- `src/components/Sidebar.tsx` groups routes into System, Gameplay, World, and Narrative. It supports filtering, collapse, drag reorder, group collapse, and dirty-navigation confirmation. Sidebar state is stored in localStorage.
- `src/lib/api.ts` centralizes API base URL handling. Default backend is `http://localhost:5000`; override with `VITE_API_BASE_URL`.

The main editing experience is schema-driven:

- Page files usually render `<SchemaEditor schemaName="..." apiPath="..." />`.
- `SchemaEditor` loads JSON schemas from `backend/app/schemas`, loads entries from `/api/<apiPath>`, manages selection/search/sort, add/duplicate/delete/bulk actions, CSV import/export, reference scans, draft restore, dirty tracking, and localStorage workspace persistence.
- `EntryListPanel` handles the left/list side of an editor.
- `EntryFormPanel` handles the right/form side, including reference summaries and creative/preset tools.
- `SchemaForm` renders fields based on JSON schema properties and `ui` metadata.
- Field rendering is split across `src/components/schemaForm/*`.
- Older/special schema field components live in `src/components/SchemaFields/*`.
- `EditorStackProvider` powers inline creation of referenced entities in a drawer.
- `DirtyStateProvider` tracks unsaved editor state and prompts before navigation/unload.

## Schema Contract

Adding or changing an entity usually requires synchronized edits in several places:

1. Backend model in `backend/app/models/m_<entity>.py`.
2. Backend route in `backend/app/routes/r_<entity>.py`.
3. JSON schema in `backend/app/schemas/<schema_name>.json`.
4. Blueprint registration in `backend/app/__init__.py`.
5. Frontend page in `soa-editor/src/pages/<Entity>Editor.tsx`.
6. Route entry in `soa-editor/src/AppRoot.tsx`.
7. Sidebar entry in `soa-editor/src/components/Sidebar.tsx`.
8. Dataset registry entry in `soa-editor/src/config/editorDatasets.ts`.
9. Tests or CSV helper coverage when import/export semantics change.

Important naming detail: backend API paths are not always the same as schema/table names. Examples: schema `combat_profiles` uses API path `combat_profiles`; `content_packs` uses `content-packs`; `shops_inventory` uses `shop-inventory`; `dialogue_nodes` uses `dialogue-nodes`.

## CSV / UE Export Notes

`backend/app/utils/csv_tools.py` is the main Unreal export bridge.

- It injects a UE-style row key column named `Name`.
- For tables with a `slug` column, the exported `Name` and `slug` are synchronized to deterministic slug tokens.
- For link tables without slugs, row keys are composed from meaningful fields using templates like `ability_slug + effect_slug`.
- Enum columns export enum member-name tokens, not necessarily display values.
- JSON arrays/objects are serialized as JSON strings.
- Import coercion uses the JSON schema where possible for arrays, objects, numbers, booleans, and integers.

Tests in `backend/tests/test_csv_tools.py` cover row-key ordering, slug sync, uniqueness, enum token export, slugless fallbacks, and transient reference slug aliases.

## Simulation And Authoring Helpers

`soa-editor/src/simulation` is a client-side heuristic sandbox, not a server simulation.

- Supported simulation schemas include abilities, items, effects, combat profiles, characters, and encounters.
- `engine.ts` scores power/value/influence/dps/survivability/control/economy/consistency using deterministic seeded runs.
- `SimulationSandboxPage` and `SimulationWorkbench` expose this as `/simulation`, optionally preloaded via query params like `?schema=items&id=<id>`.

Creative and preset helpers are also client-side.

- `src/creative/generators.ts` makes deterministic content suggestions from theme, tone, keywords, and current data.
- `src/presets/*` contains preset data and patch application logic.
- These helpers patch editor state; saves still go through normal backend `POST` endpoints.

## Running And Testing

Backend:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Frontend:

```powershell
cd soa-editor
npm install
npm run dev
```

Validation:

```powershell
pytest
cd soa-editor
npm run build
npm run lint
```

## Current Observations / Hotspots

- `backend/app/__init__.py` contains mojibake in printed status messages. It is harmless at runtime but visually noisy.
- `BaseRoute` has generic CRUD/serialization, but most real entities override serialization and processing. Check each route before assuming generic behavior.
- Relationship-heavy entities such as items, abilities, requirements, talents, encounters, quests, and events need special care because they serialize nested/link-table data.
- `SchemaEditor` is large and owns many concerns: API IO, workspace persistence, import/export, reference scanning, dirty state, drafts, and bulk actions. UI changes here can affect every editor page.
- `SchemaForm` is also shared across all schema-driven editors and nested drawers. Field-renderer changes have broad impact.
- The frontend imports backend JSON schema files directly via Vite dynamic imports, so relative path assumptions matter.
- The root `package.json` only declares `react-window`; the real frontend package is `soa-editor/package.json`.
- The `scripts` folder is currently empty.
- UE5 docs are design/reference material, not executable code, but they define expected data relationships and export assumptions.

## Improvement Backlog

Prioritized UX/data-authoring improvements captured on 2026-04-30:

1. Reference Health + Data Quality: broken references, duplicate IDs/slugs, missing required fields, empty important arrays, invalid reward/link setups.
2. Finish dark mode in nested controls: array editors, multiselects, autocomplete, tag inputs, reference inspectors, editor stack drawers.
3. Make nested arrays easier: row summaries, duplicate-row actions, collapsed row editing, and row presets for rewards, stat modifiers, participants, choices, and progression.
4. Schema navigation / relationship view: outbound references, inbound references, related quests/dialogues/encounters/items, and quick-open links.
5. Better Authoring Studio presets: richer recipes for common RPG authoring tasks such as NPC vendors, quest starters, elite encounters, status combos, and themed shops.
6. Import preview + safer CSV tools: preview changed/added rows, show validation errors, and support rollback-oriented workflows.
7. Generated IDs / slug policy: predictable generation, collision detection, and regenerate-from-name controls.

## Fast Lookup

- Backend app factory: `backend/app/__init__.py`
- Runtime DB/session: `backend/app/db/init_db.py`
- Generic route base: `backend/app/routes/base_route.py`
- CSV import/export logic: `backend/app/routes/r_export.py`, `backend/app/routes/r_bulk_export.py`, `backend/app/utils/csv_tools.py`
- DB admin: `backend/app/routes/r_db_admin.py`, `soa-editor/src/pages/SettingsPage.tsx`
- Frontend routes: `soa-editor/src/AppRoot.tsx`
- Sidebar/navigation: `soa-editor/src/components/Sidebar.tsx`
- Generic editor: `soa-editor/src/components/SchemaEditor.tsx`
- Generic form: `soa-editor/src/components/SchemaForm.tsx`
- Dataset registry: `soa-editor/src/config/editorDatasets.ts`
- API helper: `soa-editor/src/lib/api.ts`
- Simulation engine: `soa-editor/src/simulation/engine.ts`
- UE relationship map: `UE5_Integration/UE5_Data_Relationship_Map.md`
