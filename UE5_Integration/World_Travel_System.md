# World Travel System Blueprint Plan

This plan implements overworld traversal as a data-driven node/edge graph so travel is deterministic, debuggable, and cheap to query from Blueprints. It is scoped to a "select destination -> plan route -> execute segments" JRPG travel loop (world map UI + encounters/events), and complements `UE5_Integration_Plan.md` and `UE5_Integration/Blueprint_Systems.md`.

---

## 1. Purpose and Assumptions
- Travel happens via UI/logic (not real-time character movement between POIs).
- Locations and routes are authored in SoA exports and re-imported into UE as DataTables.
- Encounters and events can interrupt travel; the system must pause/resume deterministically.

---

## 2. Data Model
| Table / Struct | Purpose | Notes |
| --- | --- | --- |
| `FLocationData` | Travel graph nodes. | Mirrors `backend/app/models/m_locations.py` (include `Coordinates` for map UI/A*; keep ULID `Id` inside the struct and use `Slug` as the DataTable Row Name). |
| `FLocationRouteData` | Travel graph edges between locations. | New export table (see `UE5_Integration/UE5_Blueprint_Integration_Guide.txt`). Include `Id` (ULID) and use `Slug` as the DataTable Row Name. |
| `FRouteEventBinding` | Optional bindings from a route to forced Events. | Use route **ULID** (preferred) or route slug (fallback) so bindings survive row renames. |
| `FTravelTuningData` | Balancing knobs for travel math (encounter odds, safe-zone rules, travel mode multipliers). | Keep probabilities/weights out of Widgets; designers tune without Blueprint rewrites. |
| `FTravelPlanSegment` | One executable segment of a planned path. | Store both `RouteId` and endpoint slugs/IDs for debug + robustness. |
| `FTravelPlan` | Full planner output (segments + totals + diagnostics). | Planner returns structured failures (missing requirements, unreachable, unaffordable). |
| `FTravelSessionState` | Persistable runtime state for pause/resume. | Needed if encounters/events load other maps or the player saves mid-travel. |

**Key Principles**
- Use ULID strings for stable cross-table references (locations, routes, requirements, currencies, flags). Use `FName` for slugs/row names in runtime hot paths.
- Requirements gate routes (bridge destroyed, faction blockade) or unlocks (airship). Ensure requirement rows exist and are covered by automation tests.
- Keep derived data single-source: don't duplicate "safe zone" or "encounter chance" in multiple places unless you need an explicit override field.

---

## 3. Subsystem Responsibilities
### `BP_WorldGraphSubsystem`
- Recommended lifetime: **World Subsystem** if travel only exists in the overworld/map world; **Game Instance Subsystem** if you need access across frequent `OpenLevel` transitions.
- Loads Locations and Routes once at init (from `BP_GameDataSubsystem` caches/DataTables).
- Builds adjacency lists keyed by Location **ULID** and/or Location **Slug** (prefer `FName` for slugs).
- Expands `IsBidirectional` route rows into both directions at build time (without duplicating DataTable rows).
- Maintains lightweight "version" counters (graph data, flags/packs, discovery/unlock state) to invalidate planner caches safely.
- Reacts to `BP_FlagManager::OnFlagChanged` and `BP_ContentPackRegistry` events to mark edges active or inactive.
- Exposes helpers: `GetAdjacency`, `IsRouteActive`, `IsRouteUnlockedOrDiscovered`, `GetRouteCost`, `GetRouteDiagnostics`.

### `BP_TravelPlanner`
- Implement as a Blueprint Function Library (or a lightweight UObject) that queries `BP_WorldGraphSubsystem`.
- Implements Dijkstra (always) and optionally A* when `FLocationData.Coordinates` are available for an admissible heuristic.
- Inputs: `FromSlug`, `ToSlug`, options (travel mode, weight mode, "require discovered routes", "require affordability", dev overrides like "ignore requirements").
- Output: `FTravelPlan` containing segments, totals, and structured diagnostics (why a plan failed).
- Supports caching keyed by (from/to/options + world-state versions) so identical queries reuse results safely.
- Emits diagnostics for missing routes or locked nodes (feeds automation tests and developer UI).

