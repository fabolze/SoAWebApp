from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_abilities import Ability
from backend.app.models.m_abilities_links import (
    AbilityEffectLink,
    AbilityEffectPhase,
    AbilityRelation,
    AbilityRelationType,
)
from backend.app.models.m_effects import Effect
from backend.app.routes.base_route import BaseRoute


class AbilityEffectLinkRoute(BaseRoute):
    def __init__(self):
        super().__init__(AbilityEffectLink, "ability_effect_links", "/api/ability-effect-links")

    def get_required_fields(self) -> List[str]:
        return ["id", "ability_id", "effect_id"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, link: AbilityEffectLink, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {"phase": AbilityEffectPhase})
        self.validate_relationships(db_session, data, {"ability_id": Ability, "effect_id": Effect})
        link.ability_id = data["ability_id"]
        link.effect_id = data["effect_id"]
        link.phase = data.get("phase") or AbilityEffectPhase.Impact
        link.turn_offset = float(data.get("turn_offset", 0) or 0)
        link.sort_order = int(data.get("sort_order", 0) or 0)
        if link.turn_offset < 0:
            raise ValueError("turn_offset must be >= 0")

    def serialize_item(self, link: AbilityEffectLink) -> Dict[str, Any]:
        return self.serialize_model(link)


class AbilityRelationRoute(BaseRoute):
    def __init__(self):
        super().__init__(AbilityRelation, "ability_relations", "/api/ability-relations")

    def get_required_fields(self) -> List[str]:
        return ["id", "from_ability_id", "to_ability_id", "relation_type"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, relation: AbilityRelation, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {"relation_type": AbilityRelationType})
        self.validate_relationships(
            db_session,
            data,
            {"from_ability_id": Ability, "to_ability_id": Ability},
        )
        if data["from_ability_id"] == data["to_ability_id"]:
            raise ValueError("Ability relations cannot link an ability to itself")
        relation.from_ability_id = data["from_ability_id"]
        relation.to_ability_id = data["to_ability_id"]
        relation.relation_type = data["relation_type"]

    def serialize_item(self, relation: AbilityRelation) -> Dict[str, Any]:
        return self.serialize_model(relation)


effect_link_route = AbilityEffectLinkRoute()
relation_route = AbilityRelationRoute()
effect_links_bp = effect_link_route.bp
relations_bp = relation_route.bp
