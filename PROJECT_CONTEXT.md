# SoAWebApp Project Context

Last reviewed: 2026-06-10

## Purpose

SoAWebApp is a local content-authoring tool for a game project. It has a Flask/SQLite backend that stores game data, a React/Vite frontend that edits that data through JSON-schema-driven forms, and UE5 integration docs/export paths for turning the data into Unreal-friendly CSV/DataTable assets.

The core entities cover gameplay, economy, world, narrative, encounters, and progression: abilities, effects, statuses, stats, attributes, character classes, talent trees/nodes, items, currencies, shops, requirements, locations, location routes, location POIs, location encounter tables, route event bindings, travel tuning, location creative briefs, factions, lore, characters, combat profiles, interaction profiles, dialogues, quests, story arcs, timelines, events, encounters, flags, and content packs.

## Repository Layout

- `app.py`: Flask entry point; imports `backend.app.create_app()`.
- `backend/app`: backend application code.
- `backend/app/models`: SQLAlchemy declarative models. Most files are named `m_<entity>.py`.
- `backend/app/routes`: Flask blueprints. Most files are named `r_<entity>.py` and subclass `BaseRoute`.
- `backend/app/schemas`: JSON schemas used both for backend required-field validation and frontend form generation.
- `backend/data`: SQLite databases and source CSV files. The active default DB is `backend/data/db.sqlite`.
- `backend/app/utils`: shared utilities, especially CSV/UE export helpers.
- `backend/tests`: pytest contract, persistence, recovery, route, bundle, and CSV tests.
- `soa-editor`: React 19 + TypeScript + Vite frontend.
- `soa-editor/src/components`: reusable editor UI, schema field renderers, dirty-state handling, nested editor drawer, command/creative/simulation widgets.
- `soa-editor/src/pages`: page wrappers for each editor route, usually just a `SchemaEditor` instance.
- `soa-editor/src/config/editorDatasets.ts`: central frontend dataset registry used by reference scanning and navigation.
- `soa-editor/src/simulation`: local heuristic simulation engine and scenario definitions.
- `soa-editor/src/presets` and `soa-editor/src/creative`: authoring helpers for presets, clone/mutate, and generated suggestions.
- `UE5_Integration*`: planning and relationship docs for Unreal import, Blueprint systems, and DataTable relationships.

## Documentation Map

- `README.md`: quick setup, core capabilities, authoring route overview, and validation commands.
- `PROJECT_CONTEXT.md`: current architecture, handoff notes, system status, and next work.
- `soa-editor/README.md`: frontend systems, authoring modes, status, and validation.
- `AUTHORING_WORKSPACES_GAME_DESIGN.md`: canonical interactive-authoring vision, current-model implementation guide, and workspace status.
- `backend/data/IMPORT_ORDER_GUIDE.txt`: source CSV import order, complete-set preflight, foreign-key, and cascade rules.
- `UE5_Integration_Plan.md`: canonical UE5 direction, currently the Real-Time Top-Down Able prototype.
- `UE5_Integration/UE5_Prototype_Step_By_Step.md`: concrete implementation sequence for the canonical Real-Time Able prototype, including the restart checklist and detailed Blueprint tutorial steps for `BP_GameDataService`, Phase 3 combatants, and Phase 4 targeting.
- `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`: canonical UE structs, enums, and DataTable import checklist.
- `UE5_Integration/UE5_Data_Relationship_Map.md`: field-level relationship and validation reference.
- `UE5_Integration/UE5_Blueprint_Systems.md`: Blueprint subsystem ownership and runtime boundaries.
- `UE5_Integration/World_Building_Authoring_Guide.md`: current world-building/location authoring capability assessment, limitations, and next data additions.
- `UE5_Integration/World_Travel_System.md`: `location_routes` movement graph design.

## System Map

