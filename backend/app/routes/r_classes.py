from flask import Blueprint, request, jsonify
from backend.app.models.m_classes import Class
from backend.app.db.init_db import get_db_session

bp = Blueprint('classes', __name__)

@bp.route("/api/classes", methods=["POST"])
def upsert_class():
    db_session = get_db_session()
    data = request.json
    class_id = data.get("id")
    
    class_ = db_session.get(Class, class_id) or Class(id=class_id)
    class_.name = data.get("name")
    class_.description = data.get("description")
    
    db_session.add(class_)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/classes", methods=["GET"])
def list_classes():
    db_session = get_db_session()
    classes = db_session.query(Class).all()
    return jsonify([{"id": c.id, "name": c.name} for c in classes])
