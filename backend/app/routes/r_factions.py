from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_factions import Faction, Alignment
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class FactionRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Faction,
            blueprint_name='factions',
            route_prefix='/api/factions'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["faction_id", "name", "alignment"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["faction_id"]
    
    def process_input_data(self, db_session: Session, faction: Faction, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "alignment": Alignment
        })
        
        # Required fields
        faction.name = data["name"]
        faction.alignment = data["alignment"]  # Already converted to enum
        
        # Optional fields
        faction.description = data.get("description")
        faction.icon_path = data.get("icon_path")
        
        # JSON fields with relationship alignment validation
        relationships = data.get("relationships", {})
        for rel_alignment in relationships.values():
            try:
                Alignment(rel_alignment)
            except ValueError:
                raise ValueError(f"Invalid relationship alignment: {rel_alignment}")
        faction.relationships = relationships
        
        faction.reputation_config = data.get("reputation_config", {})
        faction.tag = data.get("tag", [])

    def serialize_item(self, faction: Faction) -> Dict[str, Any]:
        return {
            "id": faction.id,
            "name": faction.name,
            "description": faction.description,
            "alignment": faction.alignment.value if faction.alignment else None,
            "relationships": faction.relationships,
            "reputation_config": faction.reputation_config,
            "tag": faction.tag,
            "icon_path": faction.icon_path
        }

# Create the route instance
bp = FactionRoute().bp
