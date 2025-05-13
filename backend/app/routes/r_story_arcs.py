from flask import Blueprint, request, jsonify
from backend.app.models.m_story_arcs import StoryArc
from backend.app.db.init_db import get_db_session

bp = Blueprint('story_arcs', __name__)

@bp.route("/api/story_arcs", methods=["POST"])
def upsert_story_arc():
    db_session = get_db_session()
    data = request.json
    story_arc_id = data.get("id")
    
    story_arc = db_session.get(StoryArc, story_arc_id) or StoryArc(id=story_arc_id)
    story_arc.name = data.get("name")
    story_arc.description = data.get("description")
    story_arc.icon_path = data.get("icon_path")
    
    db_session.add(story_arc)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/story_arcs", methods=["GET"])
def list_story_arcs():
    db_session = get_db_session()
    story_arcs = db_session.query(StoryArc).all()
    return jsonify([{"id": sa.id, "name": sa.name} for sa in story_arcs])
