from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_currencies import Currency
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_items import Item
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_locations import Location
from backend.app.models.m_requirements import Requirement
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_location_encounter_tables import route as encounter_table_route
from backend.app.routes.r_requirements import route as requirement_route


bp = Blueprint("ui_encounters", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    return {
        column.name: _enum_value(getattr(model, column.name))
        for column in model.__table__.columns
    }


def _compact(model):
    if not model:
        return None
    data = _columns(model)
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "level", "character_id",
            "location_id", "encounter_id", "type", "role", "tags",
        )
        if key in data
    }


def _serialize_character(db_session, character):
    combat = db_session.query(CombatProfile).filter_by(character_id=character.id).first()
    interaction = db_session.query(InteractionProfile).filter_by(character_id=character.id).first()
    return {
        "character": _columns(character),
        "combat_profile": _columns(combat) if combat else None,
        "interaction_profile": _columns(interaction) if interaction else None,
    }


def _requirement_usages(db_session, requirement_id):
    if not requirement_id:
        return []
    usages = []
    seen = set()
    for model in ALL_MODELS:
        if model is Requirement or not hasattr(model, "requirements_id"):
            continue
        for item in db_session.query(model).filter(model.requirements_id == requirement_id).all():
            key = (model.__tablename__, item.id, "requirements_id")
            if key in seen:
                continue
            seen.add(key)
            usages.append({
                "schema_name": model.__tablename__,
                "entry_id": item.id,
                "entry_label": getattr(item, "name", None) or getattr(item, "title", None) or getattr(item, "slug", None) or item.id,
                "path": "requirements_id",
            })
    for node in db_session.query(DialogueNode).all():
        for index, choice in enumerate(node.choices or []):
            if isinstance(choice, dict) and choice.get("requirements_id") == requirement_id:
                usages.append({
                    "schema_name": "dialogue_nodes",
                    "entry_id": node.id,
                    "entry_label": node.slug or node.id,
                    "path": f"choices[{index}].requirements_id",
                })
    return usages


def _catalogs(db_session):
    locations = {item.id: item for item in db_session.query(Location).all()}
    requirements = db_session.query(Requirement).all()
    return {
        "encounters": [_columns(item) for item in db_session.query(Encounter).all()],
        "characters": [_serialize_character(db_session, item) for item in db_session.query(Character).all()],
        "requirements": [requirement_route.serialize_item(item) for item in requirements],
        "requirement_usages_by_id": {
            item.id: _requirement_usages(db_session, item.id)
            for item in requirements
        },
        "items": [_compact(item) for item in db_session.query(Item).all()],
        "currencies": [_compact(item) for item in db_session.query(Currency).all()],
        "factions": [_compact(item) for item in db_session.query(Faction).all()],
        "flags": [_compact(item) for item in db_session.query(Flag).all()],
        "encounter_tables": [
            {
                **_columns(item),
                "location": _compact(locations.get(item.location_id)),
            }
            for item in db_session.query(LocationEncounterTable).all()
        ],
    }


def _encounter_packet(db_session, encounter):
    packet = _catalogs(db_session)
    requirement = db_session.get(Requirement, encounter.requirements_id) if encounter.requirements_id else None
    requirement_usages = [
        usage
        for usage in _requirement_usages(db_session, encounter.requirements_id)
        if not (usage["schema_name"] == "encounters" and usage["entry_id"] == encounter.id)
    ]
    if encounter.requirements_id:
        packet["requirement_usages_by_id"][encounter.requirements_id] = requirement_usages
    packet.update({
        "encounter": _columns(encounter),
        "requirement": requirement_route.serialize_item(requirement) if requirement else None,
        "requirement_usages": requirement_usages,
        "placements": [
            {"table_id": table.id, "entry": dict(entry)}
            for table in db_session.query(LocationEncounterTable).all()
            for entry in (table.encounter_entries or [])
            if isinstance(entry, dict) and entry.get("encounter_id") == encounter.id
        ],
        "context": {
            "pois": [_compact(item) for item in db_session.query(LocationPoi).filter_by(encounter_id=encounter.id).all()],
            "events": [_compact(item) for item in db_session.query(Event).filter_by(encounter_id=encounter.id).all()],
        },
    })
    return packet


