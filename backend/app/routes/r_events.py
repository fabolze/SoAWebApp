from flask import Blueprint, request, jsonify, abort
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_locations import Location
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_flags import Flag
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.init_db import get_db_session

class EventRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Event,
            blueprint_name='events',
            route_prefix='/api/events'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["event_id", "title", "type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["event_id"]
        
    def process_input_data(self, db_session: Session, event: Event, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": EventType
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "requirements_id": Requirement,
            "location_id": Location,
            "lore_id": LoreEntry,
            "dialogue_id": Dialogue,
            "encounter_id": Encounter,
            "next_event_id": Event
        })
        
        # Required fields
        event.title = data["title"]
        event.type = data["type"]  # Already converted to enum
        
        # Relationship fields
        event.requirements_id = data.get("requirements_id")
        event.location_id = data.get("location_id")
        event.lore_id = data.get("lore_id")
        event.dialogue_id = data.get("dialogue_id")
        event.encounter_id = data.get("encounter_id")
        event.next_event_id = data.get("next_event_id")
        
        # Validate flags if present
        flags_set = data.get("flags_set", [])
        for flag_id in flags_set:
            if not db_session.get(Flag, flag_id):
                raise ValueError(f"Invalid flag_id: {flag_id}")
        event.flags_set = flags_set
        
        # JSON fields
        event.item_rewards = data.get("item_rewards", [])
        event.xp_reward = data.get("xp_reward")
        
    def serialize_item(self, event: Event) -> Dict[str, Any]:
        return {
            "id": event.id,
            "title": event.title,
            "type": event.type.value if event.type else None,
            "requirements_id": event.requirements_id,
            "location_id": event.location_id,
            "lore_id": event.lore_id,
            "dialogue_id": event.dialogue_id,
            "encounter_id": event.encounter_id,
            "item_rewards": event.item_rewards,
            "xp_reward": event.xp_reward,
            "flags_set": event.flags_set,
            "next_event_id": event.next_event_id
        }
    
    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.title.ilike(f"%{search}%")) |
                    (self.model.id.ilike(f"%{search}%"))
                )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = EventRoute().bp
