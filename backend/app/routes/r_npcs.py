from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_npcs import NPC, NPCRole
from backend.app.models.m_factions import Faction
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_items import Item
from backend.app.models.m_flags import Flag
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class NPCRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=NPC,
            blueprint_name='npcs',
            route_prefix='/api/npcs'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, npc: NPC, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "role": NPCRole
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "location_id": Location,
            "faction_id": Faction,
            "dialogue_tree_id": Dialogue
        })
        
        # Required fields
        npc.slug = data["slug"]
        npc.name = data["name"]
        
        # Optional fields
        npc.title = data.get("title")
        npc.description = data.get("description")
        npc.image_path = data.get("image_path")
        npc.role = data.get("role")  # Already converted to enum if present
        
        # Optional relationships
        npc.location_id = data.get("location_id")
        npc.faction_id = data.get("faction_id")
        npc.dialogue_tree_id = data.get("dialogue_tree_id")
        
        # Validate quests
        if "available_quests" in data:
            for quest_id in data["available_quests"]:
                if not db_session.get(Quest, quest_id):
                    raise ValueError(f"Invalid quest_id: {quest_id}")
                    
        # Validate inventory items
        inventory = data.get("inventory", [])
        for item in inventory:
            if not db_session.get(Item, item["item_id"]):
                raise ValueError(f"Invalid item_id in inventory: {item['item_id']}")
                
        # Validate flags
        if "flags_set_on_interaction" in data:
            for flag_id in data["flags_set_on_interaction"]:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id: {flag_id}")
        
        # Validate companion config
        companion_config = data.get("companion_config", {})
        if companion_config and "class_id" in companion_config:
            if not db_session.get(CharacterClass, companion_config["class_id"]):
                raise ValueError(f"Invalid class_id in companion_config: {companion_config['class_id']}")
        
        # JSON fields
        npc.available_quests = data.get("available_quests", [])
        npc.inventory = inventory
        npc.flags_set_on_interaction = data.get("flags_set_on_interaction", [])
        npc.companion_config = companion_config
        npc.tags = data.get("tags", [])

    def serialize_item(self, npc: NPC) -> Dict[str, Any]:
        return self.serialize_model(npc)

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
bp = NPCRoute().bp
