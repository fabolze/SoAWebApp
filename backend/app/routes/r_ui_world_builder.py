from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_adventure_narrative import AdventureBeat, AdventureBeatLink
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_location_creative_briefs import LocationCreativeBrief
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_locations import Location
from backend.app.models.m_route_event_bindings import RouteEventBinding
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import StoryArc
from backend.app.models.m_travel_tuning import TravelTuning
from backend.app.routes.r_location_creative_briefs import route as creative_brief_route
from backend.app.routes.r_location_encounter_tables import route as encounter_table_route
from backend.app.routes.r_location_pois import route as poi_route
from backend.app.routes.r_location_routes import route as location_route_route
from backend.app.routes.r_locations import route as location_route
from backend.app.routes.r_route_event_bindings import route as route_event_binding_route
from backend.app.routes.r_travel_tuning import route as travel_tuning_route
from backend.app.routes.r_adventure_narrative import adventure_beat_link_route, adventure_beat_route
from backend.app.routes.r_characterclasses import ClassRoute
from backend.app.routes.r_characters import route as character_route
from backend.app.routes.r_combat_profiles import route as combat_profile_route
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_events import EventRoute
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.utils.id import generate_ulid


bp = Blueprint("ui_world_builder", __name__)
event_route = EventRoute()
characterclass_route = ClassRoute()


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    payload = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        payload[column.name] = _enum_value(value)
    return payload


def _compact(model):
    if not model:
        return None
    data = _columns(model)
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "level", "location_id",
            "class_id", "faction_id", "home_location_id", "timeline_id", "story_arc_id", "sort_order", "tags",
        )
        if key in data
    }


def _character_compact(character, combat_by_character):
    data = _compact(character)
    combat = combat_by_character.get(character.id)
    tags = {str(tag).lower() for tag in (character.tags or [])}
    enemy_type = _enum_value(getattr(combat, "enemy_type", None))
    aggression = _enum_value(getattr(combat, "aggression", None))
    data.update({
        "combat_profile_id": getattr(combat, "id", None),
        "enemy_type": enemy_type,
        "aggression": aggression,
        "is_enemy_candidate": bool(
            tags & {"creature", "enemy", "elite", "boss", "beast", "monster"}
            or aggression == "Hostile"
            or enemy_type in {"beast", "undead", "elemental", "machine", "boss", "demon", "dragon", "giant", "spirit", "emanation"}
        ),
    })
    return data


def _slug(value):
    text = "".join(character.lower() if character.isalnum() else "-" for character in str(value or "").strip())
    text = "-".join(part for part in text.split("-") if part)
    return text or "chain"


def _auto_biome_mode(location: Location) -> str:
    explicit = _enum_value(getattr(location, "biome_inheritance", None))
    if explicit:
        return explicit
    location_type = _enum_value(location.location_type)
    if location_type in {"World", "Continent", "Region"}:
        return "None"
    if location_type in {"Room", "Interior"}:
        return "InheritFromParent"
    return "Own"


def _effective_biome(location: Location, locations_by_id: dict[str, Location]) -> str | None:
    mode = _auto_biome_mode(location)
    own_biome = _enum_value(location.biome)
    if mode in {"Own", "Mixed"}:
        return own_biome
    if mode == "None":
        return None
    parent_id = location.parent_location_id
    visited = {location.id}
    while parent_id and parent_id not in visited:
        visited.add(parent_id)
        parent = locations_by_id.get(parent_id)
        if parent is None:
            return None
        parent_biome = _enum_value(parent.biome)
        if parent_biome:
            return parent_biome
        parent_id = parent.parent_location_id
    return None


def _location_columns(location: Location, locations_by_id: dict[str, Location]):
    payload = _columns(location)
    payload["environment_tags"] = location.environment_tags or []
    payload["effective_biome"] = _effective_biome(location, locations_by_id)
    payload["resolved_biome_inheritance"] = _auto_biome_mode(location)
    return payload


