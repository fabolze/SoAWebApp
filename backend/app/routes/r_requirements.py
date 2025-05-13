from flask import Blueprint, request, jsonify
from backend.app.models.m_requirements import Requirement
from backend.app.db.init_db import get_db_session

bp = Blueprint('requirements', __name__)

@bp.route("/api/requirements", methods=["POST"])
def upsert_requirement():
    db_session = get_db_session()
    data = request.json
    req_id = data.get("id")
    
    req = db_session.get(Requirement, req_id) or Requirement(id=req_id)
    req.name = data.get("name")
    req.description = data.get("description")
    
    db_session.add(req)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/requirements", methods=["GET"])
def list_requirements():
    db_session = get_db_session()
    requirements = db_session.query(Requirement).all()
    return jsonify([{"id": r.id, "name": r.name} for r in requirements])
