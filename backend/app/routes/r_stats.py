from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_stats import Stat, StatCategory, ValueType, ScalingBehavior
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class StatRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Stat,
            blueprint_name='stats',
            route_prefix='/api/stats'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "name", "category", "value_type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, stat: Stat, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "category": StatCategory,
            "value_type": ValueType,
            "scaling_behavior": ScalingBehavior
        })
        
        # Required fields
        stat.name = data["name"]
        stat.category = data["category"]  # Already converted to enum
        stat.value_type = data["value_type"]  # Already converted to enum
        
        # Optional fields
        stat.description = data.get("description")
        stat.default_value = data.get("default_value")
        stat.min_value = data.get("min_value")
        stat.max_value = data.get("max_value")
        stat.icon_path = data.get("icon_path")
        stat.scaling_behavior = data.get("scaling_behavior")  # Already converted to enum if present
        
        # JSON fields
        stat.applies_to = data.get("applies_to", [])

    def serialize_item(self, stat: Stat) -> Dict[str, Any]:
        return {
            "id": stat.id,
            "name": stat.name,
            "category": stat.category.value if stat.category else None,
            "description": stat.description,
            "value_type": stat.value_type.value if stat.value_type else None,
            "default_value": stat.default_value,
            "min_value": stat.min_value,
            "max_value": stat.max_value,
            "scaling_behavior": stat.scaling_behavior.value if stat.scaling_behavior else None,
            "applies_to": stat.applies_to,
            "icon_path": stat.icon_path
        }

# Create the route instance
bp = StatRoute().bp
