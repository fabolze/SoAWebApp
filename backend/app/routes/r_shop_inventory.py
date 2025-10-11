from flask import Blueprint, request, jsonify, abort
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.models.m_shops import Shop
from backend.app.models.m_items import Item
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_currencies import Currency
from backend.app.db.init_db import get_db_session
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class ShopInventoryRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=ShopInventory,
            blueprint_name='shop_inventory',
            route_prefix='/api/shop-inventory'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "shop_id", "item_id"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, inventory: ShopInventory, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "shop_id": Shop,
            "item_id": Item,
            "requirements_id": Requirement,
            "currency_id": Currency
        })
        
        # Required fields
        inventory.slug = data["slug"]
        inventory.shop_id = data["shop_id"]
        inventory.item_id = data["item_id"]
        
        # Pricing fields
        if "price_modifier" in data:
            value = data.get("price_modifier")
            inventory.price_modifier = float(value) if value not in (None, "") else 0.0
        elif inventory.price_modifier is None:
            inventory.price_modifier = 0.0
        if "price_multiplier" in data:
            value = data.get("price_multiplier")
            inventory.price_multiplier = float(value) if value not in (None, "") else 1.0
        elif inventory.price_multiplier is None:
            inventory.price_multiplier = 1.0
        override_set = False
        if "price_override" in data:
            price_override = data.get("price_override")
            inventory.price_override = float(price_override) if price_override not in (None, "") else None
            override_set = True
        elif "price" in data:
            price_override = data.get("price")
            inventory.price_override = float(price_override) if price_override not in (None, "") else None
            override_set = True
        if not override_set and inventory.price_override is None:
            inventory.price_override = None
        if "currency_id" in data:
            inventory.currency_id = data.get("currency_id")

        # Optional fields
        inventory.stock = data.get("stock")  # Can be null for infinite stock
        inventory.requirements_id = data.get("requirements_id")
        
        # JSON fields
        inventory.tags = data.get("tags", [])
        
    def serialize_item(self, inventory: ShopInventory) -> Dict[str, Any]:
        data = self.serialize_model(inventory)
        data.pop("shop", None)
        return data
        
    def get_shop_inventory(self, shop_id: str):
        """Get inventory for a specific shop."""
        with get_db_session() as db_session:
            # Validate shop exists
            if not db_session.get(Shop, shop_id):
                abort(404, description=f"Shop {shop_id} not found")
            inventory = db_session.query(self.model).filter(self.model.shop_id == shop_id).all()
            return jsonify(self.serialize_list(inventory))
        
    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.shop_id.ilike(f"%{search}%")) |
                    (self.model.item_id.ilike(f"%{search}%"))
                )
            if tags:
                query = query.filter(self.model.tags != None)
                for tag in tags:
                    tag = tag.strip()
                    if tag:
                        query = query.filter(
                            self.model.tags.any(lambda t: t.ilike(f"%{tag}%"))
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
route_instance = ShopInventoryRoute()
bp = route_instance.bp

# Register additional routes
bp.route("/api/shops/<shop_id>/inventory", methods=["GET"])(route_instance.get_shop_inventory)
