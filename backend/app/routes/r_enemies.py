from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_enemies import Enemy, EnemyType, Aggression
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_factions import Faction
from backend.app.models.m_currencies import Currency
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class EnemyRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Enemy,
            blueprint_name='enemies',
            route_prefix='/api/enemies'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "type", "level"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
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
        enemy.slug = data["slug"]
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
        currency_rewards = data.get("currency_rewards", [])
        for entry in currency_rewards:
            if not isinstance(entry, dict):
                raise ValueError("Currency rewards must be objects")
            currency_id = entry.get("currency_id")
            if currency_id and not db_session.get(Currency, currency_id):
                raise ValueError(f"Invalid currency_id in rewards: {currency_id}")
        enemy.currency_rewards = currency_rewards

        reputation_rewards = data.get("reputation_rewards", [])
        for entry in reputation_rewards:
            if not isinstance(entry, dict):
                raise ValueError("Reputation rewards must be objects")
            faction_id = entry.get("faction_id")
            if faction_id and not db_session.get(Faction, faction_id):
                raise ValueError(f"Invalid faction_id in rewards: {faction_id}")
        enemy.reputation_rewards = reputation_rewards

        enemy.xp_reward = data.get("xp_reward")
        enemy.related_quests = data.get("related_quests", [])

    def serialize_item(self, enemy: Enemy) -> Dict[str, Any]:
        return self.serialize_model(enemy)

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
bp = EnemyRoute().bp
