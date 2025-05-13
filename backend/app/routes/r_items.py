from flask import Blueprint, request, jsonify
from backend.app.models.m_items import Item
from backend.app.db.init_db import get_db_session

bp = Blueprint('items', __name__)

@bp.route("/api/items", methods=["POST"])
def upsert_item():
    db_session = get_db_session()
    data = request.json
    item_id = data.get("id")
    
    item = db_session.get(Item, item_id) or Item(id=item_id)
    item.name = data.get("name")
    item.description = data.get("description")
    item.icon_path = data.get("icon_path")
    item.type = data.get("type")
    item.value = data.get("value")
    item.weight = data.get("weight")
    
    db_session.add(item)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/items", methods=["GET"])
def list_items():
    db_session = get_db_session()
    items = db_session.query(Item).all()
    return jsonify([{"id": i.id, "name": i.name} for i in items])
