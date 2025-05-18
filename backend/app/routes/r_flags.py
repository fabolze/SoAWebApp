from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_flags import Flag, FlagType, ContentPack
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class FlagRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Flag,
            blueprint_name='flags',
            route_prefix='/api/flags'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["flag_id", "name", "description"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["flag_id"]
    
    def process_input_data(self, db_session: Session, flag: Flag, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "flag_type": FlagType,
            "content_pack": ContentPack
        })
        
        # Required fields
        flag.name = data["name"]
        flag.description = data["description"]
        
        # Optional fields
        flag.flag_type = data.get("flag_type")  # Already converted to enum if present
        flag.default_value = data.get("default_value", False)
        flag.content_pack = data.get("content_pack")  # Already converted to enum if present
        
        # JSON fields
        flag.tags = data.get("tags", [])

    def serialize_item(self, flag: Flag) -> Dict[str, Any]:
        return {
            "id": flag.id,
            "name": flag.name,
            "description": flag.description,
            "flag_type": flag.flag_type.value if flag.flag_type else None,
            "default_value": flag.default_value,
            "content_pack": flag.content_pack.value if flag.content_pack else None,
            "tags": flag.tags
        }

# Create the route instance
bp = FlagRoute().bp
