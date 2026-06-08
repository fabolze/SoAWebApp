from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_dialogues import Dialogue
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
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error


bp = Blueprint("ui_world_builder", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    payload = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        payload[column.name] = _enum_value(value)
    return payload


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