- Web app: Flask backend plus React/Vite frontend for local data authoring.
- Schema editor: generic, schema-complete CRUD editor for every dataset and the Advanced Form fallback for immersive views.
- Immersive authoring: RPG-style input views for items, shops, characters, locations, world building, and dialogue flow. These are editing surfaces, not just inspectors.
- Authoring Studio: offline deterministic recipes, composer, variants, bundle drafts, and fix/enrich suggestions. It creates patches or drafts; saves still go through normal CRUD endpoints.
- CSV import/export: backend has explicit source CSVs for DB regeneration and UE CSVs for Unreal-friendly DataTable output.
- Location graph: `locations` are hierarchy/map nodes with place kind plus optional biome ecology; `location_routes` are explicit movement edges. World-building packets add POIs, encounter placement, route events, travel tuning, and creative briefs.
- Dialogue graph: dialogues and their nodes are edited and saved as one validated bundle, with local graph layout, health analysis, and playthrough.
- UE integration: CSV/DataTable mirror consumed by Blueprint systems, with Real-Time Able as the canonical gameplay prototype track.
- UE prototype current implementation shape: `BP_GameInstance_SoA` constructs a `BP_GameDataService` Blueprint Object, `BFL_SoAHelpers` exposes stateless service access, `BP_BattleCharacter` is the shared combatant base, and `BP_TargetingComponent` on `BP_PlayerController_Prototype` owns player-facing `CurrentEnemyTarget`, `CurrentAllyTarget`, and `PartyFocusTarget`.

## Current Web App Status

Working:

- Generic schema-driven CRUD editors and Advanced Form fallback.
- Specialized item, shop, character, location, atlas, World Builder, and Dialogue Flow authoring.
- Atomic World Builder, Character Creator, and Dialogue Flow bundle APIs.
- Dialogue graph creation/editing, validation, local layout/draft restore, context review, and gated playthrough.
- Project Health, deterministic local authoring helpers, source/UE CSV export, source import preview, and local heuristic simulation.
- Staged complete-source rebuild with preflight, `PRAGMA foreign_key_check`, and atomic SQLite replacement.
- Faction reputation references enforced by SQLite on fresh/rebuilt databases, with cascade cleanup limited to linked minimum-reputation rows.

Planned:

- Ability Spellcraft Lab and focused Creature Workshop.
- Continued polish and broader context editing for existing specialized authoring surfaces.

Known limitations:

- Reset-based restore/rebuild is preflighted but sequential; unexpected runtime failure after reset can leave a partial rebuilt database.
- Existing SQLite files gain new physical constraints only after reset/rebuild.
- Per-table source imports are replace-all operations.
- Dialogue layout and selected start node are local-only.
- Specialized authoring is not schema-complete; Advanced Form remains required for rare fields and unsupported datasets.
- Simulation is client-side and heuristic, not a game-runtime simulation.
- The production frontend build currently warns about a main chunk larger than 500 kB.

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

- `GET /api/export/csv/<table>` and `GET /api/export/ue/csv/<table>` export Unreal-friendly CSV.
- `GET /api/export/all-csv-zip` and `GET /api/export/ue/all-csv-zip` export every model table as UE CSV files in a ZIP.
- `GET /api/source/export/csv/<table>` exports lossless source CSV with JSON-in-CSV nested values.
- `GET /api/source/export/all-csv-zip` exports every model table as source CSV files in a ZIP.
- `POST /api/source/import/csv/<table>` imports source CSV with replace-all semantics for that table.
- `POST /api/source/import/csv/<table>/preview` previews source CSV import changes without committing.
- `POST /api/import/csv/<table>` remains as a legacy permissive CSV import path.
- `GET /api/recovery/status`, `POST /api/recovery/export-source`, `POST /api/recovery/restore-source`, and `POST /api/recovery/import-source` manage portable source-CSV recovery.
- `GET /api/ui/dialogues/<dialogue_id>` loads a Dialogue Flow editing/context packet; `POST /api/ui/dialogues/bundle` validates and atomically saves the dialogue and complete node graph.
- `POST /api/db/reset`, `/api/db/create`, `/api/db/delete`, `/api/db/select`, `GET /api/db/list`, and `GET /api/db/active` manage local SQLite database files.

Complete-source restore/rebuild preflights the source set, imports into a uniquely named sibling staging SQLite database, runs `PRAGMA foreign_key_check`, and atomically replaces the active database only after success.
The staged rebuild currently assumes the local single-user runtime; concurrent authoring requests must not run during a full restore/rebuild because the process-wide runtime engine is temporarily directed to staging.

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

Immersive authoring views are alternate input surfaces for high-use content types, not read-only inspectors.

