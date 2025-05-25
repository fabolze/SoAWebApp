from flask import request, jsonify
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_npcs import NPC
from backend.app.models.m_locations import Location
from backend.app.models.m_requirements import Requirement
from backend.app.db.init_db import get_db_session
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class DialogueRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Dialogue,
            blueprint_name='dialogues',
            route_prefix='/api/dialogues'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["dialogue_id", "title"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["dialogue_id"]
    
    def process_input_data(self, db_session: Session, dialogue: Dialogue, data: Dict[str, Any]) -> None:
        # Required fields
        dialogue.title = data["title"]
        
        # Optional fields
        dialogue.description = data.get("description")
        
        # Relationship validation
        self.validate_relationships(db_session, data, {
            "npc_id": NPC,
            "location_id": Location,
            "requirements_id": Requirement
        })
        
        # Optional relationships
        dialogue.npc_id = data.get("npc_id")
        dialogue.location_id = data.get("location_id")
        dialogue.requirements_id = data.get("requirements_id")
        
        # JSON fields
        dialogue.tags = data.get("tags", [])

    def serialize_item(self, dialogue: Dialogue) -> Dict[str, Any]:
        return {
            "id": dialogue.id,
            "title": dialogue.title,
            "description": dialogue.description,
            "npc_id": dialogue.npc_id,
            "location_id": dialogue.location_id,
            "requirements_id": dialogue.requirements_id,
            "tags": dialogue.tags
        }
    
    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.title.ilike(f"%{search}%")) |
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
bp = DialogueRoute().bp
