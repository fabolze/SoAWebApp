# World Building Authoring Guide

This guide describes how SoAWebApp can be used by a game designer or story writer to prepare engine-agnostic world-building data. The exported CSVs can be mapped into UE5, Unity, Godot, or any custom pipeline that consumes structured content tables.

Use this document together with:
- `UE5_Integration/World_Travel_System.md` for travel graph and traversal design.
- `UE5_Integration/UE5_Data_Relationship_Map.md` for cross-table dependencies.
- `backend/data/IMPORT_ORDER_GUIDE.txt` for CSV import order.

---

## 1. Current Role

The web app now supports structured world-building packets, not only flat location records.

It can define:
- Location hierarchy: world, continent, region, zone, subzone, room, and interior.
- Location identity, place kind, optional biome ecology, region, atlas coordinates, level range, safety, fast travel, respawn, and tags.
- Route graph edges between locations.
- POIs and interactables such as doors, shrines, loot nodes, quest markers, NPC placements, discovery points, rest points, resources, hazards, and other interactables.
- Location encounter placement through weighted encounter tables, spawn groups, spawn rules, and environmental modifiers.
- Route event bindings for travel interruptions, scripted route beats, ambushes, inspections, discoveries, and story-forced traversal moments.
- Travel tuning by route type, place kind, and biome.
- Creative references for mood, visual ideas, concept refs, ambience, music state, VFX ideas, asset ideas, landmarks, and story notes.
- World-design validation through Project Health and the `/author/world` workspace.

The system remains intentionally engine-agnostic. It describes world design and content intent; exact engine scene placement, actors, prefabs, Blueprints, streamed levels, and final production assets are downstream implementation work.

---

## 2. Implemented Data

### Locations

Current model: `backend/app/models/m_locations.py`

Important world-building fields:
- `parent_location_id`: parent location for hierarchy.
- `location_type`: `World`, `Continent`, `Region`, `Zone`, `Subzone`, `Room`, or `Interior`.
- `place_kind`: `Wilderness`, `Settlement`, `Dungeon`, `Interior`, `Road`, `Waterway`, `Landmark`, `AbstractRegion`, or `Other`.
- `environment_tags`: flexible design descriptors such as village, river, sewer, market, underground, or sacred.
- `biome_inheritance`: `Own`, `InheritFromParent`, `None`, or `Mixed`; blank uses automatic behavior based on `location_type`.
- `sort_order`: ordering inside the parent.
- `is_playable_space`: whether the location represents playable content space.
- `is_world_map_node`: whether the location should appear on the atlas/map.
- Existing fields remain: `slug`, `name`, `description`, optional `biome`, `biome_modifier`, `region`, `level_range`, `coordinates`, `image_path`, `encounters`, safe-zone, fast-travel, respawn, and tags.

### Location Routes

Current model: `backend/app/models/m_location_routes.py`

Routes remain the only movement/travel edge source. They connect locations and support bidirectionality, route type, travel cost, travel time, requirements, hidden state, fast-travel state, description, and tags.

### Location POIs

Current model: `backend/app/models/m_location_pois.py`

POIs describe things inside locations. Supported POI types are `Door`, `Shrine`, `LootNode`, `QuestMarker`, `NPCPlacement`, `DiscoveryPoint`, `RestPoint`, `ResourceNode`, `Hazard`, `Interactable`, and `Other`.

POIs can link to requirements, events, dialogues, encounters, and items. They also include abstract coordinates, placement notes, discoverability, discovery hints, and tags.

### Location Encounter Tables

Current model: `backend/app/models/m_location_encounter_tables.py`

Encounter tables describe detailed encounter placement for a location. They include spawn rules, environmental modifiers, optional requirements, and weighted `encounter_entries`.

Each encounter entry contains:
- `encounter_id`
- `weight`
- `spawn_group`
- `min_count`
- `max_count`
- `spawn_notes`

The existing `locations.encounters` field remains as a simple legacy/quick-link list.

### Route Event Bindings

Current model: `backend/app/models/m_route_event_bindings.py`

Route event bindings connect a route to an event. Trigger modes are `Always`, `FirstTime`, `RandomChance`, `RequirementMet`, and `StoryForced`.

Bindings include chance, optional requirements, priority, cooldown, description, and tags.

### Travel Tuning

Current model: `backend/app/models/m_travel_tuning.py`

Travel tuning rows define authorable balancing by route type, place kind, and/or effective biome. They include encounter chance, time multiplier, cost multiplier, safe-zone multiplier, fatigue cost, risk score, and tags.

### Location Creative Briefs

