from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_shops import Shop
from backend.app.models.m_locations import Location
from backend.app.models.m_npcs import NPC
from backend.app.models.m_requirements import Requirement
from typing import Any, Dict, List
from sqlalchemy.orm import Session

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

# Create the route instance
bp = ShopRoute().bp
