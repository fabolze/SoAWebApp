from flask import Blueprint, request, jsonify
from backend.app.models.m_quests import Quest
from backend.app.db.init_db import get_db_session

bp = Blueprint('quests', __name__)

@bp.route("/api/quests", methods=["POST"])
def upsert_quest():
    db_session = get_db_session()
    data = request.json
    quest_id = data.get("id")
    
    quest = db_session.get(Quest, quest_id) or Quest(id=quest_id)
    quest.name = data.get("name")
    quest.description = data.get("description")
    quest.icon_path = data.get("icon_path")
    
    db_session.add(quest)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/quests", methods=["GET"])
def list_quests():
    db_session = get_db_session()
    quests = db_session.query(Quest).all()
    return jsonify([{"id": q.id, "name": q.name} for q in quests])
