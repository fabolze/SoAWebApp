from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_abilities import Ability, AbilityType, Targeting, TriggerCondition, DamageTypeSource
from backend.app.models.m_abilities_links import AbilityEffectLink, AbilityScalingLink, AbilityEffectPhase
from backend.app.models.m_effects import Effect
from backend.app.models.m_effects import EffectType
from backend.app.models.m_items import DamageType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_stats import Stat
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
            "trigger_condition": TriggerCondition,
            "damage_type_source": DamageTypeSource,
            "damage_type": DamageType,
        })

        self.validate_relationships(db_session, data, {
            "requirements_id": Requirement,
        })
        
        # Required fields
        ability.slug = data["slug"]
        ability.name = data["name"]
        ability.type = data["type"]  # Already converted to enum
        
        # Optional fields
        ability.icon_path = data.get("icon_path")
        ability.description = data.get("description")
        ability.resource_cost = data.get("resource_cost")
        ability.cooldown = data.get("cooldown")
        ability.cast_time = data.get("cast_time", 0)
        ability.recovery_time = data.get("recovery_time", 0)
        ability.upkeep_cost = data.get("upkeep_cost", 0)
        ability.max_targets = data.get("max_targets")
        ability.targeting = data.get("targeting")  # Already converted to enum if present
        ability.trigger_condition = data.get("trigger_condition")  # Already converted to enum if present
        ability.requirements_id = data.get("requirements_id")
        ability.design_intent = data.get("design_intent")
        ability.counterplay_notes = data.get("counterplay_notes")
        ability.mastery_notes = data.get("mastery_notes")
        ability.presentation_notes = data.get("presentation_notes")
        ability.tags = data.get("tags", [])

        damage_type_source = data.get("damage_type_source") or DamageTypeSource.None_
        ability.damage_type_source = damage_type_source
        if damage_type_source == DamageTypeSource.Fixed:
            if not data.get("damage_type"):
                raise ValueError("damage_type is required when damage_type_source is Fixed")
            ability.damage_type = data.get("damage_type")
        else:
            ability.damage_type = None
        
        # Clear and reset effect links
        ability.effects.clear()
        effect_links = data.get("effect_links")
        if effect_links is None:
            effect_links = [{"effect_id": effect_id} for effect_id in data.get("effects", [])]
        if not isinstance(effect_links, list):
            raise ValueError("effect_links must be an array")
        for index, entry in enumerate(effect_links):
            if not isinstance(entry, dict) or not entry.get("effect_id"):
                raise ValueError("effect_links entries must include effect_id")
            effect_id = entry["effect_id"]
            # Validate effect exists
            effect = db_session.get(Effect, effect_id)
            if not effect:
                raise ValueError(f"Invalid effect_id: {effect_id}")
            if (
                damage_type_source == DamageTypeSource.None_
                and effect.type == EffectType.Damage
                and not effect.damage_type
            ):
                raise ValueError("Damage effects need their own damage_type or an ability damage_type_source")
            phase_value = entry.get("phase", "Impact")
            try:
                phase = AbilityEffectPhase(phase_value)
            except ValueError as exc:
                raise ValueError(f"Invalid effect link phase: {phase_value}") from exc
            turn_offset = float(entry.get("turn_offset", 0) or 0)
            if turn_offset < 0:
                raise ValueError("effect link turn_offset must be >= 0")
            link = AbilityEffectLink(
                effect_id=effect_id,
                phase=phase,
                turn_offset=turn_offset,
                sort_order=int(entry.get("sort_order", index) or 0),
            )
            link.ability = ability
            db_session.add(link)
        
        # Clear and reset scaling
        ability.scaling.clear()
        for entry in data.get("scaling", []):
            if not all(k in entry for k in ["stat_id", "multiplier"]):
                raise ValueError("Invalid scaling entry: missing stat_id or multiplier")
            stat_id = entry["stat_id"]
            if not db_session.get(Stat, stat_id):
                raise ValueError(f"Invalid stat_id: {stat_id}")
            link = AbilityScalingLink(
                stat_id=stat_id,
                multiplier=float(entry["multiplier"])
            )
            link.ability = ability
            db_session.add(link)
    
    def serialize_item(self, ability: Ability) -> Dict[str, Any]:
        data = {
            "id": ability.id,
            "slug": ability.slug,
            "name": ability.name,
            "type": ability.type.value if ability.type else None,
            "icon_path": ability.icon_path,
            "description": ability.description,
            "resource_cost": ability.resource_cost,
            "cooldown": ability.cooldown,
            "cast_time": ability.cast_time,
            "recovery_time": ability.recovery_time,
            "upkeep_cost": ability.upkeep_cost,
            "max_targets": ability.max_targets,
            "targeting": ability.targeting.value if ability.targeting else None,
            "trigger_condition": ability.trigger_condition.value if ability.trigger_condition else None,
            "damage_type_source": ability.damage_type_source.value if ability.damage_type_source else None,
            "damage_type": ability.damage_type.value if ability.damage_type else None,
            "requirements": ability.legacy_requirements,
            "requirements_id": ability.requirements_id,
            "design_intent": ability.design_intent,
            "counterplay_notes": ability.counterplay_notes,
            "mastery_notes": ability.mastery_notes,
            "presentation_notes": ability.presentation_notes,
            "tags": ability.tags,
        }
        data["effects"] = [link.effect_id for link in (ability.effects or [])]
        data["effect_links"] = [
            {
                "id": link.id,
                "effect_id": link.effect_id,
                "phase": link.phase.value if link.phase else "Impact",
                "turn_offset": link.turn_offset or 0,
                "sort_order": link.sort_order or 0,
            }
            for link in sorted((ability.effects or []), key=lambda row: (row.sort_order or 0, row.id or ""))
        ]
        data["scaling"] = [
            {
                "stat_id": link.stat_id,
                "multiplier": link.multiplier,
            }
            for link in (ability.scaling or [])
        ]
        return data
    
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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
route = AbilityRoute()
bp = route.bp

