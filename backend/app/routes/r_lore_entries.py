from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_locations import Location
from backend.app.models.m_timelines import Timeline
from backend.app.models.m_story_arcs import StoryArc
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class LoreEntryRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=LoreEntry,
            blueprint_name='lore_entries',
            route_prefix='/api/lore-entries'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "title", "text"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, entry: LoreEntry, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "location_id": Location,
            "timeline_id": Timeline
        })
        
        # Required fields
        entry.slug = data["slug"]
        entry.title = data["title"]
        entry.text = data["text"]
        
        # Optional relationships
        entry.location_id = data.get("location_id")
        entry.timeline_id = data.get("timeline_id")
        
        # Validate story arcs if present
        if "related_story_arcs" in data:
            for arc_id in data["related_story_arcs"]:
                if not db_session.get(StoryArc, arc_id):
                    raise ValueError(f"Invalid story_arc_id: {arc_id}")
        
        # JSON fields
        entry.related_story_arcs = data.get("related_story_arcs", [])
        entry.tags = data.get("tags", [])

    def serialize_item(self, entry: LoreEntry) -> Dict[str, Any]:
        return self.serialize_model(entry)

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
bp = LoreEntryRoute().bp
