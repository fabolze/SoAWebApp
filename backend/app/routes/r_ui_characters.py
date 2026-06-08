from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_shops import Shop
from backend.app.routes.r_characters import route as character_route
from backend.app.routes.r_combat_profiles import route as combat_profile_route
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_interaction_profiles import route as interaction_profile_route


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


def _serialize_encounter(encounter: Encounter):
    return {
        "id": encounter.id,
        "slug": encounter.slug,
        "name": encounter.name,
        "description": encounter.description,
        "encounter_type": _enum_value(encounter.encounter_type),
        "requirements_id": encounter.requirements_id,
        "participants": encounter.participants or [],
        "rewards": encounter.rewards or {},
        "tags": encounter.tags or [],
    }


def _character_packet(db_session, character: Character):
    combat_profile = db_session.query(CombatProfile).filter_by(character_id=character.id).first()
    interaction_profile = db_session.query(InteractionProfile).filter_by(character_id=character.id).first()
    encounters = db_session.query(Encounter).all()
    appearances = [
        _serialize_encounter(encounter)
        for encounter in encounters
        if any(
            isinstance(participant, dict) and participant.get("character_id") == character.id
            for participant in (encounter.participants or [])
        )
    ]
    dialogues = db_session.query(Dialogue).filter_by(character_id=character.id).all()
    shops = db_session.query(Shop).filter_by(character_id=character.id).all()
    return {
        "character": _serialize_character(character),
        "combat_profile": _serialize_combat_profile(combat_profile),
        "interaction_profile": _serialize_interaction_profile(interaction_profile),
        "world_presence": {
            "encounters": appearances,
            "dialogues": [_compact_model(dialogue) for dialogue in dialogues],
            "shops": [_compact_model(shop) for shop in shops],
        },
    }


def _upsert_with_route(db_session, route, model, data):
    item_id = route.get_id_from_data(data)
    item = db_session.get(model, item_id) or model(id=item_id)
    route.validate_required_fields(data, route.get_schema_required_fields(model.__name__.lower()))
    route.process_input_data(db_session, item, data)
    route._normalize_common_fields(item, data)
    db_session.add(item)
    db_session.flush()
    return item


def _require_list(data, key, owner):
    value = data.get(key, [])
    if not isinstance(value, list):
        abort(400, description=f"{owner}.{key} must be an array")


def _validate_bundle_shapes(character_data, combat_data, interaction_data):
    _require_list(character_data, "tags", "character")
    if combat_data is not None:
        for key in ["custom_stats", "custom_abilities", "loot_table", "currency_rewards", "reputation_rewards", "related_quests", "tags"]:
            _require_list(combat_data, key, "combat_profile")
        companion_config = combat_data.get("companion_config", {})
        if not isinstance(companion_config, dict):
            abort(400, description="combat_profile.companion_config must be an object")
        for key in ["custom_abilities", "custom_stats"]:
            _require_list(companion_config, key, "combat_profile.companion_config")
        progression = companion_config.get("progression", {})
        if progression is not None and not isinstance(progression, dict):
            abort(400, description="combat_profile.companion_config.progression must be an object")
        if isinstance(progression, dict):
            _require_list(progression, "stat_growth", "combat_profile.companion_config.progression")
    if interaction_data is not None:
        for key in ["available_quests", "inventory", "flags_set_on_interaction", "tags"]:
            _require_list(interaction_data, key, "interaction_profile")


def _validate_profile_ownership(db_session, model, data, character_id, label):
    if not data.get("id"):
        abort(400, description=f"{label}.id is required")
    existing_by_id = db_session.get(model, data["id"])
    if existing_by_id and existing_by_id.character_id != character_id:
        abort(400, description=f"{label}.id belongs to another character")
    existing_for_character = db_session.query(model).filter_by(character_id=character_id).first()
    if existing_for_character and existing_for_character.id != data["id"]:
        abort(400, description=f"character already has a different {label}")


@bp.route("/api/ui/characters/<character_id>", methods=["GET"])
def get_character_authoring_view(character_id: str):
    db_session = get_db_session()
    try:
        character = db_session.get(Character, character_id)
        if not character:
            abort(404, description=f"Character {character_id} not found")

        return jsonify(_character_packet(db_session, character))
    finally:
        db_session.close()


