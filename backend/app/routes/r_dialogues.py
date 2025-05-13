from flask import Blueprint, request, jsonify
from backend.app.models.m_dialogues import Dialogue
from backend.app.db.init_db import get_db_session

bp = Blueprint('dialogues', __name__)

@bp.route("/api/dialogues", methods=["POST"])
def upsert_dialogue():
    db_session = get_db_session()
    data = request.json
    dialogue_id = data.get("id")
    
    dialogue = db_session.get(Dialogue, dialogue_id) or Dialogue(id=dialogue_id)
    dialogue.text = data.get("text")
    dialogue.speaker = data.get("speaker")
    
    db_session.add(dialogue)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/dialogues", methods=["GET"])
def list_dialogues():
    db_session = get_db_session()
    dialogues = db_session.query(Dialogue).all()
    return jsonify([{"id": d.id, "text": d.text} for d in dialogues])
