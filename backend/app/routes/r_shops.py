from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_shops import Shop
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.models.m_items import Item
from backend.app.models.m_locations import Location
from backend.app.models.m_characters import Character
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_currencies import Currency
from backend.app.utils.id import generate_ulid
from backend.app.utils.pricing import compute_shop_price
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class ShopRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Shop,
            blueprint_name='shops',
            route_prefix='/api/shops'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, shop: Shop, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "location_id": Location,
            "character_id": Character,
            "requirements_id": Requirement,
            "currency_id": Currency
        })
        
        # Required fields
        shop.slug = data["slug"]
        shop.name = data["name"]
        
        # Optional fields
        shop.description = data.get("description")
        if "price_modifier" in data:
            value = data.get("price_modifier")
            shop.price_modifier = float(value) if value not in (None, "") else 0.0
        elif shop.price_modifier is None:
            shop.price_modifier = 0.0
        if "price_multiplier" in data:
            value = data.get("price_multiplier")
            shop.price_multiplier = float(value) if value not in (None, "") else 1.0
        elif shop.price_multiplier is None:
            shop.price_multiplier = 1.0
        if "price_override" in data:
            price_override = data.get("price_override")
            shop.price_override = float(price_override) if price_override not in (None, "") else None
        if "currency_id" in data:
            shop.currency_id = data.get("currency_id")

        # Relationship fields
        shop.location_id = data.get("location_id")
        shop.character_id = data.get("character_id")
        shop.requirements_id = data.get("requirements_id")

        if shop.character_id:
            profile = db_session.query(InteractionProfile).filter_by(character_id=shop.character_id).first()
            if not profile:
                raise ValueError("Shop character requires an interaction profile")
        
        # JSON fields
        shop.price_modifiers = data.get("price_modifiers", {})  # Dict of discount/markup rules
        shop.tags = data.get("tags", [])

        if "inventory" in data:
            self._replace_inventory_rows(db_session, shop, data.get("inventory") or [])

    def _replace_inventory_rows(self, db_session: Session, shop: Shop, rows: List[Dict[str, Any]]) -> None:
        if not isinstance(rows, list):
            raise ValueError("inventory must be an array")

        existing_by_id = {row.id: row for row in list(shop.inventory or []) if row.id}
        next_rows: List[ShopInventory] = []
        seen_ids = set()

        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValueError("inventory entries must be objects")
            item_id = row.get("item_id")
            if not item_id:
                raise ValueError("inventory entries require item_id")
            if not db_session.get(Item, item_id):
                raise ValueError(f"Invalid inventory item_id: {item_id}")
            requirements_id = row.get("requirements_id")
            if requirements_id and not db_session.get(Requirement, requirements_id):
                raise ValueError(f"Invalid inventory requirements_id: {requirements_id}")
            currency_id = row.get("currency_id")
            if currency_id and not db_session.get(Currency, currency_id):
                raise ValueError(f"Invalid inventory currency_id: {currency_id}")

            row_id = row.get("id") or generate_ulid()
            if row_id in seen_ids:
                raise ValueError(f"Duplicate inventory id: {row_id}")
            seen_ids.add(row_id)

            inventory = existing_by_id.get(row_id) or ShopInventory(id=row_id)
            inventory.shop_id = shop.id
            inventory.item_id = item_id
            inventory.slug = row.get("slug") or f"{shop.slug}-{item_id}-{index + 1}"
            inventory.stock = row.get("stock")
            inventory.requirements_id = requirements_id
            inventory.currency_id = currency_id
            inventory.price_modifier = self._float_or_default(row.get("price_modifier"), 0.0)
            inventory.price_multiplier = self._float_or_default(row.get("price_multiplier"), 1.0)
            inventory.price_override = self._float_or_default(row.get("price_override"), None)
            inventory.tags = row.get("tags", [])
            next_rows.append(inventory)

        shop.inventory[:] = next_rows

    @staticmethod
    def _float_or_default(value: Any, default):
        if value in (None, ""):
            return default
        return float(value)
        
    def serialize_item(self, shop: Shop) -> Dict[str, Any]:
        data = self.serialize_model(shop)
        data["inventory"] = [self._serialize_inventory_row(row, shop) for row in sorted(shop.inventory or [], key=lambda entry: entry.slug or entry.id or "")]
        return data

    def _serialize_inventory_row(self, inventory: ShopInventory, shop: Shop) -> Dict[str, Any]:
        row = {
            "id": inventory.id,
            "slug": inventory.slug,
            "shop_id": inventory.shop_id,
            "item_id": inventory.item_id,
            "stock": inventory.stock,
            "requirements_id": inventory.requirements_id,
            "price_modifier": inventory.price_modifier,
            "price_multiplier": inventory.price_multiplier,
            "price_override": inventory.price_override,
            "currency_id": inventory.currency_id,
            "tags": inventory.tags or [],
        }
        if inventory.item:
            row["item_name"] = inventory.item.name
            row["item_slug"] = inventory.item.slug
            row["price_preview"] = compute_shop_price(inventory.item, inventory, shop)
        return row
        
    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%")) |
                    (self.model.id.ilike(f"%{search}%"))
                )
            if tags:
                query = query.filter(self.model.tags != None)
                for tag in tags:
                    tag = tag.strip()
                    if tag:
                        query = query.filter(
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = ShopRoute().bp