Current model: `backend/app/models/m_location_creative_briefs.py`

Creative briefs are idea/reference packets, not engine asset contracts. They include mood, visual ideas, concept refs, ambience ideas, music state, VFX ideas, asset ideas, landmarks, story notes, and tags.

---

## 3. Editor Workflow

Primary workspace:
- `/author/world`: world-building workspace for hierarchy, atlas, selected-location details, POIs, encounter placement, routes, route events, travel tuning, creative briefs, and validation issues.

Focused location tools:
- `/author/locations/new`
- `/author/locations/<id>`
- `/author/locations/map`

Generic schema-complete editors:
- `/locations`
- `/location-routes`
- `/location-pois`
- `/location-encounter-tables`
- `/route-event-bindings`
- `/travel-tuning`
- `/location-creative-briefs`

Use `/author/world` for normal world-design review and the generic editors for schema-complete editing, debugging, import/export checks, and bulk data correction.

---

## 4. Validation

Project Health now includes world-design checks for:
- Missing or invalid parent locations.
- Location hierarchy cycles.
- Empty hierarchy locations with no children, encounters, or notes.
- World-map locations with no routes.
- Playable locations with no place kind.
- Playable or tuning-relevant locations with no effective biome unless biome inheritance is `None` or `Mixed`.
- Own biome mode without a biome, or inherited biome mode without a resolvable parent biome.
- Playable locations that may be unreachable from starting/safe/respawn locations.
- POIs referencing missing locations or linked content.
- Encounter table rows referencing missing encounters.
- Invalid encounter weights or min/max counts.
- Routes with missing endpoints.
- Gated routes with missing requirements.
- Hidden routes without description or discovery tags.
- Route event bindings referencing missing routes, events, or requirements.
- Route event chance values outside `0-100`.
- Invalid travel tuning chances, multipliers, fatigue, or risk values.
- Playable locations without design notes.

The `/author/world` page surfaces world issues for the selected location, while the home Project Health panel shows project-wide issues.

---

## 5. CSV Handoff

All world-building tables participate in CSV export/import:
- `locations`
- `location_routes`
- `location_pois`
- `location_encounter_tables`
- `route_event_bindings`
- `travel_tuning`
- `location_creative_briefs`

Recommended import order:
1. `requirements` where referenced by routes, events, encounters, POIs, or encounter tables.
2. `locations`
3. `location_routes`
4. `travel_tuning`
5. `dialogues`, `encounters`, `items`, and `events` where referenced by world tables.
6. `location_pois`
7. `location_encounter_tables`
8. `route_event_bindings`
9. `location_creative_briefs`

For full project recovery, use the canonical order in `backend/data/IMPORT_ORDER_GUIDE.txt` and `backend/app/services/recovery.py`. The dependency-heavy world tables import after their referenced content tables so POI links, encounter entries, and route event bindings can validate cleanly.

The CSVs are neutral content contracts. Engine teams decide how rows map to runtime scenes, prefabs, Blueprints, assets, or custom runtime data.

---

## 6. Remaining Limits

The web app is now suitable for structured world design, but it is not a final engine scene builder.

Still external:
- Exact engine-space object placement.
- Final scene or level assembly.
- Prefab/Blueprint/actor instantiation.
- Cinematic sequencing implementation.
- Full asset production tracking with owners, review states, and source-control paths.
- Final proof that every quest/progression path is shippable unless the project consistently tags main paths, starts, unlocks, and critical route requirements.

---

## 7. Recommended Authoring Flow

1. Create the top-level world hierarchy.
2. Add continent/region/zone/subzone/interior/room locations.
3. Give playable spaces descriptions, place kind, optional ecology biome, level range, safety/travel markers, and atlas placement.
4. Connect map-facing locations with `location_routes`.
5. Add requirements to locked routes.
6. Add POIs and interactables inside locations.
7. Add location encounter tables with weighted entries and spawn notes.
8. Add route event bindings for traversal beats.
9. Add travel tuning for route type, place kind, and biome combinations.
10. Add creative briefs for mood, ambience, music, VFX, landmarks, and story ideas.
11. Run Project Health and fix world issues.
12. Export CSVs for downstream implementation.

---

## 8. Designer Verdict

The current world-building implementation is strong enough to begin serious structured world authoring. It can serve as the canonical source for world hierarchy, locations, routes, POIs, encounter placement, route events, travel tuning, creative references, and CSV content handoff.

It should not be treated as a final engine scene editor. Its job is to make the world design coherent, searchable, validated, and exportable before an implementation team maps the data into the chosen engine.
