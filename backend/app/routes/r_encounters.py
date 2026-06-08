from flask import Blueprint, request, jsonify, abort
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_flags import Flag
from backend.app.models.m_currencies import Currency
from backend.app.models.m_factions import Faction
from backend.app.models.m_items import Item
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.init_db import get_db_session

class EncounterRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Encounter,
            blueprint_name='encounters',
            route_prefix='/api/encounters'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "encounter_type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, encounter: Encounter, data: Dict[str, Any]) -> None:
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
            "encounter_type": EncounterType
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "requirements_id": Requirement
        })
        
        # Required fields
        encounter.slug = data["slug"]
        encounter.name = data["name"]
        encounter.encounter_type = data["encounter_type"]  # Already converted to enum
        
        # Optional fields
        encounter.description = data.get("description")
        encounter.requirements_id = data.get("requirements_id") or None
        
        # Validate participants
        participants = _require_list(data.get("participants", []), "participants")
        allowed_contexts = {"Combat", "Interaction"}
        allowed_sides = {"Hostile", "Friendly", "Neutral"}
        for entry in participants:
            if not isinstance(entry, dict):
                raise ValueError("Participant entries must be objects")
            character_id = entry.get("character_id")
            if not character_id or not db_session.get(Character, character_id):
                raise ValueError(f"Invalid character_id: {character_id}")
            contexts = entry.get("contexts", [])
            if not isinstance(contexts, list):
                raise ValueError("Participant contexts must be a list")
            for context in contexts:
                if context not in allowed_contexts:
                    raise ValueError(f"Invalid participant context: {context}")
            combat_side = entry.get("combat_side")
            if combat_side and combat_side not in allowed_sides:
                raise ValueError(f"Invalid combat_side: {combat_side}")
            if "Combat" in contexts:
                profile = db_session.query(CombatProfile).filter_by(character_id=character_id).first()
                if not profile:
                    raise ValueError(f"Combat context requires combat profile for character_id: {character_id}")
            if "Interaction" in contexts:
                profile = db_session.query(InteractionProfile).filter_by(character_id=character_id).first()
                if not profile:
                    raise ValueError(f"Interaction context requires interaction profile for character_id: {character_id}")
        encounter.participants = participants
        
        # Validate rewards
        rewards = data.get("rewards", {})
        if not isinstance(rewards, dict):
            raise ValueError("Rewards must be provided as an object")
        if rewards.get("xp") is not None:
            _validate_number(rewards.get("xp"), "rewards.xp")
        flags_set = _require_list(rewards.get("flags_set", []), "rewards.flags_set")
        for flag_id in flags_set:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id in rewards: {flag_id}")
        items = _require_list(rewards.get("items", []), "rewards.items")
        for entry in items:
            if not isinstance(entry, dict):
                raise ValueError("Item rewards must be objects")
            item_id = entry.get("item_id")
            if not item_id or entry.get("quantity") is None:
                raise ValueError("Item rewards must include item_id and quantity")
            _validate_number(entry.get("quantity"), "rewards.items.quantity")
            if not db_session.get(Item, item_id):
                raise ValueError(f"Invalid item_id in rewards: {item_id}")
        currencies = _require_list(rewards.get("currencies", []), "rewards.currencies")
        for entry in currencies:
            if not isinstance(entry, dict):
                raise ValueError("Currency rewards must be objects")
            currency_id = entry.get("currency_id")
            if not currency_id or entry.get("amount") is None:
                raise ValueError("Currency rewards must include currency_id and amount")
            _validate_number(entry.get("amount"), "rewards.currencies.amount")
            if not db_session.get(Currency, currency_id):
                raise ValueError(f"Invalid currency_id in rewards: {currency_id}")
        reputation = _require_list(rewards.get("reputation", []), "rewards.reputation")
        for entry in reputation:
            if not isinstance(entry, dict):
                raise ValueError("Reputation rewards must be objects")
            faction_id = entry.get("faction_id")
            if not faction_id or entry.get("amount") is None:
                raise ValueError("Reputation rewards must include faction_id and amount")
            _validate_number(entry.get("amount"), "rewards.reputation.amount")
            if not db_session.get(Faction, faction_id):
                raise ValueError(f"Invalid faction_id in rewards: {faction_id}")
        rewards["currencies"] = currencies
        rewards["reputation"] = reputation
        rewards["items"] = items
        rewards["flags_set"] = flags_set
        
        encounter.rewards = rewards
        encounter.tags = _require_list(data.get("tags", []), "tags")
        
    def serialize_item(self, encounter: Encounter) -> Dict[str, Any]:
        return self.serialize_model(encounter)
    
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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
route = EncounterRoute()
bp = route.bp

