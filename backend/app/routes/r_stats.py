from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_stats import Stat, StatCategory, ValueType, ScalingBehavior
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class StatRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Stat,
            blueprint_name='stats',
            route_prefix='/api/stats'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "category", "value_type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, stat: Stat, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "category": StatCategory,
            "value_type": ValueType,
            "scaling_behavior": ScalingBehavior
        })
        
        # Required fields
        stat.slug = data["slug"]
        stat.name = data["name"]
        stat.category = data["category"]  # Already converted to enum
        stat.value_type = data["value_type"]  # Already converted to enum
        
        # Optional fields
        stat.description = data.get("description")
        stat.default_value = data.get("default_value")
        stat.min_value = data.get("min_value")
        stat.max_value = data.get("max_value")
        stat.icon_path = data.get("icon_path")
        stat.scaling_behavior = data.get("scaling_behavior")  # Already converted to enum if present
        
        # JSON fields
        stat.applies_to = data.get("applies_to", [])
        stat.tags = data.get("tags", [])

    def serialize_item(self, stat: Stat) -> Dict[str, Any]:
        return self.serialize_model(stat)

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
bp = StatRoute().bp
