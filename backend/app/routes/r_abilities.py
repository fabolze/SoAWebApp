from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_abilities import Ability, AbilityType, Targeting, TriggerCondition
from backend.app.models.m_abilities_links import AbilityEffectLink, AbilityScalingLink
from backend.app.models.m_effects import Effect
from backend.app.db.init_db import get_db_session
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify


class AbilityRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Ability,
            blueprint_name='abilities',
            route_prefix='/api/abilities'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "name", "type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, ability: Ability, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": AbilityType,
            "targeting": Targeting,
            "trigger_condition": TriggerCondition
        })
        
        # Required fields
        ability.name = data["name"]
        ability.type = data["type"]  # Already converted to enum
        
        # Optional fields
        ability.icon_path = data.get("icon_path")
        ability.description = data.get("description")
        ability.resource_cost = data.get("resource_cost")
        ability.cooldown = data.get("cooldown")
        ability.targeting = data.get("targeting")  # Already converted to enum if present
        ability.trigger_condition = data.get("trigger_condition")  # Already converted to enum if present
        ability.requirements = data.get("requirements", {})
        
        # Clear and reset effect links
        ability.effects.clear()
        for effect_id in data.get("effects", []):
            # Validate effect exists
            if not db_session.get(Effect, effect_id):
                raise ValueError(f"Invalid effect_id: {effect_id}")
            link = AbilityEffectLink(effect_id=effect_id)
            link.ability = ability
            db_session.add(link)
        
        # Clear and reset scaling
        ability.scaling.clear()
        for entry in data.get("scaling", []):
            if not all(k in entry for k in ["attribute_id", "multiplier"]):
                raise ValueError("Invalid scaling entry: missing attribute_id or multiplier")
            link = AbilityScalingLink(
                attribute_id=entry["attribute_id"],
                multiplier=float(entry["multiplier"])
            )
            link.ability = ability
            db_session.add(link)
    
    def serialize_item(self, ability: Ability) -> Dict[str, Any]:
        # Convert linked objects to their IDs for JSON response
        effects = [link.effect_id for link in ability.effects]
        scaling = [{
            "attribute_id": link.attribute_id,
            "multiplier": link.multiplier
        } for link in ability.scaling]
        
        return {
            "id": ability.id,
            "name": ability.name,
            "type": ability.type.value if ability.type else None,
            "icon_path": ability.icon_path,
            "description": ability.description,
            "resource_cost": ability.resource_cost,
            "cooldown": ability.cooldown,
            "targeting": ability.targeting.value if ability.targeting else None,
            "trigger_condition": ability.trigger_condition.value if ability.trigger_condition else None,
            "requirements": ability.requirements,
            "effects": effects,
            "scaling": scaling
        }
    
    def get_all(self):
        """Get all abilities, with optional search and tag filtering."""
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
bp = AbilityRoute().bp