- `/author/items/new` and `/author/items/<id>` provide RPG item-card editing for identity, rarity/type, economy, effects, requirements, and stat/attribute modifiers.
- `/author/shops/new` and `/author/shops/<id>` provide merchant-counter editing for shop identity, location/shopkeeper/currency, pricing layers, and embedded inventory rows.
- `/author/characters/new` and `/author/characters/<id>` provide dossier editing for identity, portrait, class, faction, home location, and linked combat/interaction profile context.
- `/author/locations/new` and `/author/locations/<id>` provide location-card editing, map coordinate placement, place-kind/ecology/region/level fields, encounter hooks, and route summaries.
- `/author/locations/map` shows the location atlas with nodes and `location_routes` edges.
- `/author/world` provides the engine-agnostic world-building workspace for hierarchy browsing, atlas review, POIs/interactables, encounter placement, route events, travel tuning, creative references, and world validation.
- `/author/dialogues`, `/author/dialogues/new`, and `/author/dialogues/<id>` provide the Dialogue Flow Room for graph sketching, connection, editing, health analysis, context review, and playthrough. The workspace saves the dialogue and complete node graph atomically.
- `/author/encounters`, `/author/encounters/new`, and `/author/encounters/<id>` provide the Encounter Stage for side composition, linked profile inspection, gates, rewards, location encounter-table placement, health analysis, simulation comparison, draft restoration, and atomic bundle saving.
- `/author/items/new` and `/author/items/<id>` preserve rich item mechanics authoring; `/author/items/new/ecosystem` and `/author/items/<id>/ecosystem` provide direct acquisition-source controls, POI placement, power/economy comparisons, issue validation, local drafts, and atomic bundle saving.
- `/author/quests`, `/author/quests/new`, and `/author/quests/<id>` provide the Quest Journey Board for objectives, gates, rewards, arc placement, quest givers, walkthrough context, and atomic bundle saving.
- `/author/dependencies` provides the Adventure Dependency Map for state tracing, health lenses, and constrained requirement/flag corrections.

Use Author View for normal content creation when the entity has a specialized route. Use Advanced Form when a rare technical field is missing from the immersive surface, when debugging schema behavior, or when editing a dataset without a specialized view. New-entry authoring routes such as `/author/items/new` create local drafts first; nothing is saved until the normal save action posts through the existing CRUD endpoint.

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

World graph detail: `locations` are graph nodes and can be nested through `parent_location_id`. `location_routes` are graph edges and are exported/imported as their own table. Do not add `connected_locations` back to the `locations` schema or model.

## CSV / UE Export Notes

`backend/app/utils/csv_tools.py` is the main CSV bridge. It supports two explicit modes:

- `source`: lossless source CSV for SQLite regeneration. Arrays and objects are JSON strings and UE-only exclusions are not applied.
- `ue`: generated Unreal DataTable CSV. This keeps UE row keys and UE property-text serialization where needed.

UE CSV behavior:

- It injects a UE-style row key column named `Name`.
- For tables with a `slug` column, the exported `Name` and `slug` are synchronized to deterministic slug tokens.
- For link tables without slugs, row keys are composed from meaningful fields using templates like `ability_slug + effect_slug`.
- Enum columns export enum member-name tokens, not necessarily display values.
- JSON arrays/objects are serialized as UE property text in UE mode and JSON strings in source mode.
- Source import coercion uses the JSON schema where possible for arrays, objects, numbers, booleans, and integers, and strict source import rejects malformed JSON arrays/objects.

Tests in `backend/tests/test_csv_tools.py` cover row-key ordering, slug sync, uniqueness, enum token export, slugless fallbacks, and transient reference slug aliases.

Source CSVs are the portable source of truth for rebuilding SQLite. Rebuilds require one source CSV for every persisted table. `requirement_min_faction_reputation.faction_id` has an `ON DELETE CASCADE` foreign key to `factions.id` on fresh/rebuilt databases; deleting a faction removes only linked minimum-reputation rows and leaves parent requirements intact.

`location_routes` and the world-building tables participate in CSV export/import like any other model table. Import order: `locations` first, then `requirements` if route gates are used, then `location_routes` and `travel_tuning`; dependency-heavy world tables such as POIs, encounter tables, route event bindings, and creative briefs import after their referenced narrative/gameplay tables.

## Simulation And Authoring Helpers

`soa-editor/src/simulation` is a client-side heuristic sandbox, not a server simulation.

- Supported simulation schemas include abilities, items, effects, combat profiles, characters, and encounters.
- `engine.ts` scores power/value/influence/dps/survivability/control/economy/consistency using deterministic seeded runs.
- `SimulationSandboxPage` and `SimulationWorkbench` expose this as `/simulation`, optionally preloaded via query params like `?schema=items&id=<id>`.

Creative and preset helpers are also client-side.

