from flask import request, jsonify
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import StoryArc
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_items import Item
from backend.app.models.m_currencies import Currency
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.init_db import get_db_session

class QuestRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Quest,
            blueprint_name='quests',
            route_prefix='/api/quests'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "title", "description"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, quest: Quest, data: Dict[str, Any]) -> None:
        def _require_number(value: Any, field_name: str) -> None:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{field_name} must be a number")

        # Validate relationships
        self.validate_relationships(db_session, data, {
            "story_arc_id": StoryArc,
            "requirements_id": Requirement
        })
        
        # Required fields
        quest.slug = data["slug"]
        quest.title = data["title"]
        quest.description = data["description"]
        
        # Optional relationships
        quest.story_arc_id = data.get("story_arc_id")
        quest.requirements_id = data.get("requirements_id")
        
        # Validate objectives and their requirements
        objectives = data.get("objectives", [])
        if not isinstance(objectives, list):
            raise ValueError("objectives must be an array")
        normalized_objectives = []
        for objective in objectives:
            if not isinstance(objective, dict):
                raise ValueError("Objective entries must be objects")
            req_id = objective.get("requirements_id") or objective.get("requirements")
            if req_id and not db_session.get(Requirement, req_id):
                raise ValueError(f"Invalid requirements_id in objective: {req_id}")
            if req_id and "requirements_id" not in objective:
                objective = {**objective, "requirements_id": req_id}
                objective.pop("requirements", None)
            flags_set = objective.get("flags_set", [])
            if not isinstance(flags_set, list):
                raise ValueError("objective flags_set must be an array")
            for flag_id in flags_set:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id in objective: {flag_id}")
            normalized_objectives.append(objective)
        quest.objectives = normalized_objectives
        
        # Validate item rewards
        item_rewards = data.get("item_rewards", [])
        if not isinstance(item_rewards, list):
            raise ValueError("item_rewards must be an array")
        for reward in item_rewards:
            if not isinstance(reward, dict):
                raise ValueError("Item rewards must be objects")
            item_id = reward.get("item_id")
            if not item_id or reward.get("quantity") is None:
                raise ValueError("item_rewards entries must include item_id and quantity")
            _require_number(reward["quantity"], "item_rewards.quantity")
            if not db_session.get(Item, item_id):
                raise ValueError(f"Invalid item_id in rewards: {item_id}")
        quest.item_rewards = item_rewards
        
        currency_rewards = data.get("currency_rewards", [])
        for reward in currency_rewards:
            if not isinstance(reward, dict):
                raise ValueError("Currency rewards must be objects")
            currency_id = reward.get("currency_id")
            if not currency_id or reward.get("amount") is None:
                raise ValueError("currency_rewards entries must include currency_id and amount")
            _require_number(reward["amount"], "currency_rewards.amount")
            if not db_session.get(Currency, currency_id):
                raise ValueError(f"Invalid currency_id in rewards: {currency_id}")
        quest.currency_rewards = currency_rewards

        reputation_rewards = data.get("reputation_rewards", [])
        for reward in reputation_rewards:
            if not isinstance(reward, dict):
                raise ValueError("Reputation rewards must be objects")
            faction_id = reward.get("faction_id")
            if not faction_id or reward.get("amount") is None:
                raise ValueError("reputation_rewards entries must include faction_id and amount")
            _require_number(reward["amount"], "reputation_rewards.amount")
            if not db_session.get(Faction, faction_id):
                raise ValueError(f"Invalid faction_id in rewards: {faction_id}")
        quest.reputation_rewards = reputation_rewards

        # Other fields
        completion_flags = data.get("flags_set_on_completion", [])
        if not isinstance(completion_flags, list):
            raise ValueError("flags_set_on_completion must be an array")
        for flag_id in completion_flags:
            if not db_session.get(Flag, flag_id):
                raise ValueError(f"Invalid flag_id in flags_set_on_completion: {flag_id}")
        quest.flags_set_on_completion = completion_flags
        if data.get("xp_reward") is not None:
            _require_number(data["xp_reward"], "xp_reward")
        quest.xp_reward = data.get("xp_reward")
        quest.tags = data.get("tags", [])

    def serialize_item(self, quest: Quest) -> Dict[str, Any]:
        return self.serialize_model(quest)

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
bp = QuestRoute().bp

