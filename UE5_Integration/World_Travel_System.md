# World Travel System Blueprint Plan

Designing the overworld traversal as a node and edge graph keeps travel deterministic, data-driven, and cheap to query in Blueprints. This guide details the data, subsystems, and testing strategy that support the travel experience outlined in `UE5_Integration_Plan.md`.

---

## 1. Data Model
| Table / Struct | Description | Notes |
| --- | --- | --- |
| `FLocationData` | Nodes in the travel graph (biome, safe zone, fast travel flag, level range, encounter list). | Mirrors `backend/app/models/m_locations.py`. |
| `FLocationRouteData` | Directed edges: `from_location_id`, `to_location_id`, `travel_time`, `distance`, `requirements_id`, `encounter_weight_modifier`, `cost_currency_id`, `cost_amount`, `flags_unlock`, `flags_lock`, `is_bidirectional`. | Export as new DataTable; duplicate entries for opposite direction if needed. |
| `FRouteEventBinding` | Optional table linking route IDs to forced Event sequences. | Triggered before random rolls. |
| `FTravelPlanSegment` | Runtime struct produced by planner: `RouteId`, `FromSlug`, `ToSlug`, `TravelTime`, `EncounterChance`, `Cost`, `IsSafePassage`. | Consumed by travel UI and orchestrator. |

**Key Principles**
- Use ULID strings for every ID (locations, requirements, currencies, flags). Slug remains the DataTable row name.
- Requirements gate routes (bridge destroyed, faction blockade) or unlocks (airship). Ensure requirement rows exist and are covered by automation tests.
- Store encounter weight overrides per route to bias the default location encounter lists (for example haunted forest path increases spectral encounters).

---

## 2. Subsystem Responsibilities
### `BP_WorldGraphSubsystem`
- Loads Locations and Routes during `Initialize`.
- Builds adjacency list `TMap<FString, FSoALocationNode>` where each node contains outgoing `FLocationRouteData` references.
- Maintains `FTravelGraphMetadata` caches per travel mode and safe zone overlays.
- Reacts to `BP_FlagManager::OnFlagChanged` and `BP_ContentPackRegistry` events to mark edges active or inactive.
- Exposes helpers: `GetAdjacency`, `IsRouteActive`, `MarkRouteDiscovered`, `GetRouteCost`.

### `BP_TravelPlanner`
- Implements Dijkstra or A* with runtime-configurable weight functions (time, distance, currency cost, combined scoring).
- Input: `FromSlug`, `ToSlug`, options (`TravelMode`, `IgnoreRequirements`, `DesiredEncounterRange`).
- Output: `FTravelPlan` containing segments, totals, encounter summary, outstanding requirements.
- Supports caching so identical queries with unchanged world state reuse results.
- Emits diagnostics for missing routes or locked nodes (feeds automation tests and developer UI).

### `BP_TravelOrchestrator`
- Executes `FTravelPlan` step by step:
  1. Validate requirements per segment (fail fast if state changes mid-travel).
  2. Deduct travel cost (currency, stamina) using `BP_CurrencyManager` or player stats.
  3. Trigger forced events (`FRouteEventBinding`) via `BP_EventSequencer`.
  4. Roll random encounters: weight = base location chance * route modifier * player stat modifiers (Luck or Stealth). Provide override hooks for story-critical sequences.
  5. Hand off to `BP_EncounterManager` and resume travel after resolution.
  6. On completion, update `BP_LocationRegistry` and push travel history for codex or log.
- Developer toggles: instant travel (skip timers), force encounter, skip encounter, debug stepper UI.

### `BP_WorldMapWidget`
- Visualises nodes and edges, gating status, and encounter odds.
- Left-click sets destination (runs planner); right-click surfaces diagnostics (missing requirements, unlock flags).
- Development overlay draws path heatmaps showing encounter probability.

---

## 3. Runtime Integrations
- **Fast Travel:** `BP_LocationRegistry` tracks discovered fast-travel nodes. `BP_TravelPlanner` validates direct jumps; `BP_FlagManager` enforces prerequisites (for example airship license flag). Currency costs run through `BP_CurrencyManager`.
- **Safe Zones:** `is_safe_zone` on locations zeroes encounter chance for adjacent safe routes. Duplicate this flag in route data so runtime checks are trivial.
- **Dynamic Route State:** Listen for flag changes to unlock edges (repair bridge). `BP_WorldGraphSubsystem` rebuilds only affected adjacency lists.
- **Story Hooks:** Story arcs or events can pin destination nodes (quest objectives) or temporarily override pathfinding (force scenic route). Expose `RegisterPriorityRoute(QuestId, RouteId, PriorityWeight)`.
- **Travel Seeds:** Store RNG seeds per travel session in SaveGame to reproduce bugs. Combine location IDs with timestamp for deterministic playback.

---

## 4. Testing and Debugging
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

## 5. Implementation Checklist
1. Extend SoA exports with a LocationRoute table (CSV or JSON) and ingest it alongside Locations.
2. Prototype `BP_WorldGraphSubsystem` and `BP_TravelPlanner` using a small sample graph (three to five nodes) to validate pathfinding in Blueprints.
3. Build the travel debug widget early; it doubles as validation feedback for designers.
4. Hook travel events into `BP_EventSequencer` to prove forced events and random encounter handoff.
5. Write automation tests before expanding the world to catch data regressions (missing routes, mismatched requirements).

By keeping travel data-driven and graph-based, traversal stays flexible, scalable, and debuggable. Designers reshape the overworld by editing CSV exports, while Blueprint subsystems respond automatically.
