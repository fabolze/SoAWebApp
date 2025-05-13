from flask import Blueprint, request, jsonify
from backend.app.models.m_flags import Flag
from backend.app.db.init_db import get_db_session

bp = Blueprint('flags', __name__)

@bp.route("/api/flags", methods=["POST"])
def upsert_flag():
    db_session = get_db_session()
    data = request.json
    flag_id = data.get("id")
    
    flag = db_session.get(Flag, flag_id) or Flag(id=flag_id)
    flag.name = data.get("name")
    flag.description = data.get("description")
    
    db_session.add(flag)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/flags", methods=["GET"])
def list_flags():
    db_session = get_db_session()
    flags = db_session.query(Flag).all()
    return jsonify([{"id": f.id, "name": f.name} for f in flags])
