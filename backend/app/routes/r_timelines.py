from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_timelines import Timeline
from backend.app.models.m_story_arcs import StoryArc
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class TimelineRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Timeline,
            blueprint_name='timelines',
            route_prefix='/api/timelines'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, timeline: Timeline, data: Dict[str, Any]) -> None:
        # Required fields
        timeline.slug = data["slug"]
        timeline.name = data["name"]
        
        # Optional fields
        timeline.description = data.get("description")
        timeline.start_year = data.get("start_year")
        timeline.end_year = data.get("end_year")
        
        # Story Arc validation if provided
        if "story_arcs" in data:
            for arc_id in data["story_arcs"]:
                if not db_session.get(StoryArc, arc_id):
                    raise ValueError(f"Invalid story_arc_id: {arc_id}")
                    
        # JSON fields
        timeline.story_arcs = data.get("story_arcs", [])
        timeline.events_order = data.get("events_order", [])
        timeline.tags = data.get("tags", [])

    def serialize_item(self, timeline: Timeline) -> Dict[str, Any]:
        return self.serialize_model(timeline)

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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = TimelineRoute().bp

