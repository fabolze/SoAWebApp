from flask import Blueprint, request, jsonify
from backend.app.models.m_stats.py import Stat
from backend.app.db.init_db import get_db_session

bp = Blueprint('stats', __name__)

@bp.route("/api/stats", methods=["POST"])
def upsert_stat():
    db_session = get_db_session()
    data = request.json
    stat_id = data.get("id")
    
    stat = db_session.get(Stat, stat_id) or Stat(id=stat_id)
    stat.name = data.get("name")
    stat.description = data.get("description")
    stat.icon_path = data.get("icon_path")
    
    db_session.add(stat)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/stats", methods=["GET"])
def list_stats():
    db_session = get_db_session()
    stats = db_session.query(Stat).all()
    return jsonify([{"id": s.id, "name": s.name} for s in stats])
