from flask import Blueprint, request, jsonify, abort
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_enemies import Enemy
from backend.app.models.m_flags import Flag
from backend.app.models.m_npcs import NPC
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class EncounterRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Encounter,
            blueprint_name='encounters',
            route_prefix='/api/encounters'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["encounter_id", "name", "encounter_type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["encounter_id"]
        
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
        if "flags_set" in rewards:
            for flag_id in rewards["flags_set"]:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id in rewards: {flag_id}")
        
        encounter.rewards = rewards
        encounter.tags = data.get("tags", [])
        
    def serialize_item(self, encounter: Encounter) -> Dict[str, Any]:
        return {
            "id": encounter.id,
            "name": encounter.name,
            "description": encounter.description,
            "encounter_type": encounter.encounter_type.value if encounter.encounter_type else None,
            "requirements_id": encounter.requirements_id,
            "enemy_ids": encounter.enemy_ids,
            "npc_ids": encounter.npc_ids,
            "rewards": encounter.rewards,
            "tags": encounter.tags
        }

# Create the route instance
bp = EncounterRoute().bp
