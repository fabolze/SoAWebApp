from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_flags import Flag
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_story_arcs import StoryArc
from backend.app.routes.bundle_validation import bundle_error_response
from backend.app.routes.r_interaction_profiles import route as interaction_route
from backend.app.routes.r_quests import QuestRoute
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.routes.r_story_arcs import StoryArcRoute
from backend.app.routes.r_ui_item_ecosystem import _columns, _compact, _normalize_route_lists, _upsert
from backend.app.services.dependency_index import build_dependency_index, quest_context


bp = Blueprint("ui_quests", __name__)
quest_route = QuestRoute()
story_arc_route = StoryArcRoute()


def _catalogs(db_session):
    return {
        "quests": [_columns(row) for row in db_session.query(Quest).all()],
        "story_arcs": [_columns(row) for row in db_session.query(StoryArc).all()],
        "interaction_profiles": [_columns(row) for row in db_session.query(InteractionProfile).all()],
        "requirements": [requirement_route.serialize_item(row) for row in db_session.query(Requirement).all()],
        "flags": [_compact(row) for row in db_session.query(Flag).all()],
    }


def _packet(db_session, quest):
    index = build_dependency_index(db_session)
    packet = _catalogs(db_session)
    selected_arc = db_session.get(StoryArc, quest.story_arc_id) if quest.story_arc_id else None
    branch_entry = next((
        entry for entry in (selected_arc.branching or [])
        if isinstance(entry, dict) and entry.get("quest_id") == quest.id
    ), None) if selected_arc else None
    packet.update({
        "quest": quest_route.serialize_item(quest),
        "requirements": [
            requirement_route.serialize_item(row)
            for row in db_session.query(Requirement).all()
            if row.id == quest.requirements_id or row.id in {
                objective.get("requirements_id")
                for objective in quest.objectives or []
                if isinstance(objective, dict)
            }
        ],
        "quest_giver_profile_ids": [
            row.id for row in db_session.query(InteractionProfile).all()
            if quest.id in (row.available_quests or [])
        ],
        "dependency_context": quest_context(index, quest.id),
        "arc": {
            "story_arc_id": selected_arc.id if selected_arc else "",
            "related_quests": list(selected_arc.related_quests or []) if selected_arc else [quest.id],
            "branches": list(branch_entry.get("branches", [])) if branch_entry else [],
        },
    })
    return packet


def _reconcile_arcs(db_session, quest_id, selected_arc_id, related_quests, branches):
    if selected_arc_id and not db_session.get(StoryArc, selected_arc_id):
        abort(400, description=f"arc.story_arc_id references missing story arc: {selected_arc_id}")
    if not isinstance(related_quests, list) or any(not isinstance(value, str) for value in related_quests):
        abort(400, description="arc.related_quests must be an array of quest ids")
    if not isinstance(branches, list):
        abort(400, description="arc.branches must be an array")
    for arc in db_session.query(StoryArc).all():
        original_related = list(arc.related_quests or [])
        original_branching = list(arc.branching or [])
        data = _columns(arc)
        data["related_quests"] = [value for value in original_related if value != quest_id]
        data["branching"] = [
            value for value in original_branching
            if not isinstance(value, dict) or value.get("quest_id") != quest_id
        ]
        if arc.id == selected_arc_id:
            ordered = [value for value in related_quests if value != quest_id]
            insert_at = min(len(ordered), related_quests.index(quest_id)) if quest_id in related_quests else len(ordered)
            ordered.insert(insert_at, quest_id)
            data["related_quests"] = ordered
            if branches:
                data["branching"].append({"quest_id": quest_id, "branches": branches})
        if data["related_quests"] != original_related or data["branching"] != original_branching:
            _upsert(db_session, story_arc_route, StoryArc, data, f"arc[{arc.id}]")


def _reconcile_givers(db_session, quest_id, profile_ids):
    if not isinstance(profile_ids, list) or any(not isinstance(value, str) for value in profile_ids):
        abort(400, description="quest_giver_profile_ids must be an array of ids")
    desired = set(profile_ids)
    profiles = db_session.query(InteractionProfile).all()
    known = {row.id for row in profiles}
    missing = desired - known
    if missing:
        abort(400, description=f"quest_giver_profile_ids references missing profile: {sorted(missing)[0]}")
    for profile in profiles:
        data = _columns(profile)
        quests = [value for value in profile.available_quests or [] if value != quest_id]
        if profile.id in desired:
            quests.append(quest_id)
        data["available_quests"] = quests
        if quests != (profile.available_quests or []):
            _upsert(db_session, interaction_route, InteractionProfile, data, f"quest_giver_profile_ids[{profile.id}]")


@bp.get("/api/ui/quests")
def get_quest_selector():
    db_session = get_db_session()
    try:
        return jsonify(_catalogs(db_session))
    finally:
        db_session.close()


@bp.get("/api/ui/quests/<quest_id>")
def get_quest_journey(quest_id):
    db_session = get_db_session()
    try:
        quest = db_session.get(Quest, quest_id)
        if not quest:
            abort(404, description=f"Quest {quest_id} not found")
        return jsonify(_packet(db_session, quest))
    finally:
        db_session.close()


@bp.post("/api/ui/quests/bundle")
def save_quest_journey():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("quest"), dict):
            abort(400, description="quest journey bundle requires a quest object")
        quest_data = dict(payload["quest"])
        quest_id = quest_data.get("id")
        if not quest_id:
            abort(400, description="quest.id is required")
        objective_requirement_ids = {
            objective.get("requirements_id") or objective.get("requirements")
            for objective in quest_data.get("objectives", [])
            if isinstance(objective, dict)
        }
        allowed_requirement_ids = objective_requirement_ids | {quest_data.get("requirements_id")}
        allowed_requirement_ids.discard(None)
        requirements = payload.get("requirements", [])
        if not isinstance(requirements, list):
            abort(400, description="requirements must be an array")
        for index, requirement in enumerate(requirements):
            if not isinstance(requirement, dict) or requirement.get("id") not in allowed_requirement_ids:
                abort(400, description=f"requirements[{index}].id is not linked to this quest")
            _upsert(db_session, requirement_route, Requirement, requirement, f"requirements[{index}]")
        arc = payload.get("arc", {})
        if not isinstance(arc, dict):
            abort(400, description="arc must be an object")
        selected_arc_id = arc.get("story_arc_id") or None
        quest_data["story_arc_id"] = selected_arc_id
        quest = _upsert(db_session, quest_route, Quest, _normalize_route_lists(Quest, quest_data), "quest")
        _reconcile_arcs(db_session, quest_id, selected_arc_id, arc.get("related_quests", []), arc.get("branches", []))
        _reconcile_givers(db_session, quest_id, payload.get("quest_giver_profile_ids", []))
        db_session.commit()
        return jsonify(_packet(db_session, quest))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
