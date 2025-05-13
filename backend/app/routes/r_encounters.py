from flask import Blueprint, request, jsonify
from backend.app.models.m_encounters import Encounter
from backend.app.db.init_db import get_db_session

bp = Blueprint('encounters', __name__)

@bp.route("/api/encounters", methods=["POST"])
def upsert_encounter():
    db_session = get_db_session()
    data = request.json
    encounter_id = data.get("id")
    
    encounter = db_session.get(Encounter, encounter_id) or Encounter(id=encounter_id)
    encounter.name = data.get("name")
    encounter.description = data.get("description")
    encounter.icon_path = data.get("icon_path")
    
    db_session.add(encounter)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/encounters", methods=["GET"])
def list_encounters():
    db_session = get_db_session()
    encounters = db_session.query(Encounter).all()
    return jsonify([{"id": e.id, "name": e.name} for e in encounters])
