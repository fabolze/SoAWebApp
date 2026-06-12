from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_characters import Character
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_requirements import Requirement
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_dialogue_nodes import route as node_route
from backend.app.routes.r_dialogues import route as dialogue_route
from backend.app.routes.r_requirements import route as requirement_route


bp = Blueprint("ui_dialogues", __name__)


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
    payload = _columns(model)
    return {
        key: payload.get(key)
        for key in ("id", "slug", "name", "title", "description", "character_id", "location_id", "dialogue_id", "role", "tags")
        if key in payload
    }


def _dialogue_packet(db_session, dialogue):
    nodes = db_session.query(DialogueNode).filter_by(dialogue_id=dialogue.id).all()
    interaction_profiles = db_session.query(InteractionProfile).filter_by(dialogue_tree_id=dialogue.id).all()
    events = db_session.query(Event).filter_by(dialogue_id=dialogue.id).all()
    pois = db_session.query(LocationPoi).filter_by(dialogue_id=dialogue.id).all()
    requirements = db_session.query(Requirement).all()
    flags = db_session.query(Flag).all()
    factions = db_session.query(Faction).all()
    return {
        "dialogue": _columns(dialogue),
        "nodes": [_columns(node) for node in nodes],
        "requirements": [requirement_route.serialize_item(item) for item in requirements],
        "flags": [_columns(item) for item in flags],
        "factions": [_columns(item) for item in factions],
        "characters": [_compact(item) for item in db_session.query(Character).all()],
        "context": {
            "interaction_profiles": [_compact(item) for item in interaction_profiles],
            "events": [_compact(item) for item in events],
            "pois": [_compact(item) for item in pois],
            "character": _compact(dialogue.character),
            "location": _compact(dialogue.location),
        },
    }


def _upsert_with_route(db_session, route, model, data, path):
    try:
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


def _require_rows(payload, key):
    rows = payload.get(key, [])
    if not isinstance(rows, list):
        abort(400, description=f"{key} must be an array")
    if any(not isinstance(row, dict) for row in rows):
        abort(400, description=f"{key} entries must be objects")
    ids = [row.get("id") for row in rows]
    if any(not isinstance(item_id, str) or not item_id for item_id in ids):
        abort(400, description=f"{key} entries require id")
    if len(ids) != len(set(ids)):
        abort(400, description=f"{key} contains duplicate ids")
    return rows


def _validate_node_graph(db_session, dialogue_id, rows, deletion_ids):
    final_ids = {row["id"] for row in rows}
    existing_ids = {
        node_id
        for node_id, in db_session.query(DialogueNode.id).filter(DialogueNode.dialogue_id == dialogue_id).all()
    }
    omitted_ids = existing_ids - final_ids - set(deletion_ids)
    if omitted_ids:
        abort(400, description=f"nodes must include or explicitly delete every saved node: {', '.join(sorted(omitted_ids))}")
    for index, row in enumerate(rows):
        existing = db_session.get(DialogueNode, row["id"])
        if existing and existing.dialogue_id != dialogue_id:
            abort(400, description=f"nodes[{index}].dialogue_id cannot reassign a saved node")
        if row.get("dialogue_id") != dialogue_id:
            abort(400, description=f"nodes[{index}].dialogue_id must match dialogue.id")
        choices = row.get("choices", [])
        if not isinstance(choices, list):
            abort(400, description=f"nodes[{index}].choices must be an array")
        for choice_index, choice in enumerate(choices):
            path = f"nodes[{index}].choices[{choice_index}]"
            if not isinstance(choice, dict):
                abort(400, description=f"{path} must be an object")
            target_id = choice.get("next_node_id")
            if not target_id:
                abort(400, description=f"{path}.next_node_id is required")
            if target_id not in final_ids:
                abort(400, description=f"{path}.next_node_id must target a node in this dialogue")
    for node_id in deletion_ids:
        existing = db_session.get(DialogueNode, node_id)
        if not existing:
            continue
        if existing.dialogue_id != dialogue_id:
            abort(400, description=f"deletions.nodes cannot delete a node from another dialogue")
        if node_id in final_ids:
            abort(400, description=f"deletions.nodes cannot also appear in nodes")


@bp.route("/api/ui/dialogues/<dialogue_id>", methods=["GET"])
def get_dialogue_authoring_view(dialogue_id):
    db_session = get_db_session()
    try:
        dialogue = db_session.get(Dialogue, dialogue_id)
        if not dialogue:
            abort(404, description=f"Dialogue {dialogue_id} not found")
        return jsonify(_dialogue_packet(db_session, dialogue))
    finally:
        db_session.close()


@bp.route("/api/ui/dialogues/bundle", methods=["POST"])
def save_dialogue_bundle():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("dialogue"), dict):
            abort(400, description="dialogue bundle requires a dialogue object")
        dialogue_data = dict(payload["dialogue"])
        dialogue_id = dialogue_data.get("id")
        if not dialogue_id:
            abort(400, description="dialogue.id is required")
        rows = _require_rows(payload, "nodes")
        deletions = payload.get("deletions", {})
        if not isinstance(deletions, dict) or set(deletions) - {"nodes"}:
            abort(400, description="deletions may only contain nodes")
        deletion_ids = deletions.get("nodes", [])
        if not isinstance(deletion_ids, list) or any(not isinstance(item, str) or not item for item in deletion_ids):
            abort(400, description="deletions.nodes must be an array of ids")
        if len(deletion_ids) != len(set(deletion_ids)):
            abort(400, description="deletions.nodes contains duplicate ids")

        _validate_node_graph(db_session, dialogue_id, rows, deletion_ids)
        dialogue = _upsert_with_route(db_session, dialogue_route, Dialogue, dialogue_data, "dialogue")

        # Register every new node before processing choices so new nodes can target each other.
        for row in rows:
            if not db_session.get(DialogueNode, row["id"]):
                db_session.add(DialogueNode(
                    id=row["id"],
                    slug=row.get("slug") or row["id"],
                    dialogue_id=dialogue_id,
                    speaker=row.get("speaker") or "Speaker",
                    text=row.get("text") or "",
                    choices=[],
                    set_flags=[],
                    tags=[],
                ))
        db_session.flush()

        for index, row in enumerate(rows):
            _upsert_with_route(db_session, node_route, DialogueNode, row, f"nodes[{index}]")
        for node_id in deletion_ids:
            node = db_session.get(DialogueNode, node_id)
            if node:
                db_session.delete(node)

        db_session.commit()
        return jsonify(_dialogue_packet(db_session, dialogue))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
