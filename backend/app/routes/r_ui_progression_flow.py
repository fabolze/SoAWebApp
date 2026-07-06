from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_abilities import Ability
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_flags import Flag
from backend.app.models.m_items import Item
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shops import Shop
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_flags import route as flag_route
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.services.dependency_index import build_dependency_index


bp = Blueprint("ui_progression_flow", __name__)

REQUIREMENT_TARGETS = {
    "abilities": Ability,
    "dialogue_nodes": DialogueNode,
    "dialogues": Dialogue,
    "encounters": Encounter,
    "events": Event,
    "items": Item,
    "location_pois": LocationPoi,
    "location_routes": LocationRoute,
    "quests": Quest,
    "shops": Shop,
}


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    if not model:
        return None
    return {
        column.name: _enum_value(getattr(model, column.name))
        for column in model.__table__.columns
    }


def _label(data):
    if not data:
        return ""
    return data.get("name") or data.get("title") or data.get("slug") or data.get("id") or ""


def _compact(model):
    data = _columns(model)
    if not data:
        return None
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "type", "encounter_type",
            "requirements_id", "encounter_id", "dialogue_id", "lore_id", "next_event_id",
            "flags_set", "rewards", "tags",
        )
        if key in data
    }


def _event_payload(event):
    if not event:
        return None
    payload_id = None
    payload_kind = None
    if event.encounter_id:
        payload_kind = "encounters"
        payload_id = event.encounter_id
    elif event.dialogue_id:
        payload_kind = "dialogues"
        payload_id = event.dialogue_id
    elif event.lore_id:
        payload_kind = "lore_entries"
        payload_id = event.lore_id
    return {"kind": payload_kind, "id": payload_id}


def _event_context(db_session, event):
    payload = _event_payload(event)
    payload_entry = None
    if payload and payload["kind"] == "encounters":
        payload_entry = _compact(db_session.get(Encounter, payload["id"]))
    elif payload and payload["kind"] == "dialogues":
        payload_entry = _compact(db_session.get(Dialogue, payload["id"]))
    elif payload and payload["kind"] == "lore_entries":
        payload_entry = _compact(db_session.get(LoreEntry, payload["id"]))
    return {
        "event": _compact(event),
        "payload": payload,
        "payload_entry": payload_entry,
        "next_event": _compact(db_session.get(Event, event.next_event_id)) if event.next_event_id else None,
    }


def _requirement_usages_from_index(index, requirement_id):
    node_id = f"requirement:{requirement_id}"
    nodes = {node["id"]: node for node in index["nodes"]}
    usages = []
    for edge in index["edges"]:
        if edge["source"] != node_id or edge["relation"] != "gates":
            continue
        target = nodes.get(edge["target"])
        if target:
            usages.append({
                "schema_name": target["schema_name"],
                "entry_id": target["entry_id"],
                "entry_label": target["label"],
                "path": edge.get("path", "requirements_id"),
            })
    return usages


def _flag_usage_from_index(index, flag_id):
    node_id = f"flag:{flag_id}"
    nodes = {node["id"]: node for node in index["nodes"]}
    producers = []
    consumers = []
    for edge in index["edges"]:
        if edge["target"] == node_id and edge["relation"] == "sets":
            source = nodes.get(edge["source"])
            if source:
                producers.append({**source, "path": edge.get("path", "")})
        if edge["source"] == node_id and edge["relation"] in {"required_by", "forbidden_by"}:
            target = nodes.get(edge["target"])
            if target:
                consumers.append({**target, "relation": edge["relation"], "path": edge.get("path", "")})
    return {"producers": producers, "consumers": consumers}


