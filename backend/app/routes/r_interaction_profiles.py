# backend/app/routes/r_interaction_profiles.py
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_interaction_profiles import InteractionProfile, InteractionRole
from backend.app.models.m_characters import Character
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_quests import Quest
from backend.app.models.m_items import Item
from backend.app.models.m_flags import Flag
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class InteractionProfileRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=InteractionProfile,
            blueprint_name="interaction_profiles",
            route_prefix="/api/interaction_profiles"
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "character_id"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, profile: InteractionProfile, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "role": InteractionRole
        })

        # Validate relationships
        self.validate_relationships(db_session, data, {
            "character_id": Character,
            "dialogue_tree_id": Dialogue
        })

        # Required fields
        profile.character_id = data["character_id"]

        # Optional fields
        profile.role = data.get("role")
        profile.dialogue_tree_id = data.get("dialogue_tree_id")

        # Validate quests
        available_quests = data.get("available_quests", [])
        for quest_id in available_quests:
            if not db_session.get(Quest, quest_id):
                raise ValueError(f"Invalid quest_id: {quest_id}")

        # Validate inventory items
        inventory = data.get("inventory", [])
        for item in inventory:
            item_id = item.get("item_id") if isinstance(item, dict) else None
            if item_id and not db_session.get(Item, item_id):
                raise ValueError(f"Invalid item_id in inventory: {item_id}")

        # Validate flags
        flags_set_on_interaction = data.get("flags_set_on_interaction", [])
        for flag_id in flags_set_on_interaction:
            if not db_session.get(Flag, flag_id):
                raise ValueError(f"Invalid flag_id: {flag_id}")

        # JSON fields
        profile.available_quests = available_quests
        profile.inventory = inventory
        profile.flags_set_on_interaction = flags_set_on_interaction
        profile.tags = data.get("tags", [])

    def serialize_item(self, profile: InteractionProfile) -> Dict[str, Any]:
        return self.serialize_model(profile)

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get("search", "").strip()
            tags = request.args.get("tags", "").strip().lower().split(",") if request.args.get("tags") else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.character_id.ilike(f"%{search}%")) |
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


bp = InteractionProfileRoute().bp