@bp.route("/api/ui/characters/bundle", methods=["POST"])
def save_character_authoring_bundle():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("character"), dict):
            abort(400, description="character bundle requires a character object")

        character_data = dict(payload["character"])
        character_id = character_data.get("id")
        if not character_id:
            abort(400, description="character.id is required")
        combat_data = payload.get("combat_profile")
        if combat_data is not None:
            if not isinstance(combat_data, dict):
                abort(400, description="combat_profile must be an object")
            combat_data = dict(combat_data)
            if combat_data.get("character_id") != character_id:
                abort(400, description="combat_profile.character_id must match character.id")

        interaction_data = payload.get("interaction_profile")
        if interaction_data is not None:
            if not isinstance(interaction_data, dict):
                abort(400, description="interaction_profile must be an object")
            interaction_data = dict(interaction_data)
            if interaction_data.get("character_id") != character_id:
                abort(400, description="interaction_profile.character_id must match character.id")

        _validate_bundle_shapes(character_data, combat_data, interaction_data)
        if combat_data is not None:
            _validate_profile_ownership(db_session, CombatProfile, combat_data, character_id, "combat_profile")
        if interaction_data is not None:
            _validate_profile_ownership(db_session, InteractionProfile, interaction_data, character_id, "interaction_profile")

        character = _upsert_with_route(db_session, character_route, Character, character_data)
        if combat_data is not None:
            _upsert_with_route(db_session, combat_profile_route, CombatProfile, combat_data)
        if interaction_data is not None:
            _upsert_with_route(db_session, interaction_profile_route, InteractionProfile, interaction_data)

        encounters = payload.get("encounters", [])
        if not isinstance(encounters, list):
            abort(400, description="encounters must be an array")
        for encounter_data in encounters:
            if not isinstance(encounter_data, dict):
                abort(400, description="encounter bundle entries must be objects")
            encounter_data = dict(encounter_data)
            encounter_id = encounter_data.get("id")
            if not encounter_id:
                abort(400, description="encounter.id is required")
            existing = db_session.get(Encounter, encounter_id)
            if existing:
                unexpected = set(encounter_data) - {"id", "participants"}
                if unexpected:
                    abort(400, description=f"existing encounter bundle entries may only change participants: {sorted(unexpected)}")
                previous_has_character = any(
                    isinstance(row, dict) and row.get("character_id") == character_id
                    for row in (existing.participants or [])
                )
                next_has_character = any(
                    isinstance(row, dict) and row.get("character_id") == character_id
                    for row in (encounter_data.get("participants") or [])
                )
                next_character_rows = [
                    row for row in (encounter_data.get("participants") or [])
                    if isinstance(row, dict) and row.get("character_id") == character_id
                ]
                if len(next_character_rows) > 1:
                    abort(400, description="character bundle cannot add duplicate encounter placements")
                if not previous_has_character and not next_has_character:
                    abort(400, description="existing encounter change must add, update, or remove the bundle character")
                previous_others = [
                    row for row in (existing.participants or [])
                    if not isinstance(row, dict) or row.get("character_id") != character_id
                ]
                next_others = [
                    row for row in (encounter_data.get("participants") or [])
                    if not isinstance(row, dict) or row.get("character_id") != character_id
                ]
                if previous_others != next_others:
                    abort(400, description="character bundle cannot change other encounter participants")
                full_data = _serialize_encounter(existing)
                full_data["participants"] = encounter_data.get("participants", [])
                _upsert_with_route(db_session, encounter_route, Encounter, full_data)
            else:
                allowed = {"id", "slug", "name", "description", "encounter_type", "participants", "rewards", "tags"}
                unexpected = set(encounter_data) - allowed
                if unexpected:
                    abort(400, description=f"new character-bundle encounters contain unsupported fields: {sorted(unexpected)}")
                participants = encounter_data.get("participants")
                if not isinstance(participants, list) or len(participants) != 1:
                    abort(400, description="new character-bundle encounters must contain exactly one participant")
                participant = participants[0]
                if not isinstance(participant, dict) or participant.get("character_id") != character_id:
                    abort(400, description="new character-bundle encounter participant must be the bundle character")
                rewards = encounter_data.get("rewards", {})
                if not isinstance(rewards, dict):
                    abort(400, description="new character-bundle encounter rewards must be an object")
                if any(rewards.get(key) for key in ["items", "currencies", "reputation", "flags_set"]) or rewards.get("xp") not in (None, 0):
                    abort(400, description="new character-bundle encounters cannot create rewards")
                _upsert_with_route(db_session, encounter_route, Encounter, encounter_data)

        db_session.commit()
        refreshed = db_session.get(Character, character.id)
        return jsonify(_character_packet(db_session, refreshed))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException):
            raise
        abort(400, description=str(error))
    finally:
        db_session.close()
