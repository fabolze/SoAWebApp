from flask import Blueprint, jsonify

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


@bp.route("/api/ui/world_builder", methods=["GET"])
def get_world_builder():
    db_session = get_db_session()
    try:
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
        warnings = []

        for location in locations:
            if location.parent_location_id and location.parent_location_id not in location_ids:
                warnings.append({
                    "schema": "locations",
                    "entry_id": location.id,
                    "message": f"Location parent_location_id references missing location {location.parent_location_id}",
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

        return jsonify({
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
        })
    finally:
        db_session.close()
