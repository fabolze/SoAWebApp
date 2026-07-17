from collections import defaultdict
from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_character_narrative import CharacterRelationship, CharacterStoryBeat, CharacterStoryProfile
from backend.app.models.m_characters import Character
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_requirements import Requirement
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_character_narrative import story_beat_route
from backend.app.routes.r_dialogue_nodes import route as node_route
from backend.app.routes.r_dialogues import route as dialogue_route
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.services.dependency_index import build_dependency_index
from backend.app.services.dialogue_choice_actions import (
    normalize_dialogue_choices,
    validate_dialogue_choice_actions,
)


bp = Blueprint("ui_dialogues", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    if not model:
        return None
    return {column.name: _enum_value(getattr(model, column.name)) for column in model.__table__.columns}


def _compact(model):
    if not model:
        return None
    payload = _columns(model)
    return {
        key: payload.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "character_id", "location_id",
            "dialogue_id", "role", "speaker_character_id", "tags",
        )
        if key in payload
    }


def _node_columns(node):
    payload = _columns(node)
    payload["choices"] = normalize_dialogue_choices(node.id, payload.get("choices") or [])
    return payload


def _participant_ids(dialogue, nodes):
    ids = {dialogue.character_id} if dialogue.character_id else set()
    ids.update(node.speaker_character_id for node in nodes if node.speaker_character_id)
    return ids


def _dialogue_flag_paths(dialogue, nodes):
    inputs = {"required": defaultdict(list), "forbidden": defaultdict(list)}
    outputs = defaultdict(list)
    if dialogue.requirements:
        for row in dialogue.requirements.required_flags:
            inputs["required"][row.flag_id].append("dialogue.requirements_id.required_flags")
        for row in dialogue.requirements.forbidden_flags:
            inputs["forbidden"][row.flag_id].append("dialogue.requirements_id.forbidden_flags")
    for node in nodes:
        for flag_id in node.set_flags or []:
            outputs[flag_id].append(f"nodes[{node.id}].set_flags")
        for index, choice in enumerate(node.choices or []):
            if not isinstance(choice, dict):
                continue
            for flag_id in choice.get("set_flags", []) or []:
                outputs[flag_id].append(f"nodes[{node.id}].choices[{index}].set_flags")
    return inputs, outputs


def _coverage_group(flag_ids, paths):
    return {
        "matched": [{"flag_id": flag_id, "paths": paths[flag_id]} for flag_id in flag_ids if paths.get(flag_id)],
        "missing": [flag_id for flag_id in flag_ids if not paths.get(flag_id)],
    }


def _beat_coverage(dialogue, nodes, beats):
    inputs, outputs = _dialogue_flag_paths(dialogue, nodes)
    coverage = {}
    for beat in beats:
        groups = {
            "required": _coverage_group(beat.get("required_flags") or [], inputs["required"]),
            "forbidden": _coverage_group(beat.get("forbidden_flags") or [], inputs["forbidden"]),
            "outputs": _coverage_group(beat.get("expected_output_flags") or [], outputs),
        }
        warnings = []
        for key, label in [("required", "required"), ("forbidden", "forbidden"), ("outputs", "expected output")]:
            for flag_id in groups[key]["missing"]:
                warnings.append(f"Story beat '{beat.get('title')}' dialogue does not implement {label} flag '{flag_id}'.")
        coverage[beat["id"]] = {
            "beat_id": beat["id"],
            **groups,
            "implementation_paths": {
                flag_id: paths
                for paths_by_category in [inputs["required"], inputs["forbidden"], outputs]
                for flag_id, paths in paths_by_category.items()
            },
            "warnings": warnings,
        }
    return coverage


def _route_for_node(node):
    routes = {
        "quests": "/author/quests/{id}",
        "events": "/events?selected={id}",
        "dialogues": "/author/dialogues/{id}",
        "dialogue_nodes": "/dialogue-nodes?selected={id}",
        "encounters": "/author/encounters/{id}",
        "location_pois": "/location-pois?selected={id}",
        "location_routes": "/location-routes?selected={id}",
        "shops": "/shops?selected={id}",
        "items": "/author/items/{id}",
        "abilities": "/author/abilities/{id}",
        "story_arcs": "/story-arcs?selected={id}",
        "character_story_beats": "/character-story-beats?selected={id}",
    }
    template = routes.get(node.get("schema_name") or node.get("kind"), f"/{node.get('schema_name', '')}?selected={{id}}")
    return template.format(id=node.get("entry_id", ""))


