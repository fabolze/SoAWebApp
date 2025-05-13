from flask import Blueprint, request, jsonify
from backend.app.models.m_factions import Faction
from backend.app.db.init_db import get_db_session

bp = Blueprint('factions', __name__)

@bp.route("/api/factions", methods=["POST"])
def upsert_faction():
    db_session = get_db_session()
    data = request.json
    faction_id = data.get("id")
    
    faction = db_session.get(Faction, faction_id) or Faction(id=faction_id)
    faction.name = data.get("name")
    faction.description = data.get("description")
    faction.icon_path = data.get("icon_path")
    
    db_session.add(faction)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/factions", methods=["GET"])
def list_factions():
    db_session = get_db_session()
    factions = db_session.query(Faction).all()
    return jsonify([{"id": f.id, "name": f.name} for f in factions])
