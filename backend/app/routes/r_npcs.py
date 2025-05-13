from flask import Blueprint, request, jsonify
from backend.app.models.m_npcs import Npc
from backend.app.db.init_db import get_db_session

bp = Blueprint('npcs', __name__)

@bp.route("/api/npcs", methods=["POST"])
def upsert_npc():
    db_session = get_db_session()
    data = request.json
    npc_id = data.get("id")
    
    npc = db_session.get(Npc, npc_id) or Npc(id=npc_id)
    npc.name = data.get("name")
    npc.description = data.get("description")
    npc.icon_path = data.get("icon_path")
    
    db_session.add(npc)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/npcs", methods=["GET"])
def list_npcs():
    db_session = get_db_session()
    npcs = db_session.query(Npc).all()
    return jsonify([{"id": n.id, "name": n.name} for n in npcs])