def _upsert_with_route(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        item_id = data.get("id")
        if not item_id:
            abort(400, description=f"{path}.id is required")
        item = db_session.get(model, item_id) or model(id=item_id)
        route.validate_required_fields(data, route.get_schema_required_fields(model.__name__.lower()))
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _validate_placements(payload, encounter_id):
    placements = payload.get("placements", [])
    if not isinstance(placements, list):
        abort(400, description="placements must be an array")
    table_ids = []
    for index, placement in enumerate(placements):
        path = f"placements[{index}]"
        if not isinstance(placement, dict):
            abort(400, description=f"{path} must be an object")
        table_id = placement.get("table_id")
        entry = placement.get("entry")
        if not isinstance(table_id, str) or not table_id:
            abort(400, description=f"{path}.table_id is required")
        if not isinstance(entry, dict):
            abort(400, description=f"{path}.entry must be an object")
        if entry.get("encounter_id") != encounter_id:
            abort(400, description=f"{path}.entry.encounter_id must match encounter.id")
        table_ids.append(table_id)
    if len(table_ids) != len(set(table_ids)):
        abort(400, description="placements contains duplicate table ids")
    return placements


def _save_placements(db_session, encounter_id, placements):
    desired = {placement["table_id"]: dict(placement["entry"]) for placement in placements}
    tables = db_session.query(LocationEncounterTable).all()
    known_ids = {table.id for table in tables}
    missing = set(desired) - known_ids
    if missing:
        abort(400, description=f"placements references missing encounter table: {sorted(missing)[0]}")
    for table in tables:
        entries = [
            dict(entry) if isinstance(entry, dict) else entry
            for entry in (table.encounter_entries or [])
            if not isinstance(entry, dict) or entry.get("encounter_id") != encounter_id
        ]
        if table.id in desired:
            entries.append(desired[table.id])
        if entries == (table.encounter_entries or []):
            continue
        data = _columns(table)
        data["encounter_entries"] = entries
        data["environmental_modifiers"] = table.environmental_modifiers or []
        data["tags"] = table.tags or []
        _upsert_with_route(db_session, encounter_table_route, LocationEncounterTable, data, f"placements[{table.id}]")


@bp.route("/api/ui/encounters", methods=["GET"], strict_slashes=False)
def get_encounter_selector():
    db_session = get_db_session()
    try:
        return jsonify(_catalogs(db_session))
    finally:
        db_session.close()


@bp.route("/api/ui/encounters/<encounter_id>", methods=["GET"])
def get_encounter_authoring_view(encounter_id):
    db_session = get_db_session()
    try:
        encounter = db_session.get(Encounter, encounter_id)
        if not encounter:
            abort(404, description=f"Encounter {encounter_id} not found")
        return jsonify(_encounter_packet(db_session, encounter))
    finally:
        db_session.close()


@bp.route("/api/ui/encounters/bundle", methods=["POST"])
def save_encounter_bundle():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("encounter"), dict):
            abort(400, description="encounter bundle requires an encounter object")
        encounter_data = dict(payload["encounter"])
        encounter_id = encounter_data.get("id")
        if not encounter_id:
            abort(400, description="encounter.id is required")

        requirement_data = payload.get("requirement")
        if requirement_data is not None:
            if not isinstance(requirement_data, dict):
                abort(400, description="requirement must be an object or null")
            requirement_data = dict(requirement_data)
            if encounter_data.get("requirements_id") != requirement_data.get("id"):
                abort(400, description="requirement.id must match encounter.requirements_id")

        placements = _validate_placements(payload, encounter_id)
        if requirement_data is not None:
            _upsert_with_route(db_session, requirement_route, Requirement, requirement_data, "requirement")
        encounter = _upsert_with_route(db_session, encounter_route, Encounter, encounter_data, "encounter")
        _save_placements(db_session, encounter_id, placements)

        db_session.commit()
        return jsonify(_encounter_packet(db_session, encounter))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