### `BP_TravelOrchestrator`
- Executes `FTravelPlan` step by step:
  1. Validate requirements per segment (fail fast if state changes mid-travel).
  2. Reserve/deduct travel cost (currency, stamina) using `BP_CurrencyManager` or player stats (pick a single rule and enforce it consistently).
  3. Trigger forced events (`FRouteEventBinding`) via `BP_EventSequencer`.
  4. Roll random encounters using a deterministic `FRandomStream` seeded per travel session (formula tuned via `FTravelTuningData` + route modifiers + player stats).
  5. Hand off to `BP_EncounterManager` and resume travel after resolution.
  6. On completion, update `BP_LocationRegistry` and push travel history for codex or log.
- Owns `FTravelSessionState` so travel can pause/resume across encounters, save/load, or map transitions.
- Developer toggles: instant travel (skip timers), force encounter, skip encounter, debug stepper UI.

### `BP_WorldMapWidget`
- Visualises nodes/edges, gating status, and planner output.
- Left-click sets destination (runs planner); right-click surfaces diagnostics (missing requirements, unlock flags).
- Development overlay can draw path heatmaps using planner-provided segment stats (keep heavy computation outside the widget).

---

## 4. Runtime Integrations
- **Fast Travel:** `BP_LocationRegistry` tracks discovered fast-travel nodes. `BP_TravelPlanner` validates direct jumps; `BP_FlagManager` enforces prerequisites (for example airship license flag). Currency costs run through `BP_CurrencyManager`.
- **Safe Zones:** Prefer an explicit route override/tag (e.g. `SafePassage`) or a single rule in `FTravelTuningData` (for example "routes connected to safe zones have encounter multiplier = 0"). Avoid duplicating safe-zone state into multiple tables unless you need a deliberate override.
- **Dynamic Route State:** Listen for flag changes to unlock edges (repair bridge). `BP_WorldGraphSubsystem` rebuilds only affected adjacency lists.
- **Story Hooks:** Story arcs or events can pin destination nodes (quest objectives) or temporarily override pathfinding (force scenic route). Expose `RegisterPriorityRoute(QuestId, RouteId, PriorityWeight)`.
- **Travel Seeds:** Store RNG seeds (and enough session state to resume) in SaveGame to reproduce bugs. Combine stable IDs with a session counter for deterministic playback.

---

## 5. Testing and Debugging
- **Automation Tests**
  - `TravelGraph_AllNodesReachable`: every non-isolated location has at least one active route respecting content pack and flag gating.
  - `TravelGraph_NoDeadEndsWithoutFlag`: locked routes expose a requirement and can unlock via documented flags.
  - `TravelPlanner_PathConsistency`: fixed data plus seed returns the same `FTravelPlan`.
  - `TravelOrchestrator_EncounterDistribution`: simulation keeps encounter rates within design tolerances.

- **Developer Tools**
  - `TravelTo <LocationSlug>` cheat builds a plan, logs segments, and teleports after optionally resolving encounters.
  - `DebugTravelPlan <From> <To>` prints each segment with requirements, costs, and encounter weights.
  - Travel graph overlay toggled via debug widget to highlight locked paths and required currencies or flags.

---

## 6. Implementation Checklist
1. Extend SoA exports with a `LocationRoute` table that includes `Id` (ULID) + `Slug` (row name) and ingest it alongside Locations.
2. Add `FTravelTuningData` (DataTable or DataAsset) so encounter odds and travel multipliers are data-driven.
3. Prototype `BP_WorldGraphSubsystem` + `BP_TravelPlanner` with a tiny sample graph (3-5 nodes) and validate both Dijkstra and optional A* (if coordinates exist).
4. Build the travel debug widget early; it doubles as validation feedback for designers and a smoke test for gating.
5. Hook forced route events into `BP_EventSequencer`, then add deterministic encounter rolling via seeded `FRandomStream`.
6. Write automation tests before expanding the world to catch data regressions (missing routes, mismatched requirements, unreachable destinations).

By keeping travel data-driven and graph-based, traversal stays flexible, scalable, and debuggable. Designers reshape the overworld by editing CSV exports, while Blueprint subsystems respond automatically.