def _world_echo(db_session, dialogue_id, nodes):
    index = build_dependency_index(db_session)
    node_map = {node["id"]: node for node in index["nodes"]}
    source_ids = {f"dialogue_nodes:{node.id}" for node in nodes}
    produced_flags = []
    consumers = []
    seen_flags = set()
    seen_consumers = set()
    for edge in index["edges"]:
        if edge["source"] in source_ids and edge["relation"] == "sets" and edge["target"] not in seen_flags:
            seen_flags.add(edge["target"])
            flag = node_map.get(edge["target"])
            if flag:
                produced_flags.append({
                    **flag, "source_id": edge["source"], "path": edge.get("path", ""),
                    "route": f"/flags?selected={flag['entry_id']}",
                })
        if edge["source"] in source_ids and edge["relation"] == "unlocks" and edge["target"] not in seen_consumers:
            seen_consumers.add(edge["target"])
            target = node_map.get(edge["target"])
            if target:
                consumers.append({
                    **target, "source_id": edge["source"], "path": edge.get("path", ""),
                    "relation": "unlocks", "route": _route_for_node(target),
                })
    return {
        "dialogue_id": dialogue_id,
        "produced_flags": produced_flags,
        "consumers": consumers,
    }


def _dialogue_packet(db_session, dialogue):
    node_models = db_session.query(DialogueNode).filter_by(dialogue_id=dialogue.id).all()
    participant_ids = _participant_ids(dialogue, node_models)
    participant_models = [db_session.get(Character, character_id) for character_id in participant_ids]
    participant_models = [character for character in participant_models if character]
    profiles = db_session.query(CharacterStoryProfile).filter(
        CharacterStoryProfile.character_id.in_(participant_ids)
    ).all() if participant_ids else []
    participant_next_sort_order = {}
    for character_id, in db_session.query(Character.id).all():
        orders = [
            beat.sort_order for beat in db_session.query(CharacterStoryBeat).filter_by(character_id=character_id).all()
        ]
        participant_next_sort_order[character_id] = max(orders, default=-1) + 1
    relationships = [
        relationship for relationship in db_session.query(CharacterRelationship).all()
        if relationship.from_character_id in participant_ids or relationship.to_character_id in participant_ids
    ]
    beat_models = db_session.query(CharacterStoryBeat).filter_by(dialogue_id=dialogue.id).all()
    beat_models.sort(key=lambda beat: (beat.character_id, beat.sort_order, beat.id))
    beats = [_columns(beat) for beat in beat_models]
    interaction_profiles = db_session.query(InteractionProfile).filter_by(dialogue_tree_id=dialogue.id).all()
    events = db_session.query(Event).filter_by(dialogue_id=dialogue.id).all()
    pois = db_session.query(LocationPoi).filter_by(dialogue_id=dialogue.id).all()
    requirements = db_session.query(Requirement).all()
    flags = db_session.query(Flag).all()
    factions = db_session.query(Faction).all()
    return {
        "dialogue": _columns(dialogue),
        "nodes": [_node_columns(node) for node in node_models],
        "story_beats": beats,
        "beat_coverage": _beat_coverage(dialogue, node_models, beats),
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
            "participants": [_compact(item) for item in participant_models],
            "story_profiles": [_columns(item) for item in profiles],
            "relationships": [_columns(item) for item in relationships],
            "participant_next_sort_order": participant_next_sort_order,
        },
        "world_echo": _world_echo(db_session, dialogue.id, node_models),
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


