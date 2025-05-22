from flask import request, jsonify
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import StoryArc
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_items import Item
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
        return ["quest_id", "title", "description"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["quest_id"]
    
    def process_input_data(self, db_session: Session, quest: Quest, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "story_arc_id": StoryArc,
            "requirements_id": Requirement
        })
        
        # Required fields
        quest.title = data["title"]
        quest.description = data["description"]
        
        # Optional relationships
        quest.story_arc_id = data.get("story_arc_id")
        quest.requirements_id = data.get("requirements_id")
        
        # Validate objectives and their requirements
        objectives = data.get("objectives", [])
        for objective in objectives:
            if "requirements" in objective:
                if not db_session.get(Requirement, objective["requirements"]):
                    raise ValueError(f"Invalid requirements_id in objective: {objective['requirements']}")
        quest.objectives = objectives
        
        # Validate item rewards
        item_rewards = data.get("item_rewards", [])
        for reward in item_rewards:
            if not db_session.get(Item, reward["item_id"]):
                raise ValueError(f"Invalid item_id in rewards: {reward['item_id']}")
        quest.item_rewards = item_rewards
        
        # Other fields
        quest.flags_set_on_completion = data.get("flags_set_on_completion", [])
        quest.xp_reward = data.get("xp_reward")
        quest.tags = data.get("tags", [])

    def serialize_item(self, quest: Quest) -> Dict[str, Any]:
        return {
            "id": quest.id,
            "title": quest.title,
            "description": quest.description,
            "story_arc_id": quest.story_arc_id,
            "requirements_id": quest.requirements_id,
            "objectives": quest.objectives,
            "flags_set_on_completion": quest.flags_set_on_completion,
            "xp_reward": quest.xp_reward,
            "item_rewards": quest.item_rewards,
            "tags": quest.tags
        }

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
bp = QuestRoute().bp
