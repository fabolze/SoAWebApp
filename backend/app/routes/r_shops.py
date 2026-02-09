from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_shops import Shop
from backend.app.models.m_locations import Location
from backend.app.models.m_characters import Character
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_currencies import Currency
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
        
    def serialize_item(self, shop: Shop) -> Dict[str, Any]:
        return self.serialize_model(shop)
        
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

