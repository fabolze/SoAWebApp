from flask import Blueprint, request, jsonify
from backend.app.models.m_timelines import Timeline
from backend.app.db.init_db import get_db_session

bp = Blueprint('timelines', __name__)

@bp.route("/api/timelines", methods=["POST"])
def upsert_timeline():
    db_session = get_db_session()
    data = request.json
    timeline_id = data.get("id")
    
    timeline = db_session.get(Timeline, timeline_id) or Timeline(id=timeline_id)
    timeline.name = data.get("name")
    timeline.description = data.get("description")
    
    db_session.add(timeline)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/timelines", methods=["GET"])
def list_timelines():
    db_session = get_db_session()
    timelines = db_session.query(Timeline).all()
    return jsonify([{"id": t.id, "name": t.name} for t in timelines])
