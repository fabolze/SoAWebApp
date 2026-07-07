from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_adventure_narrative import AdventureBeat, AdventureBeatLink
from backend.app.models.m_characters import Character
from backend.app.models.m_currencies import Currency
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_items import Item
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_adventure_narrative import adventure_beat_link_route
from backend.app.routes.r_dialogue_nodes import route as dialogue_node_route
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_events import EventRoute
from backend.app.routes.r_quests import QuestRoute
from backend.app.services.adventure_timeline import build_adventure_timeline
from backend.app.services.dependency_index import build_dependency_index


bp = Blueprint("ui_consequences", __name__)

event_route = EventRoute()
quest_route = QuestRoute()


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    if not model:
        return None
    return {
        column.name: _enum_value(getattr(model, column.name))
        for column in model.__table__.columns
    }


def _compact(model):
    data = _columns(model)
    if not data:
        return None
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "type", "encounter_type",
            "dialogue_id", "speaker", "speaker_character_id", "requirements_id",
            "flags_set", "flags_set_on_completion", "item_rewards", "currency_rewards",
            "reputation_rewards", "xp_reward", "next_event_id", "rewards", "tags",
        )
        if key in data
    }


def _catalog(db_session):
    dependency_index = build_dependency_index(db_session)
    timeline = build_adventure_timeline(db_session)
    return {
        "events": [_compact(item) for item in db_session.query(Event).all()],
        "encounters": [_compact(item) for item in db_session.query(Encounter).all()],
        "quests": [_compact(item) for item in db_session.query(Quest).all()],
        "dialogue_nodes": [_compact(item) for item in db_session.query(DialogueNode).all()],
        "adventure_beats": [_compact(item) for item in db_session.query(AdventureBeat).all()],
        "adventure_beat_links": [_columns(item) for item in db_session.query(AdventureBeatLink).all()],
        "flags": [_compact(item) for item in db_session.query(Flag).all()],
        "items": [_compact(item) for item in db_session.query(Item).all()],
        "currencies": [_compact(item) for item in db_session.query(Currency).all()],
        "factions": [_compact(item) for item in db_session.query(Faction).all()],
        "characters": [_compact(item) for item in db_session.query(Character).all()],
        "locations": [_compact(item) for item in db_session.query(Location).all()],
        "dependency_index": dependency_index,
        "story_packet": timeline,
    }


def _payload_list(payload, key):
    value = payload.get(key, [])
    if value is None:
        return []
    if not isinstance(value, list):
        abort(400, description=f"{key} must be an array")
    if any(not isinstance(row, dict) for row in value):
        abort(400, description=f"{key} entries must be objects")
    return value


def _review_change(review, action, table, item_id, details=None):
    review[action].append({"table": table, "id": item_id, "details": details or {}})


def _upsert_with_route(db_session, route, model, data, path):
    try:
        item_id = data.get("id")
        if not item_id:
            abort(400, description=f"{path}.id is required")
        existing = db_session.get(model, item_id)
        if existing and data.get("expected_previous") is not None and data["expected_previous"] != _columns(existing):
            abort(400, description=f"{path}.expected_previous is stale")
        item = existing or model(id=item_id)
        sanitized = {key: value for key, value in data.items() if key != "expected_previous"}
        route.validate_required_fields(sanitized, route.get_schema_required_fields(model.__tablename__))
        route.process_input_data(db_session, item, dict(sanitized))
        route._normalize_common_fields(item, sanitized)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item, existing is not None
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _reject_empty_dialogue_rewards(payload):
    unsupported = {
        "dialogues",
        "dialogue_rewards",
        "dialogue_reputation",
    }
    found = sorted(key for key in unsupported if key in payload and payload.get(key))
    if found:
        abort(400, description=f"unsupported consequence payload: {found[0]}")


def _reconcile(db_session, payload):
    if not isinstance(payload, dict):
        abort(400, description="consequence bundle must be an object")
    _reject_empty_dialogue_rewards(payload)
    review = {"created": [], "changed": [], "deleted": [], "unlinked": []}

    for index, data in enumerate(_payload_list(payload, "events")):
        item, existed = _upsert_with_route(db_session, event_route, Event, data, f"events[{index}]")
        _review_change(review, "changed" if existed else "created", "events", item.id)

    for index, data in enumerate(_payload_list(payload, "encounters")):
        item, existed = _upsert_with_route(db_session, encounter_route, Encounter, data, f"encounters[{index}]")
        _review_change(review, "changed" if existed else "created", "encounters", item.id)

    for index, data in enumerate(_payload_list(payload, "quests")):
        item, existed = _upsert_with_route(db_session, quest_route, Quest, data, f"quests[{index}]")
        _review_change(review, "changed" if existed else "created", "quests", item.id)

    for index, data in enumerate(_payload_list(payload, "dialogue_nodes")):
        item, existed = _upsert_with_route(db_session, dialogue_node_route, DialogueNode, data, f"dialogue_nodes[{index}]")
        _review_change(review, "changed" if existed else "created", "dialogue_nodes", item.id)

    for index, data in enumerate(_payload_list(payload, "adventure_beat_links")):
        item, existed = _upsert_with_route(
            db_session,
            adventure_beat_link_route,
            AdventureBeatLink,
            data,
            f"adventure_beat_links[{index}]",
        )
        _review_change(review, "changed" if existed else "created", "adventure_beat_links", item.id)

    db_session.flush()
    packet = _catalog(db_session)
    return {
        "review": review,
        "warnings": packet["story_packet"]["health"]["warnings"],
        "blockers": [],
    }, packet


@bp.get("/api/ui/consequences")
def get_consequences():
    db_session = get_db_session()
    try:
        return jsonify(_catalog(db_session))
    finally:
        db_session.close()


@bp.post("/api/ui/consequences/preview")
def preview_consequences():
    db_session = get_db_session()
    try:
        result, _ = _reconcile(db_session, deepcopy(request.get_json(silent=True)))
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/consequences/bundle")
def save_consequences():
    db_session = get_db_session()
    try:
        result, packet = _reconcile(db_session, deepcopy(request.get_json(silent=True)))
        db_session.commit()
        return jsonify({"result": result, "packet": packet})
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