def _catalog(db_session):
    index = build_dependency_index(db_session)
    requirements = db_session.query(Requirement).all()
    flags = db_session.query(Flag).all()
    events = db_session.query(Event).all()
    encounters = db_session.query(Encounter).all()
    return {
        "events": [_columns(item) for item in events],
        "event_context": [_event_context(db_session, item) for item in events],
        "encounters": [_columns(item) for item in encounters],
        "dialogues": [_compact(item) for item in db_session.query(Dialogue).all()],
        "lore_entries": [_compact(item) for item in db_session.query(LoreEntry).all()],
        "requirements": [requirement_route.serialize_item(item) for item in requirements],
        "requirement_usages_by_id": {
            item.id: _requirement_usages_from_index(index, item.id)
            for item in requirements
        },
        "flags": [_columns(item) for item in flags],
        "flag_usage_by_id": {
            item.id: _flag_usage_from_index(index, item.id)
            for item in flags
        },
        "requirement_targets": [
            {
                "schema_name": schema_name,
                "entries": [_compact(item) for item in db_session.query(model).all()],
            }
            for schema_name, model in REQUIREMENT_TARGETS.items()
        ],
        "dependency_index": index,
    }


def _review_change(review, action, table, item_id, details=None):
    review[action].append({"table": table, "id": item_id, "details": details or {}})


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


def _event_data(data):
    normalized = dict(data)
    event_type = normalized.get("type")
    if event_type == "Encounter":
        normalized["dialogue_id"] = None
        normalized["lore_id"] = None
    elif event_type == "Dialogue":
        normalized["encounter_id"] = None
        normalized["lore_id"] = None
    elif event_type == "LoreDiscovery":
        normalized["encounter_id"] = None
        normalized["dialogue_id"] = None
    else:
        normalized["encounter_id"] = None
        normalized["dialogue_id"] = None
        normalized["lore_id"] = None
    return normalized


def _upsert_event(db_session, data, path):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        required = ["id", "slug", "title", "type"]
        missing = [key for key in required if not data.get(key)]
        if missing:
            abort(400, description=f"{path} missing required fields: {', '.join(missing)}")
        data = _event_data(data)
        event = db_session.get(Event, data["id"]) or Event(id=data["id"])
        try:
            event.type = EventType(data["type"])
        except ValueError as error:
            raise ValueError(f"{path}.type is invalid: {data['type']}") from error
        if data.get("requirements_id") and not db_session.get(Requirement, data["requirements_id"]):
            abort(400, description=f"{path}.requirements_id is invalid")
        if data.get("encounter_id") and not db_session.get(Encounter, data["encounter_id"]):
            abort(400, description=f"{path}.encounter_id is invalid")
        if data.get("dialogue_id") and not db_session.get(Dialogue, data["dialogue_id"]):
            abort(400, description=f"{path}.dialogue_id is invalid")
        if data.get("lore_id") and not db_session.get(LoreEntry, data["lore_id"]):
            abort(400, description=f"{path}.lore_id is invalid")
        if data.get("next_event_id") and data["next_event_id"] != event.id and not db_session.get(Event, data["next_event_id"]):
            abort(400, description=f"{path}.next_event_id is invalid")
        for flag_id in data.get("flags_set") or []:
            if not db_session.get(Flag, flag_id):
                abort(400, description=f"{path}.flags_set references missing flag {flag_id}")
        event.slug = data["slug"]
        event.title = data["title"]
        event.requirements_id = data.get("requirements_id") or None
        event.location_id = data.get("location_id") or None
        event.lore_id = data.get("lore_id") or None
        event.dialogue_id = data.get("dialogue_id") or None
        event.encounter_id = data.get("encounter_id") or None
        event.next_event_id = data.get("next_event_id") or None
        event.item_rewards = data.get("item_rewards") or []
        event.xp_reward = data.get("xp_reward")
        event.currency_rewards = data.get("currency_rewards") or []
        event.reputation_rewards = data.get("reputation_rewards") or []
        event.flags_set = data.get("flags_set") or []
        event.tags = data.get("tags") or []
        event.slug = event.slug.strip().lower()
        event.tags = [str(tag).strip().lower() for tag in event.tags if str(tag).strip()]
        db_session.add(event)
        db_session.flush()
        return event
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _attach_requirement(db_session, attachment, path):
    if not isinstance(attachment, dict):
        abort(400, description=f"{path} must be an object")
    schema_name = attachment.get("schema_name")
    entry_id = attachment.get("entry_id")
    requirement_id = attachment.get("requirements_id")
    model = REQUIREMENT_TARGETS.get(schema_name)
    if not model:
        abort(400, description=f"{path}.schema_name is not supported")
    item = db_session.get(model, entry_id)
    if not item:
        abort(400, description=f"{path}.entry_id references missing {schema_name}")
    if requirement_id and not db_session.get(Requirement, requirement_id):
        abort(400, description=f"{path}.requirements_id references missing requirement")
    setattr(item, "requirements_id", requirement_id or None)
    db_session.add(item)
    db_session.flush()
    return item


