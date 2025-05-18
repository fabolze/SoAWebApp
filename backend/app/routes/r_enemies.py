from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_enemies import Enemy, EnemyType, Aggression
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_factions import Faction
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class EnemyRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Enemy,
            blueprint_name='enemies',
            route_prefix='/api/enemies'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["enemy_id", "name", "type", "level"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["enemy_id"]
    
    def process_input_data(self, db_session: Session, enemy: Enemy, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": EnemyType,
            "aggression": Aggression
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "class_id": CharacterClass,
            "faction_id": Faction
        })
        
        # Required fields
        enemy.name = data["name"]
        enemy.type = data["type"]  # Already converted to enum
        enemy.level = data["level"]
        
        # Optional fields
        enemy.description = data.get("description")
        enemy.image_path = data.get("image_path")
        enemy.aggression = data.get("aggression")  # Already converted to enum if present
        
        # Relationship fields
        enemy.class_id = data.get("class_id")
        enemy.faction_id = data.get("faction_id")
        
        # JSON fields
        enemy.custom_stats = data.get("custom_stats", {})
        enemy.custom_abilities = data.get("custom_abilities", [])
        enemy.tags = data.get("tags", [])
        enemy.loot_table = data.get("loot_table", [])
        enemy.related_quests = data.get("related_quests", [])

    def serialize_item(self, enemy: Enemy) -> Dict[str, Any]:
        return {
            "id": enemy.id,
            "name": enemy.name,
            "type": enemy.type.value if enemy.type else None,
            "level": enemy.level,
            "description": enemy.description,
            "image_path": enemy.image_path,
            "class_id": enemy.class_id,
            "faction_id": enemy.faction_id,
            "aggression": enemy.aggression.value if enemy.aggression else None,
            "custom_stats": enemy.custom_stats,
            "custom_abilities": enemy.custom_abilities,
            "tags": enemy.tags,
            "loot_table": enemy.loot_table,
            "related_quests": enemy.related_quests
        }

# Create the route instance
bp = EnemyRoute().bp