def _validate_node_graph(db_session, dialogue_id, dialogue_data, rows, deletion_ids):
    final_ids = {row["id"] for row in rows}
    existing_ids = {
        node_id for node_id, in db_session.query(DialogueNode.id).filter(DialogueNode.dialogue_id == dialogue_id).all()
    }
    omitted_ids = existing_ids - final_ids - set(deletion_ids)
    if omitted_ids:
        abort(400, description=f"nodes must include or explicitly delete every saved node: {', '.join(sorted(omitted_ids))}")
    inbound = {node_id: 0 for node_id in final_ids}
    choice_ids = []
    action_ids = []
    for index, row in enumerate(rows):
        existing = db_session.get(DialogueNode, row["id"])
        if existing and existing.dialogue_id != dialogue_id:
            abort(400, description=f"nodes[{index}].dialogue_id cannot reassign a saved node")
        if row.get("dialogue_id") != dialogue_id:
            abort(400, description=f"nodes[{index}].dialogue_id must match dialogue.id")
        choices = row.get("choices", [])
        if not isinstance(choices, list):
            abort(400, description=f"nodes[{index}].choices must be an array")
        choices = normalize_dialogue_choices(row["id"], choices)
        row["choices"] = choices
        for choice_index, choice in enumerate(choices):
            path = f"nodes[{index}].choices[{choice_index}]"
            if not isinstance(choice, dict):
                abort(400, description=f"{path} must be an object")
            try:
                validate_dialogue_choice_actions(db_session, choice, path)
            except ValueError as error:
                abort(400, description=str(error))
            choice_ids.append(choice["choice_id"])
            action_ids.extend(action["action_id"] for action in choice.get("actions", []))
            target_id = choice.get("next_node_id")
            if not target_id:
                abort(400, description=f"{path}.next_node_id is required")
            if target_id not in final_ids:
                abort(400, description=f"{path}.next_node_id must target a node in this dialogue")
            inbound[target_id] += 1
        explicit_terminal = row.get("is_terminal")
        if explicit_terminal is True and choices:
            abort(400, description=f"nodes[{index}].is_terminal cannot be true when the node has outgoing choices")
        if explicit_terminal is False and not choices:
            abort(400, description=f"nodes[{index}].is_terminal must be true when the node has no outgoing choices")
        # Compatibility for pre-migration clients: canonicalize leaf nodes on write.
        row["is_terminal"] = not choices
    if len(choice_ids) != len(set(choice_ids)):
        abort(400, description="choice_id values must be unique within a dialogue")
    if len(action_ids) != len(set(action_ids)):
        abort(400, description="action_id values must be unique within a dialogue")
    start_id = dialogue_data.get("starting_node_id")
    if rows and not start_id:
        roots = [node_id for node_id, count in inbound.items() if count == 0]
        if len(roots) != 1:
            abort(400, description="dialogue.starting_node_id is required when the graph does not have exactly one inferred start")
        start_id = roots[0]
        dialogue_data["starting_node_id"] = start_id
    if start_id and start_id not in final_ids:
        abort(400, description="dialogue.starting_node_id must target a node in this dialogue")
    if not rows:
        dialogue_data["starting_node_id"] = None
    for node_id in deletion_ids:
        existing = db_session.get(DialogueNode, node_id)
        if existing and existing.dialogue_id != dialogue_id:
            abort(400, description="deletions.nodes cannot delete a node from another dialogue")
        if node_id in final_ids:
            abort(400, description="deletions.nodes cannot also appear in nodes")


def _review_change(review, action, table, item_id, details=None):
    review[action].append({"table": table, "id": item_id, "details": details or {}})


