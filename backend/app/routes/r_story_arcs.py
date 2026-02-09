from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_story_arcs import StoryArc, ArcType
from backend.app.models.m_content_packs import ContentPack
from backend.app.models.m_flags import Flag
from backend.app.models.m_timelines import Timeline
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class StoryArcRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=StoryArc,
            blueprint_name='story_arcs',
            route_prefix='/api/story-arcs'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "title", "summary", "type", "content_pack_id", "related_quests"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, story_arc: StoryArc, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": ArcType
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "timeline_id": Timeline,
            "content_pack_id": ContentPack
        })
        
        # Required fields
        story_arc.slug = data["slug"]
        story_arc.title = data["title"]
        story_arc.summary = data["summary"]
        story_arc.type = data["type"]  # Already converted to enum
        story_arc.content_pack_id = data["content_pack_id"]
        
        # Optional relationship
        story_arc.timeline_id = data.get("timeline_id")
        
        # Validate flags if present
        if "required_flags" in data:
            for flag_id in data["required_flags"]:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id: {flag_id}")
        
        # JSON fields
        story_arc.related_quests = data.get("related_quests", [])
        story_arc.branching = data.get("branching", [])
        story_arc.required_flags = data.get("required_flags", [])
        story_arc.tags = data.get("tags", [])

    def serialize_item(self, story_arc: StoryArc) -> Dict[str, Any]:
        return self.serialize_model(story_arc)

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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = StoryArcRoute().bp

