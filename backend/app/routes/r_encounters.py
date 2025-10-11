from flask import Blueprint, request, jsonify, abort
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_enemies import Enemy
from backend.app.models.m_flags import Flag
from backend.app.models.m_npcs import NPC
from backend.app.models.m_currencies import Currency
from backend.app.models.m_factions import Faction
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.init_db import get_db_session

class EncounterRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Encounter,
            blueprint_name='encounters',
            route_prefix='/api/encounters'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "encounter_type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, encounter: Encounter, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "encounter_type": EncounterType
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "requirements_id": Requirement
        })
        
        # Required fields
        encounter.slug = data["slug"]
        encounter.name = data["name"]
        encounter.encounter_type = data["encounter_type"]  # Already converted to enum
        
        # Optional fields
        encounter.description = data.get("description")
        encounter.requirements_id = data.get("requirements_id")
        
        # Validate enemy IDs
        enemy_ids = data.get("enemy_ids", [])
        for enemy_id in enemy_ids:
            if not db_session.get(Enemy, enemy_id):
                raise ValueError(f"Invalid enemy_id: {enemy_id}")
        encounter.enemy_ids = enemy_ids
        
        # Validate NPC IDs
        npc_ids = data.get("npc_ids", [])
        for npc_id in npc_ids:
            if not db_session.get(NPC, npc_id):
                raise ValueError(f"Invalid npc_id: {npc_id}")
        encounter.npc_ids = npc_ids
        
        # Validate rewards
        rewards = data.get("rewards", {})
        if not isinstance(rewards, dict):
            raise ValueError("Rewards must be provided as an object")
        if "flags_set" in rewards:
            for flag_id in rewards["flags_set"]:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id in rewards: {flag_id}")
        currencies = rewards.get("currencies", [])
        for entry in currencies:
            if not isinstance(entry, dict):
                raise ValueError("Currency rewards must be objects")
            currency_id = entry.get("currency_id")
            if currency_id and not db_session.get(Currency, currency_id):
                raise ValueError(f"Invalid currency_id in rewards: {currency_id}")
        reputation = rewards.get("reputation", [])
        for entry in reputation:
            if not isinstance(entry, dict):
                raise ValueError("Reputation rewards must be objects")
            faction_id = entry.get("faction_id")
            if faction_id and not db_session.get(Faction, faction_id):
                raise ValueError(f"Invalid faction_id in rewards: {faction_id}")
        rewards["currencies"] = currencies
        rewards["reputation"] = reputation
        
        encounter.rewards = rewards
        encounter.tags = data.get("tags", [])
        
    def serialize_item(self, encounter: Encounter) -> Dict[str, Any]:
        return self.serialize_model(encounter)
    
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
bp = EncounterRoute().bp