- `src/creative/generators.ts` makes deterministic content suggestions from theme, tone, keywords, and current data.
- `src/presets/*` contains preset data and patch application logic.
- `src/studio/localProvider.ts` can create local draft bundles, including linked fantasy locations and route edges.
- These helpers patch editor state or create local drafts; saves still go through normal backend `POST` endpoints.

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
npm run test:e2e
```

## Current Observations / Hotspots

- `backend/app/__init__.py` contains mojibake in printed status messages. It is harmless at runtime but visually noisy.
- `BaseRoute` has generic CRUD/serialization, but most real entities override serialization and processing. Check each route before assuming generic behavior.
- Relationship-heavy entities such as items, abilities, requirements, talents, encounters, quests, and events need special care because they serialize nested/link-table data.
- `SchemaEditor` is large and owns many concerns: API IO, workspace persistence, import/export, reference scanning, dirty state, drafts, and bulk actions. UI changes here can affect every editor page.
- `SchemaForm` is also shared across all schema-driven editors and nested drawers. Field-renderer changes have broad impact.
- The frontend imports backend JSON schema files directly via Vite dynamic imports, so relative path assumptions matter.
- The root `package.json` only declares `react-window`; the real frontend package is `soa-editor/package.json`.
- `scripts/rebuild_source_db.py` rebuilds the active database from a complete source CSV set.
- Complete-source rebuild uses atomic temporary-database replacement; startup partial imports remain non-destructive table replacements.
- UE5 docs are design/reference material, not executable code, but they define expected data relationships and export assumptions.

## Recently Completed Work

Completed through 2026-06-10:

- Project Health scans datasets for broken references, duplicate IDs/slugs, missing required fields, empty important arrays, and suspicious reward/chance values.
- Nested schema controls received dark-mode and usability cleanup, including array/object renderers, reference fields, tags, autocomplete, and editor-stack drawers.
- Authoring Studio was expanded with offline fantasy RPG recipes, local deterministic generation, variants, bundle drafts, and fix/enrich suggestions.
- CSV import preview was added so replace-all imports can be reviewed before committing.
- Slug/identity helpers, duplicate handling, and selected-entry query navigation were improved across editor flows.
- Immersive authoring routes were added for items, shops, characters, and locations, including `/author/.../new` draft flows.
- Item authoring and shop authoring now support normal content input through specialized RPG-style surfaces while keeping Advanced Form as fallback.
- Shops persist embedded inventory through the canonical `shops_inventory` table and serialize price previews.
- `location_routes` was added as the real movement graph edge table, with CRUD, CSV import/export, graph API, atlas rendering, and authoring panels.
- UE integration docs were updated to include `location_routes` as an exported DataTable and to avoid the obsolete `connected_locations` idea.
- Dialogue Flow Room was added with atomic bundle loading/saving, graph editing, safe deletion, health analysis, local drafts/layout, lenses, context, and gated playthrough.
- Persisted payload validation was hardened around schema types, canonical choice requirement fields, optional references, tags, and model/schema mismatches.
- Source restore/rebuild now preflights complete CSV sets before reset and runs a post-rebuild foreign-key check.
- Faction reputation rows now gain a database-enforced faction foreign key with cascade deletion on fresh/rebuilt databases; route/import behavior also reports and cleans linked rows.

## Current Next Work

UE prototype restart path:

1. Confirm `BP_GameInstance_SoA` constructs and initializes `BP_GameDataService`.
2. Confirm `DT_Stats` and `DT_Attributes` caches and typed getters work.
3. Add and smoke-test `BFL_SoAHelpers.GetGameDataService`.
4. Build Phase 3 combatants: `BP_BattleCharacter`, reparented `BP_PlayerCharacter`, manual `BP_EnemyCharacter`, and `BP_PrototypeArenaDirector` reset.
5. Build Phase 4 targeting: `BPI_Targetable`, player/controller `BP_TargetingComponent`, enemy/ally/focus target state, lock/cycle input, and a custom-depth target outline.

Web app/content tool backlog:

1. Continue polish for Quest Journey Board, Adventure Dependency Map, Encounter Stage, and existing authoring surfaces.
2. Build Ability Spellcraft Lab and focused Creature Workshop.
3. Keep Advanced Form as the schema-complete fallback for rare fields, debugging, and datasets without immersive authoring surfaces.

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
- Project health scanner: `soa-editor/src/health/projectHealth.ts`
- Project health UI: `soa-editor/src/components/health/ProjectHealthPanel.tsx`
- Dataset registry: `soa-editor/src/config/editorDatasets.ts`
- API helper: `soa-editor/src/lib/api.ts`
- Simulation engine: `soa-editor/src/simulation/engine.ts`
- UE relationship map: `UE5_Integration/UE5_Data_Relationship_Map.md`