def _world_packet(db_session):
    locations = db_session.query(Location).all()
    routes = db_session.query(LocationRoute).all()
    pois = db_session.query(LocationPoi).all()
    encounter_tables = db_session.query(LocationEncounterTable).all()
    route_event_bindings = db_session.query(RouteEventBinding).all()
    travel_tuning = db_session.query(TravelTuning).all()
    creative_briefs = db_session.query(LocationCreativeBrief).all()
    events = db_session.query(Event).all()
    encounters = db_session.query(Encounter).all()
    characters = db_session.query(Character).all()
    combat_by_character = {profile.character_id: profile for profile in db_session.query(CombatProfile).all()}
    adventure_beats = db_session.query(AdventureBeat).all()
    quests = db_session.query(Quest).all()
    story_arcs = db_session.query(StoryArc).all()
    dialogues = db_session.query(Dialogue).all()

    location_ids = {location.id for location in locations}
    locations_by_id = {location.id: location for location in locations}
    route_ids = {route.id for route in routes}
    event_ids = {event.id for event in events}
    encounter_ids = {encounter.id for encounter in encounters}
    warnings = []

    for location in locations:
        if location.parent_location_id and location.parent_location_id not in location_ids:
            warnings.append({
                "schema": "locations",
                "entry_id": location.id,
                "message": f"Location parent_location_id references missing location {location.parent_location_id}",
            })
        visited = {location.id}
        parent_id = location.parent_location_id
        while parent_id:
            if parent_id in visited:
                warnings.append({
                    "schema": "locations",
                    "entry_id": location.id,
                    "message": "Location participates in a parent hierarchy cycle",
                })
                break
            visited.add(parent_id)
            parent = locations_by_id.get(parent_id)
            parent_id = parent.parent_location_id if parent else None
        for encounter_id in location.encounters or []:
            if encounter_id not in encounter_ids:
                warnings.append({
                    "schema": "locations",
                    "entry_id": location.id,
                    "message": f"Location references missing encounter {encounter_id}",
                })
    for route in routes:
        if route.from_location_id not in location_ids or route.to_location_id not in location_ids:
            warnings.append({
                "schema": "location_routes",
                "entry_id": route.id,
                "message": "Route references one or more missing locations",
            })
    for binding in route_event_bindings:
        if binding.route_id not in route_ids:
            warnings.append({
                "schema": "route_event_bindings",
                "entry_id": binding.id,
                "message": f"Route event binding references missing route {binding.route_id}",
            })
        if binding.event_id not in event_ids:
            warnings.append({
                "schema": "route_event_bindings",
                "entry_id": binding.id,
                "message": f"Route event binding references missing event {binding.event_id}",
            })
    for poi in pois:
        if poi.location_id not in location_ids:
            warnings.append({
                "schema": "location_pois",
                "entry_id": poi.id,
                "message": f"POI references missing location {poi.location_id}",
            })
    for table in encounter_tables:
        if table.location_id not in location_ids:
            warnings.append({
                "schema": "location_encounter_tables",
                "entry_id": table.id,
                "message": f"Encounter table references missing location {table.location_id}",
            })
        for entry in table.encounter_entries or []:
            if not isinstance(entry, dict) or entry.get("encounter_id") not in encounter_ids:
                warnings.append({
                    "schema": "location_encounter_tables",
                    "entry_id": table.id,
                    "message": "Encounter table contains a missing or invalid encounter reference",
                })
    for brief in creative_briefs:
        if brief.location_id not in location_ids:
            warnings.append({
                "schema": "location_creative_briefs",
                "entry_id": brief.id,
                "message": f"Creative brief references missing location {brief.location_id}",
            })

    return {
        "locations": [_location_columns(location, locations_by_id) for location in locations],
        "routes": [_columns(route) for route in routes],
        "pois": [_columns(poi) for poi in pois],
        "encounter_tables": [_columns(table) for table in encounter_tables],
        "route_event_bindings": [_columns(binding) for binding in route_event_bindings],
        "travel_tuning": [_columns(tuning) for tuning in travel_tuning],
        "creative_briefs": [_columns(brief) for brief in creative_briefs],
        "events": [_columns(event) for event in events],
        "encounters": [_columns(encounter) for encounter in encounters],
        "characters": [_character_compact(character, combat_by_character) for character in characters],
        "adventure_beats": [_compact(beat) for beat in adventure_beats],
        "quests": [_columns(quest) for quest in quests],
        "story_arcs": [_columns(arc) for arc in story_arcs],
        "dialogues": [_columns(dialogue) for dialogue in dialogues],
        "warnings": warnings,
    }


