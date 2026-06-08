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
        def _require_list(value: Any, field_name: str) -> List[Any]:
            if value is None:
                return []
            if not isinstance(value, list):
                raise ValueError(f"{field_name} must be an array")
            return value

        def _validate_number(value: Any, field_name: str) -> None:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{field_name} must be a number")

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
        profile.dialogue_tree_id = data.get("dialogue_tree_id") or None

        # Validate quests
        available_quests = _require_list(data.get("available_quests", []), "available_quests")
        for quest_id in available_quests:
            if not db_session.get(Quest, quest_id):
                raise ValueError(f"Invalid quest_id: {quest_id}")

        # Validate inventory items
        inventory = _require_list(data.get("inventory", []), "inventory")
        for item in inventory:
            if not isinstance(item, dict):
                raise ValueError("inventory entries must be objects")
            item_id = item.get("item_id")
            if not item_id or item.get("price") is None:
                raise ValueError("inventory entries must include item_id and price")
            _validate_number(item.get("price"), "inventory.price")
            if not db_session.get(Item, item_id):
                raise ValueError(f"Invalid item_id in inventory: {item_id}")

        # Validate flags
        flags_set_on_interaction = _require_list(data.get("flags_set_on_interaction", []), "flags_set_on_interaction")
        for flag_id in flags_set_on_interaction:
            if not db_session.get(Flag, flag_id):
                raise ValueError(f"Invalid flag_id: {flag_id}")
        tags = _require_list(data.get("tags", []), "tags")

        # JSON fields
        profile.available_quests = available_quests
        profile.inventory = inventory
        profile.flags_set_on_interaction = flags_set_on_interaction
        profile.tags = tags

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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()


route = InteractionProfileRoute()
bp = route.bp

