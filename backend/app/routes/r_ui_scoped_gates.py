from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_abilities import Ability
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_flags import Flag
from backend.app.models.m_items import Item
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shops import Shop
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_flags import route as flag_route
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.services.dependency_index import build_dependency_index


bp = Blueprint("ui_scoped_gates", __name__)

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


def _compact(model):
    data = _columns(model)
    if not data:
        return None
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "type", "encounter_type",
            "requirements_id", "tags",
        )
        if key in data
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
    return {
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


def _payload_list(payload, key):
    value = payload.get(key, [])
    if value is None:
        return []
    if not isinstance(value, list):
        abort(400, description=f"{key} must be an array")
    return value


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


def _reconcile(db_session, payload):
    if not isinstance(payload, dict):
        abort(400, description="scoped gate bundle must be an object")
    review = {"created": [], "changed": [], "deleted": [], "unlinked": []}
    warnings = []

    for index, data in enumerate(_payload_list(payload, "flags")):
        existed = db_session.get(Flag, data.get("id")) is not None if isinstance(data, dict) else False
        flag = _upsert_with_route(db_session, flag_route, Flag, data, f"flags[{index}]")
        _review_change(review, "changed" if existed else "created", "flags", flag.id)

    requirement_data = payload.get("requirement")
    if requirement_data is not None:
        if not isinstance(requirement_data, dict):
            abort(400, description="requirement must be an object or null")
        existed = db_session.get(Requirement, requirement_data.get("id")) is not None
        required = set(requirement_data.get("required_flags") or [])
        forbidden = set(requirement_data.get("forbidden_flags") or [])
        overlap = sorted(required & forbidden)
        if overlap:
            abort(400, description=f"requirement cannot require and forbid the same flag: {overlap[0]}")
        requirement = _upsert_with_route(db_session, requirement_route, Requirement, requirement_data, "requirement")
        _review_change(review, "changed" if existed else "created", "requirements", requirement.id)

    for index, attachment in enumerate(_payload_list(payload, "requirement_attachments")):
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


@bp.get("/api/ui/scoped-gates")
def get_scoped_gates():
    db_session = get_db_session()
    try:
        return jsonify(_catalog(db_session))
    finally:
        db_session.close()


@bp.post("/api/ui/scoped-gates/preview")
def preview_scoped_gate():
    db_session = get_db_session()
    try:
        result = _reconcile(db_session, deepcopy(request.get_json(silent=True)))
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/scoped-gates/bundle")
def save_scoped_gate():
    db_session = get_db_session()
    try:
        _reconcile(db_session, deepcopy(request.get_json(silent=True)))
        db_session.commit()
        return jsonify(_catalog(db_session))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
