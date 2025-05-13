from flask import Blueprint, request, jsonify
from backend.app.models.m_events import Event
from backend.app.db.init_db import get_db_session

bp = Blueprint('events', __name__)

@bp.route("/api/events", methods=["POST"])
def upsert_event():
    db_session = get_db_session()
    data = request.json
    event_id = data.get("id")
    
    event = db_session.get(Event, event_id) or Event(id=event_id)
    event.name = data.get("name")
    event.description = data.get("description")
    event.trigger_condition = data.get("trigger_condition")
    
    db_session.add(event)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/events", methods=["GET"])
def list_events():
    db_session = get_db_session()
    events = db_session.query(Event).all()
    return jsonify([{"id": e.id, "name": e.name} for e in events])