def _reconcile(db_session, payload, commit):
    if not isinstance(payload, dict):
        abort(400, description="progression flow bundle must be an object")
    review = {"created": [], "changed": [], "deleted": [], "unlinked": []}
    warnings = []

    for index, data in enumerate(payload.get("flags") or []):
        existed = db_session.get(Flag, data.get("id")) is not None if isinstance(data, dict) else False
        flag = _upsert_with_route(db_session, flag_route, Flag, data, f"flags[{index}]")
        _review_change(review, "changed" if existed else "created", "flags", flag.id)

    requirement_data = payload.get("requirement")
    if requirement_data is not None:
        existed = db_session.get(Requirement, requirement_data.get("id")) is not None if isinstance(requirement_data, dict) else False
        required = set(requirement_data.get("required_flags") or [])
        forbidden = set(requirement_data.get("forbidden_flags") or [])
        overlap = sorted(required & forbidden)
        if overlap:
            abort(400, description=f"requirement cannot require and forbid the same flag: {overlap[0]}")
        requirement = _upsert_with_route(db_session, requirement_route, Requirement, requirement_data, "requirement")
        _review_change(review, "changed" if existed else "created", "requirements", requirement.id)

    for index, data in enumerate(payload.get("events") or []):
        existed = db_session.get(Event, data.get("id")) is not None if isinstance(data, dict) else False
        event = _upsert_event(db_session, data, f"events[{index}]")
        _review_change(review, "changed" if existed else "created", "events", event.id)

    for index, data in enumerate(payload.get("encounters") or []):
        existed = db_session.get(Encounter, data.get("id")) is not None if isinstance(data, dict) else False
        encounter = _upsert_with_route(db_session, encounter_route, Encounter, data, f"encounters[{index}]")
        _review_change(review, "changed" if existed else "created", "encounters", encounter.id)

    for index, attachment in enumerate(payload.get("requirement_attachments") or []):
        item = _attach_requirement(db_session, attachment, f"requirement_attachments[{index}]")
        _review_change(review, "changed", attachment["schema_name"], item.id, {"requirements_id": attachment.get("requirements_id")})

    db_session.flush()
    index = build_dependency_index(db_session)
    for flag in db_session.query(Flag).all():
        usage = _flag_usage_from_index(index, flag.id)
        if usage["producers"] and not usage["consumers"]:
            warnings.append({"id": f"flag:{flag.id}:unused", "message": f"Flag '{flag.slug}' is set but has no requirement consumer."})
        if usage["consumers"] and not usage["producers"]:
            warnings.append({"id": f"flag:{flag.id}:no-source", "message": f"Flag '{flag.slug}' gates content but has no known source."})
    return {"review": review, "warnings": warnings, "blockers": []}


@bp.get("/api/ui/progression-flow")
def get_progression_flow():
    db_session = get_db_session()
    try:
        return jsonify(_catalog(db_session))
    finally:
        db_session.close()


@bp.post("/api/ui/progression-flow/preview")
def preview_progression_flow():
    db_session = get_db_session()
    try:
        result = _reconcile(db_session, deepcopy(request.get_json(silent=True)), False)
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/progression-flow/bundle")
def save_progression_flow():
    db_session = get_db_session()
    try:
        _reconcile(db_session, deepcopy(request.get_json(silent=True)), True)
        db_session.commit()
        return jsonify(_catalog(db_session))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