def _upsert_with_route(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{model.__tablename__} bundle entries must be objects")
        item_id = data.get("id")
        if not item_id:
            abort(400, description=f"{model.__tablename__}.id is required")
        item = db_session.get(model, item_id) or model(id=item_id)
        route.validate_required_fields(data, route.get_schema_required_fields(model.__name__.lower()))
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _upsert_chain_row(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict) or not data.get("id"):
            abort(400, description=f"{path}.id is required")
        item = db_session.get(model, data["id"]) or model(id=data["id"])
        route.validate_required_fields(data, route.get_schema_required_fields())
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _bundle_rows(payload, key):
    rows = payload.get(key, [])
    if not isinstance(rows, list):
        abort(400, description=f"{key} must be an array")
    ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if len(ids) != len(set(ids)):
        abort(400, description=f"{key} contains duplicate ids")
    return rows


def _validate_owner_unchanged(db_session, model, data, owner_field, label):
    existing = db_session.get(model, data.get("id"))
    if existing and getattr(existing, owner_field) != data.get(owner_field):
        abort(400, description=f"{label}.{owner_field} cannot be reassigned through the world bundle")


def _delete_owned_rows(db_session, payload):
    deletions = payload.get("deletions", {})
    if not isinstance(deletions, dict):
        abort(400, description="deletions must be an object")
    allowed = {
        "pois": LocationPoi,
        "encounter_tables": LocationEncounterTable,
        "creative_briefs": LocationCreativeBrief,
    }
    unexpected = set(deletions) - set(allowed)
    if unexpected:
        abort(400, description=f"world bundle cannot delete shared record types: {sorted(unexpected)}")
    for key, model in allowed.items():
        ids = deletions.get(key, [])
        if not isinstance(ids, list) or any(not isinstance(item_id, str) or not item_id for item_id in ids):
            abort(400, description=f"deletions.{key} must be an array of ids")
        if len(ids) != len(set(ids)):
            abort(400, description=f"deletions.{key} contains duplicate ids")
        for item_id in ids:
            item = db_session.get(model, item_id)
            if item:
                db_session.delete(item)


def _save_locations_parent_first(db_session, rows):
    pending = {row.get("id"): row for row in rows if isinstance(row, dict)}
    indexes = {row.get("id"): index for index, row in enumerate(rows) if isinstance(row, dict)}
    if len(pending) != len(rows):
        abort(400, description="locations bundle entries must be objects with unique ids")
    while pending:
        progressed = False
        for location_id, data in list(pending.items()):
            parent_id = data.get("parent_location_id")
            if parent_id and parent_id in pending:
                continue
            _upsert_with_route(db_session, location_route, Location, data, f"locations[{indexes[location_id]}]")
            del pending[location_id]
            progressed = True
        if not progressed:
            abort(400, description="locations contain an unresolved parent hierarchy cycle")


def _validate_location_hierarchy(db_session):
    locations = db_session.query(Location).all()
    by_id = {location.id: location for location in locations}
    for location in locations:
        visited = {location.id}
        parent_id = location.parent_location_id
        while parent_id:
            if parent_id in visited:
                abort(400, description=f"location hierarchy cycle includes {location.id}")
            visited.add(parent_id)
            parent = by_id.get(parent_id)
            parent_id = parent.parent_location_id if parent else None


def _first_or_create_chain_class(db_session, review):
    existing = db_session.query(CharacterClass).first()
    if existing:
        return existing
    class_id = generate_ulid()
    item = _upsert_chain_row(db_session, characterclass_route, CharacterClass, {
        "id": class_id,
        "slug": f"generated-enemy-{class_id[-6:].lower()}",
        "name": "Generated Enemy",
        "role": ClassRole.Damage.value,
        "base_stats": [],
        "tags": ["world-builder", "combat-chain"],
    }, "support_class")
    review["created"].append({"table": "characterclasses", "id": item.id})
    return item


def _location_start_level(location):
    level_range = location.level_range if isinstance(location.level_range, dict) else {}
    value = level_range.get("min", 1)
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 1


def _chain_label(payload, key, fallback):
    value = payload.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _append_unique_table_entry(table, entry):
    entries = [dict(row) if isinstance(row, dict) else row for row in (table.encounter_entries or [])]
    if not any(isinstance(row, dict) and row.get("encounter_id") == entry["encounter_id"] for row in entries):
        entries.append(entry)
    return entries


def _combat_chain_payload(db_session, payload):
    if not isinstance(payload, dict):
        abort(400, description="combat chain request must be an object")
    location_id = payload.get("location_id")
    if not isinstance(location_id, str) or not location_id:
        abort(400, description="location_id is required")
    location = db_session.get(Location, location_id)
    if not location:
        abort(400, description=f"location_id references missing location {location_id}")

    participant_id = payload.get("participant_character_id") or ""
    if participant_id and not db_session.get(Character, participant_id):
        abort(400, description=f"participant_character_id references missing character {participant_id}")
    existing_enemy_id = payload.get("enemy_character_id") or ""
    if existing_enemy_id and not db_session.get(Character, existing_enemy_id):
        abort(400, description=f"enemy_character_id references missing character {existing_enemy_id}")
    if existing_enemy_id and participant_id and existing_enemy_id == participant_id:
        abort(400, description="enemy_character_id cannot match participant_character_id")

    base_name = _chain_label(payload, "encounter_name", f"{location.name} Combat")
    enemy_name = _chain_label(payload, "enemy_name", f"{location.name} Enemy")
    beat_title = _chain_label(payload, "story_beat_title", base_name)
    create_poi = bool(payload.get("create_poi", True))
    requested_beat_id = payload.get("adventure_beat_id") or ""
    create_story_beat = bool(payload.get("create_story_beat", True)) or not requested_beat_id

    review = {"created": [], "changed": [], "deleted": []}
    chain_id = generate_ulid()
    suffix = chain_id[-6:].lower()
    tags = ["world-builder", "combat-chain"]

    if existing_enemy_id:
        enemy = db_session.get(Character, existing_enemy_id)
    else:
        character_class = _first_or_create_chain_class(db_session, review)
        enemy_id = generate_ulid()
        enemy = _upsert_chain_row(db_session, character_route, Character, {
            "id": enemy_id,
            "slug": f"{_slug(enemy_name)}-{suffix}",
            "name": enemy_name,
            "title": "",
            "description": f"Draft enemy created for {base_name}.",
            "level": _location_start_level(location),
            "class_id": character_class.id,
            "home_location_id": location.id,
            "tags": ["creature", "enemy", *tags],
        }, "enemy")
        review["created"].append({"table": "characters", "id": enemy.id})

    combat = db_session.query(CombatProfile).filter_by(character_id=enemy.id).first()
    if not combat:
        character_class = _first_or_create_chain_class(db_session, review)
        companion_config = {}
        if not (enemy.class_id and enemy.level is not None):
            companion_config = {"class_id": character_class.id, "level": _location_start_level(location)}
        combat_id = generate_ulid()
        combat = _upsert_chain_row(db_session, combat_profile_route, CombatProfile, {
            "id": combat_id,
            "character_id": enemy.id,
            "enemy_type": "humanoid",
            "aggression": "Hostile",
            "custom_stats": [],
            "custom_abilities": [],
            "status_rules": [],
            "loot_table": [],
            "currency_rewards": [],
            "reputation_rewards": [],
            "xp_reward": 10,
            "related_quests": [],
            "companion_config": companion_config,
            "tags": tags,
        }, "combat_profile")
        review["created"].append({"table": "combat_profiles", "id": combat.id})

    participants = [{"character_id": enemy.id, "contexts": ["Combat"], "combat_side": "Hostile"}]
    if participant_id:
        participants.insert(0, {"character_id": participant_id, "contexts": ["Combat"], "combat_side": "Friendly"})

    encounter_id = generate_ulid()
    encounter = _upsert_chain_row(db_session, encounter_route, Encounter, {
        "id": encounter_id,
        "slug": f"{_slug(base_name)}-{suffix}",
        "name": base_name,
        "description": f"Draft combat encounter created from {location.name}.",
        "encounter_type": "Combat",
        "participants": participants,
        "rewards": {"xp": 0, "items": [], "currencies": [], "reputation": [], "flags_set": []},
        "tags": tags,
    }, "encounter")
    review["created"].append({"table": "encounters", "id": encounter.id})

    table = db_session.query(LocationEncounterTable).filter_by(location_id=location.id).first()
    table_was_created = table is None
    if table is None:
        table = LocationEncounterTable(id=generate_ulid())
    table_data = _columns(table) if not table_was_created else {
        "id": table.id,
        "slug": f"{_slug(location.name)}-combat-{suffix}",
        "location_id": location.id,
        "name": f"{location.name} Combat Encounters",
        "description": "",
        "spawn_rules": "",
        "environmental_modifiers": [],
        "requirements_id": "",
        "encounter_entries": [],
        "tags": tags,
    }
    table_data["location_id"] = location.id
    table_data["encounter_entries"] = _append_unique_table_entry(table, {
        "encounter_id": encounter.id,
        "weight": 1,
        "spawn_group": "city",
        "min_count": 1,
        "max_count": 1,
        "spawn_notes": "Created from World Builder combat chain.",
    })
    table_data["environmental_modifiers"] = table_data.get("environmental_modifiers") or []
    table_data["tags"] = list(dict.fromkeys([*(table_data.get("tags") or []), *tags]))
    table = _upsert_with_route(db_session, encounter_table_route, LocationEncounterTable, table_data, "encounter_table")
    review["created" if table_was_created else "changed"].append({"table": "location_encounter_tables", "id": table.id})

    event_id = generate_ulid()
    event = _upsert_chain_row(db_session, event_route, Event, {
        "id": event_id,
        "slug": f"{_slug(base_name)}-event-{suffix}",
        "title": f"{base_name} Event",
        "type": "Encounter",
        "location_id": location.id,
        "encounter_id": encounter.id,
        "item_rewards": [],
        "xp_reward": 0,
        "currency_rewards": [],
        "reputation_rewards": [],
        "flags_set": [],
        "tags": tags,
    }, "event")
    review["created"].append({"table": "events", "id": event.id})

    poi = None
    if create_poi:
        poi_id = generate_ulid()
        poi = _upsert_with_route(db_session, poi_route, LocationPoi, {
            "id": poi_id,
            "slug": f"{_slug(base_name)}-poi-{suffix}",
            "location_id": location.id,
            "name": f"{base_name} Trigger",
            "description": "",
            "poi_type": "NPCPlacement",
            "event_id": event.id,
            "encounter_id": encounter.id,
            "coordinates": {"x": 50, "y": 50},
            "placement_notes": "Draft trigger created from World Builder combat chain.",
            "is_discoverable": True,
            "discovery_hint": "",
            "tags": tags,
        }, "poi")
        review["created"].append({"table": "location_pois", "id": poi.id})

    beat = db_session.get(AdventureBeat, requested_beat_id) if requested_beat_id and not create_story_beat else None
    if create_story_beat:
        beat_id = generate_ulid()
        beat = _upsert_chain_row(db_session, adventure_beat_route, AdventureBeat, {
            "id": beat_id,
            "slug": f"{_slug(beat_title)}-{suffix}",
            "title": beat_title,
            "summary": f"{base_name} happens in {location.name}.",
            "beat_type": "Conflict",
            "sort_order": 0,
            "intent": "Drafted from World Builder combat chain.",
            "required_flags": [],
            "forbidden_flags": [],
            "expected_output_flags": [],
            "tags": tags,
        }, "adventure_beat")
        review["created"].append({"table": "adventure_beats", "id": beat.id})
    if not beat:
        abort(400, description=f"adventure_beat_id references missing adventure beat {requested_beat_id}")

    link_specs = [
        ("location", location.id, "setting", "appearance", "active", "major", 0),
        ("encounter", encounter.id, "runtime", "appearance", "active", "major", 1),
        ("event", event.id, "runtime", "appearance", "active", "minor", 2),
        ("character", enemy.id, "cast", "appearance", "active" if existing_enemy_id else "introduced", "minor", 3),
    ]
    if participant_id:
        link_specs.append(("character", participant_id, "cast", "appearance", "active", "minor", 5))
    for target_type, target_id, role, occurrence, change, importance, sort_order in link_specs:
        link_id = generate_ulid()
        link = _upsert_chain_row(db_session, adventure_beat_link_route, AdventureBeatLink, {
            "id": link_id,
            "adventure_beat_id": beat.id,
            "target_type": target_type,
            "target_id": target_id,
            "role": role,
            "occurrence_kind": occurrence,
            "change_type": change,
            "importance": importance,
            "sort_order": sort_order,
            "notes": "Created from World Builder combat chain.",
            "tags": tags,
        }, f"adventure_beat_links[{sort_order}]")
        review["created"].append({"table": "adventure_beat_links", "id": link.id})

    return {
        "review": review,
        "chain": {
            "location_id": location.id,
            "encounter_id": encounter.id,
            "enemy_id": enemy.id,
            "combat_profile_id": combat.id,
            "event_id": event.id,
            "poi_id": poi.id if poi else None,
            "adventure_beat_id": beat.id,
            "encounter_table_id": table.id,
        },
    }


@bp.route("/api/ui/world_builder", methods=["GET"])
def get_world_builder():
    db_session = get_db_session()
    try:
        return jsonify(_world_packet(db_session))
    finally:
        db_session.close()


@bp.route("/api/ui/world_builder/bundle", methods=["POST"])
def save_world_builder_bundle():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            abort(400, description="world bundle must be an object")

        locations = _bundle_rows(payload, "locations")
        routes = _bundle_rows(payload, "routes")
        pois = _bundle_rows(payload, "pois")
        encounter_tables = _bundle_rows(payload, "encounter_tables")
        bindings = _bundle_rows(payload, "route_event_bindings")
        tuning = _bundle_rows(payload, "travel_tuning")
        briefs = _bundle_rows(payload, "creative_briefs")

        for data in pois:
            _validate_owner_unchanged(db_session, LocationPoi, data, "location_id", "poi")
        for data in encounter_tables:
            _validate_owner_unchanged(db_session, LocationEncounterTable, data, "location_id", "encounter_table")
        for data in bindings:
            _validate_owner_unchanged(db_session, RouteEventBinding, data, "route_id", "route_event_binding")
        for data in briefs:
            _validate_owner_unchanged(db_session, LocationCreativeBrief, data, "location_id", "creative_brief")

        _save_locations_parent_first(db_session, locations)
        for index, data in enumerate(routes):
            _upsert_with_route(db_session, location_route_route, LocationRoute, data, f"routes[{index}]")
        for index, data in enumerate(pois):
            _upsert_with_route(db_session, poi_route, LocationPoi, data, f"pois[{index}]")
        for index, data in enumerate(encounter_tables):
            _upsert_with_route(db_session, encounter_table_route, LocationEncounterTable, data, f"encounter_tables[{index}]")
        for index, data in enumerate(bindings):
            _upsert_with_route(db_session, route_event_binding_route, RouteEventBinding, data, f"route_event_bindings[{index}]")
        for index, data in enumerate(tuning):
            _upsert_with_route(db_session, travel_tuning_route, TravelTuning, data, f"travel_tuning[{index}]")
        for index, data in enumerate(briefs):
            _upsert_with_route(db_session, creative_brief_route, LocationCreativeBrief, data, f"creative_briefs[{index}]")
        _delete_owned_rows(db_session, payload)
        _validate_location_hierarchy(db_session)

        db_session.commit()
        return jsonify(_world_packet(db_session))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.route("/api/ui/world_builder/combat-chain", methods=["POST"])
def create_world_builder_combat_chain():
    db_session = get_db_session()
    try:
        result = _combat_chain_payload(db_session, request.get_json(silent=True))
        db_session.commit()
        return jsonify({**result, "packet": _world_packet(db_session)})
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
