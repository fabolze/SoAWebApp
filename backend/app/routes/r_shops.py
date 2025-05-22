from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_shops import Shop
from backend.app.models.m_locations import Location
from backend.app.models.m_npcs import NPC
from backend.app.models.m_requirements import Requirement
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
        return ["shop_id", "name"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["shop_id"]
        
    def process_input_data(self, db_session: Session, shop: Shop, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "location_id": Location,
            "npc_id": NPC,
            "requirements_id": Requirement
        })
        
        # Required fields
        shop.name = data["name"]
        
        # Optional fields
        shop.description = data.get("description")
        
        # Relationship fields
        shop.location_id = data.get("location_id")
        shop.npc_id = data.get("npc_id")
        shop.requirements_id = data.get("requirements_id")
        
        # JSON fields
        shop.price_modifiers = data.get("price_modifiers", {})  # Dict of discount/markup rules
        shop.tags = data.get("tags", [])
        
    def serialize_item(self, shop: Shop) -> Dict[str, Any]:
        return {
            "id": shop.id,
            "name": shop.name,
            "description": shop.description,
            "location_id": shop.location_id,
            "npc_id": shop.npc_id,
            "requirements_id": shop.requirements_id,
            "price_modifiers": shop.price_modifiers,
            "tags": shop.tags
        }
        
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
                            self.model.tags.any(lambda t: t.ilike(f"%{tag}%"))
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = ShopRoute().bp
