from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_attributes import Attribute, AttrValueType, AttrScalingType
from backend.app.models.m_stats import Stat
from backend.app.models.m_attribute_stat_link import AttributeStatLink
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class AttributeRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Attribute,
            blueprint_name='attributes',
            route_prefix='/api/attributes'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "name", "value_type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, attribute: Attribute, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "value_type": AttrValueType,
            "scaling": AttrScalingType
        })
        
        # Required fields
        attribute.slug = data["slug"]
        attribute.name = data["name"]
        attribute.value_type = data["value_type"]  # Already converted to enum
        
        # Optional fields
        attribute.description = data.get("description")
        attribute.default_value = data.get("default_value")
        attribute.min_value = data.get("min_value")
        attribute.max_value = data.get("max_value")
        attribute.scaling = data.get("scaling")  # Already converted to enum if present
        attribute.icon_path = data.get("icon_path")
        
        # JSON fields
        attribute.used_in = data.get("used_in", [])
        attribute.tags = data.get("tags", [])
        
        # Clear and reset scaling links
        attribute.scaling_links.clear()
        for entry in data.get("results_in", []):
            if not all(k in entry for k in ["stat_id", "scale", "multiplier"]):
                raise ValueError("Invalid scaling entry: missing stat_id, scale, or multiplier")
            
            # Validate stat exists
            if not db_session.get(Stat, entry["stat_id"]):
                raise ValueError(f"Invalid stat_id: {entry['stat_id']}")
            
            link = AttributeStatLink(
                stat_id=entry["stat_id"],
                scale_type=entry["scale"],
                multiplier=float(entry["multiplier"])
            )
            link.attribute = attribute
            db_session.add(link)
    
    def serialize_item(self, attribute: Attribute) -> Dict[str, Any]:
        return self.serialize_model(attribute)
    
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
bp = AttributeRoute().bp
