# backend/app/routes/r_combat_profiles.py
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_combat_profiles import CombatProfile, EnemyType, Aggression
from backend.app.models.m_characters import Character
from backend.app.models.m_currencies import Currency
from backend.app.models.m_factions import Faction
from backend.app.models.m_items import Item
from backend.app.models.m_quests import Quest
from backend.app.models.m_abilities import Ability
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_stats import Stat
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class CombatProfileRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=CombatProfile,
            blueprint_name="combat_profiles",
            route_prefix="/api/combat_profiles"
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "character_id"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, profile: CombatProfile, data: Dict[str, Any]) -> None:
        def _normalize_stat_entries(entries: Any, field_name: str) -> List[Dict[str, Any]]:
            if entries is None:
                return []
            if isinstance(entries, dict):
                normalized: List[Dict[str, Any]] = []
                for key, value in entries.items():
                    if value is None:
                        raise ValueError(f"{field_name} entries must include value")
                    stat = db_session.get(Stat, key)
                    if not stat:
                        stat = db_session.query(Stat).filter(Stat.slug == key).first()
                    if not stat:
                        raise ValueError(f"Invalid stat reference in {field_name}: {key}")
                    normalized.append({"stat_id": stat.id, "value": value})
                return normalized
            if isinstance(entries, list):
                normalized = []
                for entry in entries:
                    if not isinstance(entry, dict):
                        raise ValueError(f"{field_name} entries must be objects")
                    stat_ref = entry.get("stat_id")
                    if stat_ref is None:
                        raise ValueError(f"{field_name} entries must include stat_id")
                    value = entry.get("value")
                    if value is None:
                        raise ValueError(f"{field_name} entries must include value")
                    stat = db_session.get(Stat, stat_ref)
                    if not stat:
                        stat = db_session.query(Stat).filter(Stat.slug == stat_ref).first()
                    if not stat:
                        raise ValueError(f"Invalid stat_id in {field_name}: {stat_ref}")
                    normalized.append({"stat_id": stat.id, "value": value})
                return normalized
            raise ValueError(f"{field_name} must be an array of stat entries")

        # Validate enums
        self.validate_enums(data, {
            "enemy_type": EnemyType,
            "aggression": Aggression
        })

        # Validate relationships
        self.validate_relationships(db_session, data, {
            "character_id": Character
        })

        # Required fields
        profile.character_id = data["character_id"]

        # Optional fields
        profile.enemy_type = data.get("enemy_type")
        profile.aggression = data.get("aggression")
        profile.xp_reward = data.get("xp_reward")
        companion_config = data.get("companion_config", {})
        if companion_config and not isinstance(companion_config, dict):
            raise ValueError("companion_config must be an object")
        if companion_config:
            companion_custom_stats = _normalize_stat_entries(
                companion_config.get("custom_stats", []),
                "companion_config.custom_stats"
            )
            if companion_custom_stats:
                companion_config["custom_stats"] = companion_custom_stats
            progression = companion_config.get("progression")
            if progression is not None and not isinstance(progression, dict):
                raise ValueError("companion_config.progression must be an object")
            if progression and isinstance(progression, dict):
                stat_growth = _normalize_stat_entries(
                    progression.get("stat_growth", []),
                    "companion_config.progression.stat_growth"
                )
                if stat_growth:
                    progression["stat_growth"] = stat_growth
                    companion_config["progression"] = progression
        profile.companion_config = companion_config
        if companion_config and "class_id" in companion_config:
            if not db_session.get(CharacterClass, companion_config["class_id"]):
                raise ValueError(f"Invalid class_id in companion_config: {companion_config['class_id']}")

        # Validate character combat readiness
        character = db_session.get(Character, profile.character_id)
        if character:
            has_core_combat = character.class_id is not None and character.level is not None
            has_companion_override = bool(companion_config.get("class_id") and companion_config.get("level") is not None)
            if not has_core_combat and not has_companion_override:
                raise ValueError("Combat profile requires character class_id and level or companion_config overrides")

        # Validate ability references
        custom_abilities = data.get("custom_abilities", [])
        for ability_id in custom_abilities:
            if not db_session.get(Ability, ability_id):
                raise ValueError(f"Invalid ability_id: {ability_id}")

        # Validate loot entries
        loot_table = data.get("loot_table", [])
        for entry in loot_table:
            if not isinstance(entry, dict):
                raise ValueError("Loot entries must be objects")
            item_id = entry.get("item_id")
            if item_id and not db_session.get(Item, item_id):
                raise ValueError(f"Invalid item_id in loot_table: {item_id}")

        # Validate currency rewards
        currency_rewards = data.get("currency_rewards", [])
        for entry in currency_rewards:
            if not isinstance(entry, dict):
                raise ValueError("Currency rewards must be objects")
            currency_id = entry.get("currency_id")
            if currency_id and not db_session.get(Currency, currency_id):
                raise ValueError(f"Invalid currency_id in rewards: {currency_id}")

        # Validate reputation rewards
        reputation_rewards = data.get("reputation_rewards", [])
        for entry in reputation_rewards:
            if not isinstance(entry, dict):
                raise ValueError("Reputation rewards must be objects")
            faction_id = entry.get("faction_id")
            if faction_id and not db_session.get(Faction, faction_id):
                raise ValueError(f"Invalid faction_id in rewards: {faction_id}")

        # Validate related quests
        related_quests = data.get("related_quests", [])
        for quest_id in related_quests:
            if not db_session.get(Quest, quest_id):
                raise ValueError(f"Invalid quest_id: {quest_id}")

        # JSON fields
        profile.custom_stats = _normalize_stat_entries(data.get("custom_stats", []), "custom_stats")
        profile.custom_abilities = custom_abilities
        profile.tags = data.get("tags", [])
        profile.loot_table = loot_table
        profile.currency_rewards = currency_rewards
        profile.reputation_rewards = reputation_rewards
        profile.related_quests = related_quests

    def serialize_item(self, profile: CombatProfile) -> Dict[str, Any]:
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


bp = CombatProfileRoute().bp

