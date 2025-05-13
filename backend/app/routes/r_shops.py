from flask import Blueprint, request, jsonify
from backend.app.models.m_shops import Shop
from backend.app.db.init_db import get_db_session

bp = Blueprint('shops', __name__)

@bp.route("/api/shops", methods=["POST"])
def upsert_shop():
    db_session = get_db_session()
    data = request.json
    shop_id = data.get("id")
    
    shop = db_session.get(Shop, shop_id) or Shop(id=shop_id)
    shop.name = data.get("name")
    shop.description = data.get("description")
    shop.icon_path = data.get("icon_path")
    
    db_session.add(shop)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/shops", methods=["GET"])
def list_shops():
    db_session = get_db_session()
    shops = db_session.query(Shop).all()
    return jsonify([{"id": s.id, "name": s.name} for s in shops])
