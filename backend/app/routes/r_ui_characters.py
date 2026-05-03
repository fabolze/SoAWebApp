from flask import Blueprint, abort, jsonify

from backend.app.db.init_db import get_db_session
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_interaction_profiles import InteractionProfile


bp = Blueprint("ui_characters", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _compact_model(model):
    if not model:
        return None
    return {
        "id": getattr(model, "id", None),
        "slug": getattr(model, "slug", None),
        "name": getattr(model, "name", None),
        "title": getattr(model, "title", None),
        "role": _enum_value(getattr(model, "role", None)),
        "biome": _enum_value(getattr(model, "biome", None)),
        "region": getattr(model, "region", None),
        "description": getattr(model, "description", None),
        "tags": getattr(model, "tags", None) or [],
    }


def _serialize_character(character: Character):
    return {
        "id": character.id,
        "slug": character.slug,
        "name": character.name,
        "title": character.title,
        "description": character.description,
        "image_path": character.image_path,
        "level": character.level,
        "class_id": character.class_id,
        "faction_id": character.faction_id,
        "home_location_id": character.home_location_id,
        "tags": character.tags or [],
        "class_template": _compact_model(character.class_template),
        "faction": _compact_model(character.faction),
        "home_location": _compact_model(character.home_location),
    }


def _serialize_combat_profile(profile: CombatProfile | None):
    if not profile:
        return None
    return {
        "id": profile.id,
        "character_id": profile.character_id,
        "enemy_type": _enum_value(profile.enemy_type),
        "aggression": _enum_value(profile.aggression),
        "custom_stats": profile.custom_stats or [],
        "custom_abilities": profile.custom_abilities or [],
        "loot_table": profile.loot_table or [],
        "currency_rewards": profile.currency_rewards or [],
        "reputation_rewards": profile.reputation_rewards or [],
        "xp_reward": profile.xp_reward,
        "related_quests": profile.related_quests or [],
        "companion_config": profile.companion_config or {},
        "tags": profile.tags or [],
    }


def _serialize_interaction_profile(profile: InteractionProfile | None):
    if not profile:
        return None
    return {
        "id": profile.id,
        "character_id": profile.character_id,
        "role": _enum_value(profile.role),
        "dialogue_tree_id": profile.dialogue_tree_id,
        "available_quests": profile.available_quests or [],
        "inventory": profile.inventory or [],
        "flags_set_on_interaction": profile.flags_set_on_interaction or [],
        "tags": profile.tags or [],
    }


@bp.route("/api/ui/characters/<character_id>", methods=["GET"])
def get_character_authoring_view(character_id: str):
    db_session = get_db_session()
    try:
        character = db_session.get(Character, character_id)
        if not character:
            abort(404, description=f"Character {character_id} not found")

        combat_profile = db_session.query(CombatProfile).filter_by(character_id=character_id).first()
        interaction_profile = db_session.query(InteractionProfile).filter_by(character_id=character_id).first()

        return jsonify({
            "character": _serialize_character(character),
            "combat_profile": _serialize_combat_profile(combat_profile),
            "interaction_profile": _serialize_interaction_profile(interaction_profile),
        })
    finally:
        db_session.close()
