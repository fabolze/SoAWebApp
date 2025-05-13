from flask import Blueprint, request, jsonify
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.db.init_db import get_db_session

bp = Blueprint('shop_inventory', __name__)

@bp.route("/api/shop_inventory", methods=["POST"])
def upsert_shop_inventory():
    db_session = get_db_session()
    data = request.json
    inventory_id = data.get("id")
    
    inventory = db_session.get(ShopInventory, inventory_id) or ShopInventory(id=inventory_id)
    inventory.shop_id = data.get("shop_id")
    inventory.item_id = data.get("item_id")
    inventory.quantity = data.get("quantity")
    
    db_session.add(inventory)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/shop_inventory", methods=["GET"])
def list_shop_inventory():
    db_session = get_db_session()
    inventories = db_session.query(ShopInventory).all()
    return jsonify([{"id": i.id, "shop_id": i.shop_id} for i in inventories])