def _reconcile(db_session, payload, commit):
    if not isinstance(payload, dict) or not isinstance(payload.get("dialogue"), dict):
        abort(400, description="dialogue bundle requires a dialogue object")
    dialogue_data = dict(payload["dialogue"])
    dialogue_id = dialogue_data.get("id")
    if not dialogue_id:
        abort(400, description="dialogue.id is required")
    rows = _require_rows(payload, "nodes")
    story_beats = _require_rows(payload, "story_beats")
    beat_unlinks = _require_rows(payload, "beat_unlinks")
    overlap = {row["id"] for row in story_beats} & {row["id"] for row in beat_unlinks}
    if overlap:
        abort(400, description=f"story beats cannot be updated and unlinked together: {', '.join(sorted(overlap))}")
    deletions = payload.get("deletions", {})
    if not isinstance(deletions, dict) or set(deletions) - {"nodes"}:
        abort(400, description="deletions may only contain nodes")
    deletion_ids = deletions.get("nodes", [])
    if not isinstance(deletion_ids, list) or any(not isinstance(item, str) or not item for item in deletion_ids):
        abort(400, description="deletions.nodes must be an array of ids")
    if len(deletion_ids) != len(set(deletion_ids)):
        abort(400, description="deletions.nodes contains duplicate ids")

    review = {"created": [], "changed": [], "deleted": [], "unlinked": []}
    warnings = []
    _validate_node_graph(db_session, dialogue_id, dialogue_data, rows, deletion_ids)
    existing_node_ids = {
        node_id for node_id, in db_session.query(DialogueNode.id).filter(DialogueNode.dialogue_id == dialogue_id).all()
    }
    dialogue_existed = db_session.get(Dialogue, dialogue_id) is not None
    dialogue = _upsert_with_route(db_session, dialogue_route, Dialogue, dialogue_data, "dialogue")
    _review_change(review, "changed" if dialogue_existed else "created", "dialogues", dialogue.id)

    for row in rows:
        if not db_session.get(DialogueNode, row["id"]):
            db_session.add(DialogueNode(
                id=row["id"], slug=row.get("slug") or row["id"], dialogue_id=dialogue_id,
                speaker=row.get("speaker") or "Speaker", text=row.get("text") or "",
                choices=[], set_flags=[], tags=[], is_terminal=bool(row.get("is_terminal")),
            ))
    db_session.flush()

    for index, row in enumerate(rows):
        existed = row["id"] in existing_node_ids
        _upsert_with_route(db_session, node_route, DialogueNode, row, f"nodes[{index}]")
        _review_change(review, "changed" if existed else "created", "dialogue_nodes", row["id"])
    for node_id in deletion_ids:
        node = db_session.get(DialogueNode, node_id)
        if node:
            db_session.delete(node)
            _review_change(review, "deleted", "dialogue_nodes", node_id)
    db_session.flush()

    participants = _participant_ids(dialogue, db_session.query(DialogueNode).filter_by(dialogue_id=dialogue_id).all())
    for index, data in enumerate(story_beats):
        path = f"story_beats[{index}]"
        existing = db_session.get(CharacterStoryBeat, data["id"])
        if existing and existing.dialogue_id not in {None, dialogue_id}:
            abort(400, description=f"{path} belongs to another dialogue")
        if existing and data.get("expected_previous") != _columns(existing):
            abort(400, description=f"{path}.expected_previous is stale")
        if not existing and data.get("character_id") not in participants:
            abort(400, description=f"{path}.character_id must be a current dialogue participant")
        if existing and data.get("character_id") not in participants:
            warnings.append({
                "id": f"story-beat:{data['id']}:former-participant",
                "message": f"Story beat '{data.get('title')}' is owned by a character who no longer participates.",
            })
        beat_data = {**data, "dialogue_id": dialogue_id}
        _upsert_with_route(db_session, story_beat_route, CharacterStoryBeat, beat_data, path)
        _review_change(review, "changed" if existing else "created", "character_story_beats", data["id"])

    for index, change in enumerate(beat_unlinks):
        path = f"beat_unlinks[{index}]"
        beat = db_session.get(CharacterStoryBeat, change["id"])
        if not beat or beat.dialogue_id != dialogue_id:
            abort(400, description=f"{path}.id must reference a beat linked to this dialogue")
        if change.get("expected_previous") != _columns(beat):
            abort(400, description=f"{path}.expected_previous is stale")
        beat.dialogue_id = None
        db_session.add(beat)
        review["unlinked"].append({"table": "character_story_beats", "id": beat.id, "details": {"dialogue_id": dialogue_id}})

    accepted = set(payload.get("accepted_warning_ids", []) or [])
    missing = [warning for warning in warnings if warning["id"] not in accepted]
    if commit and missing:
        abort(400, description="Accept all former-participant warnings before commit.")
    db_session.flush()
    linked_beats = [_columns(beat) for beat in db_session.query(CharacterStoryBeat).filter_by(dialogue_id=dialogue_id).all()]
    coverage = _beat_coverage(dialogue, db_session.query(DialogueNode).filter_by(dialogue_id=dialogue_id).all(), linked_beats)
    health_warnings = [warning for item in coverage.values() for warning in item["warnings"]]
    return {
        "review": review,
        "warnings": warnings,
        "health_warnings": health_warnings,
        "blockers": [],
        "dialogue_id": dialogue_id,
    }


@bp.get("/api/ui/dialogues/<dialogue_id>")
def get_dialogue_authoring_view(dialogue_id):
    db_session = get_db_session()
    try:
        dialogue = db_session.get(Dialogue, dialogue_id)
        if not dialogue:
            abort(404, description=f"Dialogue {dialogue_id} not found")
        return jsonify(_dialogue_packet(db_session, dialogue))
    finally:
        db_session.close()


@bp.post("/api/ui/dialogues/preview")
def preview_dialogue_bundle():
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


@bp.post("/api/ui/dialogues/bundle")
def save_dialogue_bundle():
    db_session = get_db_session()
    try:
        result = _reconcile(db_session, deepcopy(request.get_json(silent=True)), True)
        dialogue = db_session.get(Dialogue, result["dialogue_id"])
        db_session.commit()
        return jsonify(_dialogue_packet(db_session, dialogue))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
