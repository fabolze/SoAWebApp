from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_effects import Effect, EffectType, EffectTarget, ValueInterpretation, TriggerCondition
from backend.app.models.m_attributes import Attribute
from backend.app.models.m_stats import Stat
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class EffectRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Effect,
            blueprint_name='effects',
            route_prefix='/api/effects'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["effect_id", "name", "type", "target"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["effect_id"]
        
    def process_input_data(self, db_session: Session, effect: Effect, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": EffectType,
            "target": EffectTarget,
            "value_type": ValueInterpretation,
            "trigger_condition": TriggerCondition
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "attribute_id": Attribute,
            "scaling_stat_id": Stat
        })
        
        # Required fields
        effect.name = data["name"]
        effect.type = data["type"]  # Already converted to enum
        effect.target = data["target"]  # Already converted to enum
        
        # Optional fields
        effect.description = data.get("description")
        effect.duration = data.get("duration")
        effect.value_type = data.get("value_type")  # Already converted to enum if present
        effect.value = data.get("value")
        effect.trigger_condition = data.get("trigger_condition")  # Already converted to enum if present
        effect.stackable = data.get("stackable", False)
        effect.set_bonus_group = data.get("set_bonus_group")
        effect.icon_path = data.get("icon_path")
        
        # Relationship fields
        effect.attribute_id = data.get("attribute_id")
        effect.scaling_stat_id = data.get("scaling_stat_id")
        
        # JSON fields
        effect.related_items = data.get("related_items", {})
        
    def serialize_item(self, effect: Effect) -> Dict[str, Any]:
        return {
            "id": effect.id,
            "name": effect.name,
            "type": effect.type.value if effect.type else None,
            "description": effect.description,
            "target": effect.target.value if effect.target else None,
            "duration": effect.duration,
            "value_type": effect.value_type.value if effect.value_type else None,
            "value": effect.value,
            "attribute_id": effect.attribute_id,
            "scaling_stat_id": effect.scaling_stat_id,
            "trigger_condition": effect.trigger_condition.value if effect.trigger_condition else None,
            "stackable": effect.stackable,
            "set_bonus_group": effect.set_bonus_group,
            "icon_path": effect.icon_path,
            "related_items": effect.related_items
        }
        
    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%")) |
                    (self.model.id.ilike(f"%{search}%"))
                )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = EffectRoute().bp
