from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_abilities import Ability
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_currencies import Currency
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_factions import Faction
from backend.app.models.m_items import Item
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_locations import Location
from backend.app.models.m_stats import Stat
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_characters import route as character_route
from backend.app.routes.r_combat_profiles import route as combat_profile_route
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_location_encounter_tables import route as encounter_table_route
from backend.app.services.adventure_timeline import build_adventure_timeline
from backend.app.services.adventure_timeline_coherence import _important_item
from backend.app.utils.id import generate_ulid


bp = Blueprint("ui_creatures", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    if not model:
        return None
    return {column.name: _enum_value(getattr(model, column.name)) for column in model.__table__.columns}


def _compact(model):
    if not model:
        return None
    data = _columns(model)
    return {
        key: data.get(key)
        for key in ("id", "slug", "name", "title", "description", "level", "location_id", "character_id", "tags")
        if key in data
    }


def _upsert(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict) or not data.get("id"):
            abort(400, description=f"{path}.id is required")
        item = db_session.get(model, data["id"]) or model(id=data["id"])
        route.validate_required_fields(data, route.get_schema_required_fields())
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _is_creature(character, combat):
    tags = {str(tag).lower() for tag in (character.tags or [])}
    if tags & {"creature", "enemy", "elite", "boss", "beast", "monster"}:
        return True
    if combat and _enum_value(combat.aggression) == "Hostile":
        return True
    if combat and _enum_value(combat.enemy_type) in {
        "beast", "undead", "elemental", "machine", "boss", "demon", "dragon", "giant", "spirit", "emanation",
    }:
        return True
    return False


def _combat_by_character(db_session):
    return {row.character_id: row for row in db_session.query(CombatProfile).all()}


def _navigator(db_session):
    combat_by_character = _combat_by_character(db_session)
    encounters = db_session.query(Encounter).all()
    tables = db_session.query(LocationEncounterTable).all()
    encounter_counts = {}
    encounter_ids_by_character = {}
    for encounter in encounters:
        for row in encounter.participants or []:
            if isinstance(row, dict) and row.get("character_id"):
                character_id = row["character_id"]
                encounter_counts[character_id] = encounter_counts.get(character_id, 0) + 1
                encounter_ids_by_character.setdefault(character_id, set()).add(encounter.id)
    habitat_locations_by_encounter = {}
    for table in tables:
        for row in table.encounter_entries or []:
            if isinstance(row, dict) and row.get("encounter_id") and table.location_id:
                habitat_locations_by_encounter.setdefault(row["encounter_id"], set()).add(table.location_id)
    result = []
    for character in db_session.query(Character).all():
        combat = combat_by_character.get(character.id)
        if not _is_creature(character, combat):
            continue
        result.append({
            **_compact(character),
            "faction_id": character.faction_id,
            "home_location_id": character.home_location_id,
            "enemy_type": _enum_value(getattr(combat, "enemy_type", None)),
            "aggression": _enum_value(getattr(combat, "aggression", None)),
            "encounter_count": encounter_counts.get(character.id, 0),
            "encounter_ids": sorted(encounter_ids_by_character.get(character.id, set())),
            "habitat_location_ids": sorted({
                location_id
                for encounter_id in encounter_ids_by_character.get(character.id, set())
                for location_id in habitat_locations_by_encounter.get(encounter_id, set())
            }),
            "has_combat_profile": combat is not None,
            "custom_abilities": list(combat.custom_abilities or []) if combat else [],
            "custom_stats": list(combat.custom_stats or []) if combat else [],
        })
    return result


def _serialize_table(db_session, table):
    location = db_session.get(Location, table.location_id) if table.location_id else None
    return {**_columns(table), "location": _compact(location)}


def _catalogs(db_session):
    return {
        "abilities": [_compact(row) for row in db_session.query(Ability).all()],
        "characterclasses": [_compact(row) for row in db_session.query(CharacterClass).all()],
        "currencies": [_compact(row) for row in db_session.query(Currency).all()],
        "encounters": [_columns(row) for row in db_session.query(Encounter).all()],
        "encounter_tables": [_serialize_table(db_session, row) for row in db_session.query(LocationEncounterTable).all()],
        "factions": [_compact(row) for row in db_session.query(Faction).all()],
        "items": [_compact(row) for row in db_session.query(Item).all()],
        "locations": [_compact(row) for row in db_session.query(Location).all()],
        "stats": [_compact(row) for row in db_session.query(Stat).all()],
    }


def _encounter_uses_character(encounter, character_id):
    return any(
        isinstance(row, dict) and row.get("character_id") == character_id
        for row in (encounter.participants or [])
    )


def _encounter_ids_for_character(db_session, character_id):
    return {
        encounter.id
        for encounter in db_session.query(Encounter).all()
        if _encounter_uses_character(encounter, character_id)
    }


def _habitats(db_session, character_id):
    encounter_ids = _encounter_ids_for_character(db_session, character_id)
    return [
        {"table": _serialize_table(db_session, table), "entry": dict(entry)}
        for table in db_session.query(LocationEncounterTable).all()
        for entry in (table.encounter_entries or [])
        if isinstance(entry, dict) and entry.get("encounter_id") in encounter_ids
    ]


def _appearances(db_session, character_id):
    return [
        _columns(encounter)
        for encounter in db_session.query(Encounter).all()
        if _encounter_uses_character(encounter, character_id)
    ]


def _health(character, combat, appearances, habitats):
    blockers = []
    warnings = []
    if not character.get("name"):
        blockers.append("Name is required.")
    if not character.get("slug"):
        blockers.append("Slug is required.")
    tags = {str(tag).lower() for tag in character.get("tags") or []}
    if not combat:
        warnings.append("Creature has no combat profile.")
    else:
        if not character.get("class_id") and not (combat.get("companion_config") or {}).get("class_id"):
            warnings.append("Combat profile needs a class on the creature or companion override.")
        if not combat.get("custom_abilities"):
            warnings.append("Combat profile has no abilities.")
        if (combat.get("loot_table") or combat.get("currency_rewards") or combat.get("reputation_rewards")) and not appearances:
            warnings.append("Creature has rewards but no encounter placement.")
    if (tags & {"boss", "elite"} or (combat and combat.get("enemy_type") == "boss")) and not appearances:
        warnings.append("Boss or elite creature has no encounter.")
    if appearances and not habitats:
        warnings.append("Creature appears in encounters that are not placed in a location encounter table.")
    for encounter in appearances:
        rewards = encounter.get("rewards") if isinstance(encounter.get("rewards"), dict) else {}
        if (tags & {"boss"} or (combat and combat.get("enemy_type") == "boss")) and not (
            rewards.get("items") or rewards.get("currencies") or rewards.get("reputation") or rewards.get("xp")
        ):
            warnings.append(f"Boss encounter '{encounter.get('name') or encounter.get('id')}' has no reward payoff.")
    return {"blockers": blockers, "warnings": list(dict.fromkeys(warnings))}


def _packet(db_session, character):
    combat = db_session.query(CombatProfile).filter_by(character_id=character.id).first()
    character_data = _columns(character)
    combat_data = _columns(combat)
    appearances = _appearances(db_session, character.id)
    habitats = _habitats(db_session, character.id)
    timeline = build_adventure_timeline(db_session)
    appearance_ids = {row["id"] for row in appearances}
    character_occurrences = [
        row for row in timeline["entity_tracks"]["characters"]
        if row["entity_id"] == character.id
    ]
    encounter_occurrences = [
        row for row in timeline["entity_tracks"]["encounters"]
        if row["entity_id"] in appearance_ids
    ]
    story_warnings = [
        row for row in timeline["health"]["warnings"]
        if row.get("schema_name") == "encounters" and row.get("entry_id") in appearance_ids
    ]
    items_by_id = {row.id: row for row in db_session.query(Item).all()}
    boss_payoff = {
        "character_occurrences": character_occurrences,
        "encounter_occurrences": encounter_occurrences,
        "story_warnings": story_warnings,
        "encounters": [
            {
                "id": encounter["id"],
                "name": encounter.get("name"),
                "story_placed": any(row["entity_id"] == encounter["id"] for row in encounter_occurrences),
                "rewarded_item_ids": [
                    reward.get("item_id")
                    for reward in ((encounter.get("rewards") or {}).get("items", []) if isinstance(encounter.get("rewards"), dict) else [])
                    if isinstance(reward, dict) and reward.get("item_id")
                ],
                "important_reward_item_ids": [
                    reward.get("item_id")
                    for reward in ((encounter.get("rewards") or {}).get("items", []) if isinstance(encounter.get("rewards"), dict) else [])
                    if isinstance(reward, dict)
                    and reward.get("item_id") in items_by_id
                    and _important_item(items_by_id[reward["item_id"]])
                ],
                "has_any_payoff": bool(
                    isinstance(encounter.get("rewards"), dict)
                    and any((encounter.get("rewards") or {}).get(key) for key in ("items", "currencies", "reputation", "xp", "flags_set"))
                ),
            }
            for encounter in appearances
        ],
    }
    return {
        "navigator": _navigator(db_session),
        "creature": character_data,
        "combat_profile": combat_data,
        "appearances": appearances,
        "habitats": habitats,
        "catalogs": _catalogs(db_session),
        "health": _health(character_data, combat_data, appearances, habitats),
        "boss_payoff": boss_payoff,
    }


def _new_creature():
    creature_id = generate_ulid()
    return Character(
        id=creature_id,
        slug=f"new-creature-{creature_id[-6:].lower()}",
        name="New Creature",
        title="",
        description="",
        level=1,
        tags=["creature", "enemy"],
    )


def _review_change(review, action, table, item_id, details=None):
    review[action].append({"table": table, "id": item_id, "details": details or {}})


def _validate_profile_ownership(db_session, data, character_id):
    if not isinstance(data, dict) or not data.get("id"):
        abort(400, description="combat_profile.id is required")
    if data.get("character_id") != character_id:
        abort(400, description="combat_profile.character_id must match creature.id")
    existing_by_id = db_session.get(CombatProfile, data["id"])
    if existing_by_id and existing_by_id.character_id != character_id:
        abort(400, description="combat_profile.id belongs to another character")
    existing_for_character = db_session.query(CombatProfile).filter_by(character_id=character_id).first()
    if existing_for_character and existing_for_character.id != data["id"]:
        abort(400, description="creature already has a different combat_profile")


def _apply_encounter_changes(db_session, character_id, changes, review):
    if not isinstance(changes, list):
        abort(400, description="encounter_changes must be an array")
    for index, change in enumerate(changes):
        path = f"encounter_changes[{index}]"
        if not isinstance(change, dict):
            abort(400, description=f"{path} must be an object")
        encounter = db_session.get(Encounter, change.get("id"))
        if not encounter:
            abort(400, description=f"{path}.id references missing encounter")
        expected = change.get("expected_previous")
        if expected != (encounter.participants or []):
            abort(400, description=f"{path}.expected_previous is stale")
        participants = change.get("participants")
        if not isinstance(participants, list):
            abort(400, description=f"{path}.participants must be an array")
        previous_others = [
            row for row in (encounter.participants or [])
            if not isinstance(row, dict) or row.get("character_id") != character_id
        ]
        next_others = [
            row for row in participants
            if not isinstance(row, dict) or row.get("character_id") != character_id
        ]
        if previous_others != next_others:
            abort(400, description=f"{path} cannot modify unrelated participants")
        if sum(1 for row in participants if isinstance(row, dict) and row.get("character_id") == character_id) > 1:
            abort(400, description=f"{path} cannot add duplicate creature participants")
        encounter.participants = participants
        db_session.add(encounter)
        _review_change(review, "changed", "encounters", encounter.id, {"participants": {"from": expected, "to": participants}})


def _apply_table_changes(db_session, character_id, changes, review):
    if not isinstance(changes, list):
        abort(400, description="encounter_table_changes must be an array")
    valid_encounter_ids = _encounter_ids_for_character(db_session, character_id)
    for index, change in enumerate(changes):
        path = f"encounter_table_changes[{index}]"
        if not isinstance(change, dict):
            abort(400, description=f"{path} must be an object")
        table = db_session.get(LocationEncounterTable, change.get("id"))
        if not table:
            abort(400, description=f"{path}.id references missing encounter table")
        expected = change.get("expected_previous")
        if expected != (table.encounter_entries or []):
            abort(400, description=f"{path}.expected_previous is stale")
        entries = change.get("encounter_entries")
        if not isinstance(entries, list):
            abort(400, description=f"{path}.encounter_entries must be an array")
        previous_unrelated = [
            row for row in (table.encounter_entries or [])
            if not isinstance(row, dict) or row.get("encounter_id") not in valid_encounter_ids
        ]
        next_unrelated = [
            row for row in entries
            if not isinstance(row, dict) or row.get("encounter_id") not in valid_encounter_ids
        ]
        if previous_unrelated != next_unrelated:
            abort(400, description=f"{path} cannot modify unrelated encounter rows")
        data = _columns(table)
        data["encounter_entries"] = entries
        item = _upsert(db_session, encounter_table_route, LocationEncounterTable, data, path)
        _review_change(review, "changed", "location_encounter_tables", item.id, {"encounter_entries": {"from": expected, "to": entries}})


def _reconcile(db_session, payload):
    if not isinstance(payload, dict):
        abort(400, description="creature workshop mutation must be an object")
    creature_data = payload.get("creature")
    if not isinstance(creature_data, dict) or not creature_data.get("id"):
        abort(400, description="creature workshop mutation requires creature")
    character_id = creature_data["id"]
    review = {"created": [], "changed": [], "deleted": []}

    existed = db_session.get(Character, character_id) is not None
    character = _upsert(db_session, character_route, Character, creature_data, "creature")
    _review_change(review, "changed" if existed else "created", "characters", character.id)

    combat_data = payload.get("combat_profile")
    if combat_data is not None:
        _validate_profile_ownership(db_session, combat_data, character_id)
        existed = db_session.get(CombatProfile, combat_data["id"]) is not None
        combat = _upsert(db_session, combat_profile_route, CombatProfile, combat_data, "combat_profile")
        _review_change(review, "changed" if existed else "created", "combat_profiles", combat.id)

    _apply_encounter_changes(db_session, character_id, payload.get("encounter_changes", []), review)
    _apply_table_changes(db_session, character_id, payload.get("encounter_table_changes", []), review)
    db_session.flush()
    return {"review": review, "warnings": [], "blockers": []}


@bp.get("/api/ui/creatures")
def get_creature_selector():
    db_session = get_db_session()
    try:
        return jsonify({"navigator": _navigator(db_session), "catalogs": _catalogs(db_session)})
    finally:
        db_session.close()


@bp.get("/api/ui/creatures/new")
def get_new_creature():
    db_session = get_db_session()
    try:
        creature = _new_creature()
        db_session.add(creature)
        db_session.flush()
        packet = _packet(db_session, creature)
        db_session.rollback()
        return jsonify(packet)
    finally:
        db_session.close()


@bp.get("/api/ui/creatures/<character_id>")
def get_creature(character_id):
    db_session = get_db_session()
    try:
        character = db_session.get(Character, character_id)
        if not character:
            abort(404, description=f"Creature {character_id} not found")
        return jsonify(_packet(db_session, character))
    finally:
        db_session.close()


@bp.post("/api/ui/creatures/preview")
def preview_creature_workshop():
    db_session = get_db_session()
    try:
        result = _reconcile(db_session, deepcopy(request.get_json(silent=True)))
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/creatures/bundle")
def save_creature_workshop():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        result = _reconcile(db_session, payload)
        db_session.commit()
        return jsonify({"result": result, "packet": _packet(db_session, db_session.get(Character, payload["creature"]["id"]))})
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
