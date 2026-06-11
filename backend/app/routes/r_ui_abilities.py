from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_abilities import Ability, AbilityType
from backend.app.models.m_abilities_links import AbilityRelation
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_effects import Effect
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_items import Item
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_stats import Stat
from backend.app.models.m_statuses import Status
from backend.app.models.m_talent_trees import TalentNode
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_abilities import route as ability_route
from backend.app.routes.r_ability_links import relation_route
from backend.app.routes.r_combat_profiles import route as combat_profile_route
from backend.app.routes.r_effects import route as effect_route
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.routes.r_statuses import route as status_route
from backend.app.utils.id import generate_ulid


bp = Blueprint("ui_abilities", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    return {
        column.name: _enum_value(getattr(model, column.name))
        for column in model.__table__.columns
    }


def _compact(model):
    if not model:
        return None
    data = _columns(model)
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "character_id", "type",
            "category", "target", "role", "enemy_type", "aggression", "tags",
        )
        if key in data
    }


def _upsert(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        item_id = data.get("id")
        if not item_id:
            abort(400, description=f"{path}.id is required")
        item = db_session.get(model, item_id) or model(id=item_id)
        route.validate_required_fields(data, route.get_schema_required_fields())
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _contains(values, item_id):
    return isinstance(values, list) and item_id in values


def _ability_usage(db_session, ability_id):
    profiles = [
        _compact(row)
        for row in db_session.query(CombatProfile).all()
        if _contains(row.custom_abilities, ability_id)
    ]
    classes = [
        _compact(row)
        for row in db_session.query(CharacterClass).all()
        if _contains(row.starting_abilities, ability_id)
    ]
    talent_nodes = [
        _compact(row)
        for row in db_session.query(TalentNode).all()
        if _contains(row.granted_abilities, ability_id)
    ]
    return {
        "combat_profiles": profiles,
        "characterclasses": classes,
        "talent_nodes": talent_nodes,
    }


def _effect_usage(db_session, effect_id):
    abilities = [
        _compact(row)
        for row in db_session.query(Ability).all()
        if any(link.effect_id == effect_id for link in (row.effects or []))
    ]
    items = [
        _compact(row)
        for row in db_session.query(Item).all()
        if _contains(row.effects, effect_id)
    ]
    return {"abilities": abilities, "items": items}


def _status_usage(db_session, status_id):
    return {
        "effects": [
            _compact(row)
            for row in db_session.query(Effect).filter(Effect.status_id == status_id).all()
        ]
    }


def _all_usage(db_session):
    return {
        "abilities": {
            row.id: _ability_usage(db_session, row.id)
            for row in db_session.query(Ability).all()
        },
        "effects": {
            row.id: _effect_usage(db_session, row.id)
            for row in db_session.query(Effect).all()
        },
        "statuses": {
            row.id: _status_usage(db_session, row.id)
            for row in db_session.query(Status).all()
        },
    }


def _similar_abilities(db_session, ability):
    effect_types = sorted(
        _enum_value(link.effect.type)
        for link in (ability.effects or [])
        if link.effect and link.effect.type
    )
    matches = []
    for candidate in db_session.query(Ability).all():
        if candidate.id == ability.id:
            continue
        candidate_effect_types = sorted(
            _enum_value(link.effect.type)
            for link in (candidate.effects or [])
            if link.effect and link.effect.type
        )
        score = 0
        if candidate.type == ability.type:
            score += 1
        if candidate.targeting == ability.targeting:
            score += 1
        if candidate.trigger_condition == ability.trigger_condition:
            score += 1
        if candidate_effect_types == effect_types and effect_types:
            score += 2
        if score >= 3:
            matches.append({**_compact(candidate), "similarity_score": score})
    return sorted(matches, key=lambda row: (-row["similarity_score"], row.get("name") or row["id"]))


def _catalogs(db_session):
    characters = {row.id: row for row in db_session.query(Character).all()}
    return {
        "abilities": [ability_route.serialize_item(row) for row in db_session.query(Ability).all()],
        "effects": [effect_route.serialize_item(row) for row in db_session.query(Effect).all()],
        "statuses": [status_route.serialize_item(row) for row in db_session.query(Status).all()],
        "stats": [_compact(row) for row in db_session.query(Stat).all()],
        "requirements": [requirement_route.serialize_item(row) for row in db_session.query(Requirement).all()],
        "combat_profiles": [
            {
                **_columns(row),
                "character": _compact(characters.get(row.character_id)),
            }
            for row in db_session.query(CombatProfile).all()
        ],
        "characters": [_compact(row) for row in db_session.query(Character).all()],
        "encounters": [_columns(row) for row in db_session.query(Encounter).all()],
        "characterclasses": [_compact(row) for row in db_session.query(CharacterClass).all()],
        "talent_nodes": [_compact(row) for row in db_session.query(TalentNode).all()],
        "items": [_compact(row) for row in db_session.query(Item).all()],
    }


def _packet(db_session, ability):
    effects = [link.effect for link in (ability.effects or []) if link.effect]
    status_ids = {effect.status_id for effect in effects if effect.status_id}
    requirement = db_session.get(Requirement, ability.requirements_id) if ability.requirements_id else None
    usage = _all_usage(db_session)
    return {
        "ability": ability_route.serialize_item(ability),
        "linked_effects": [effect_route.serialize_item(row) for row in effects],
        "linked_statuses": [
            status_route.serialize_item(row)
            for row in db_session.query(Status).filter(Status.id.in_(status_ids)).all()
        ] if status_ids else [],
        "requirement": requirement_route.serialize_item(requirement) if requirement else None,
        "assigned_combat_profile_ids": [
            row.id
            for row in db_session.query(CombatProfile).all()
            if _contains(row.custom_abilities, ability.id)
        ],
        "catalogs": _catalogs(db_session),
        "usage": usage,
        "analysis": {
            "similar_abilities": _similar_abilities(db_session, ability),
        },
        "relations": [
            relation_route.serialize_item(row)
            for row in db_session.query(AbilityRelation).filter(
                (AbilityRelation.from_ability_id == ability.id) | (AbilityRelation.to_ability_id == ability.id)
            ).all()
        ],
    }


def _new_packet(db_session):
    ability = Ability(
        id=generate_ulid(),
        slug="",
        name="New Ability",
        type=AbilityType.Active,
        resource_cost=0,
        cooldown=0,
        tags=[],
    )
    return {
        "ability": ability_route.serialize_item(ability),
        "linked_effects": [],
        "linked_statuses": [],
        "requirement": None,
        "assigned_combat_profile_ids": [],
        "catalogs": _catalogs(db_session),
        "usage": _all_usage(db_session),
        "analysis": {"similar_abilities": []},
        "relations": [],
    }


def _upsert_many(db_session, route, model, rows, root):
    if not isinstance(rows, list):
        abort(400, description=f"{root} must be an array")
    result = []
    for index, data in enumerate(rows):
        result.append(_upsert(db_session, route, model, data, f"{root}[{index}]"))
    return result


def _reconcile_assignments(db_session, ability_id, assigned_ids):
    if not isinstance(assigned_ids, list) or any(not isinstance(value, str) for value in assigned_ids):
        abort(400, description="assigned_combat_profile_ids must be an array of ids")
    if len(assigned_ids) != len(set(assigned_ids)):
        abort(400, description="assigned_combat_profile_ids contains duplicates")
    desired = set(assigned_ids)
    profiles = db_session.query(CombatProfile).all()
    known = {profile.id for profile in profiles}
    missing = desired - known
    if missing:
        abort(400, description=f"assigned_combat_profile_ids references missing profile: {sorted(missing)[0]}")
    for profile in profiles:
        abilities = list(profile.custom_abilities or [])
        next_abilities = [entry for entry in abilities if entry != ability_id]
        if profile.id in desired:
            next_abilities.append(ability_id)
        if next_abilities != abilities:
            profile.custom_abilities = next_abilities
            db_session.add(profile)


def _reconcile_relations(db_session, ability_id, rows):
    if not isinstance(rows, list):
        abort(400, description="relations must be an array")
    desired_ids = set()
    for index, data in enumerate(rows):
        if not isinstance(data, dict):
            abort(400, description=f"relations[{index}] must be an object")
        next_data = dict(data)
        next_data.setdefault("from_ability_id", ability_id)
        if ability_id not in (next_data.get("from_ability_id"), next_data.get("to_ability_id")):
            abort(400, description=f"relations[{index}] must reference the bundle ability")
        relation = _upsert(db_session, relation_route, AbilityRelation, next_data, f"relations[{index}]")
        desired_ids.add(relation.id)
    current = db_session.query(AbilityRelation).filter(
        (AbilityRelation.from_ability_id == ability_id) | (AbilityRelation.to_ability_id == ability_id)
    ).all()
    for relation in current:
        if relation.id not in desired_ids:
            db_session.delete(relation)


@bp.get("/api/ui/abilities")
def get_ability_selector():
    db_session = get_db_session()
    try:
        return jsonify(_new_packet(db_session))
    finally:
        db_session.close()


@bp.get("/api/ui/abilities/<ability_id>")
def get_ability_lab(ability_id):
    db_session = get_db_session()
    try:
        ability = db_session.get(Ability, ability_id)
        if not ability:
            abort(404, description=f"Ability {ability_id} not found")
        return jsonify(_packet(db_session, ability))
    finally:
        db_session.close()


@bp.post("/api/ui/abilities/bundle")
def save_ability_bundle():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("ability"), dict):
            abort(400, description="ability bundle requires an ability object")
        ability_data = dict(payload["ability"])
        ability_id = ability_data.get("id")
        if not ability_id:
            abort(400, description="ability.id is required")

        _upsert_many(db_session, status_route, Status, payload.get("status_upserts", []), "status_upserts")
        _upsert_many(db_session, effect_route, Effect, payload.get("effect_upserts", []), "effect_upserts")
        _upsert_many(db_session, combat_profile_route, CombatProfile, payload.get("combat_profile_upserts", []), "combat_profile_upserts")

        requirement = payload.get("requirement")
        if requirement is not None:
            if not isinstance(requirement, dict) or requirement.get("id") != ability_data.get("requirements_id"):
                abort(400, description="requirement.id must match ability.requirements_id")
            _upsert(db_session, requirement_route, Requirement, requirement, "requirement")

        ability = _upsert(db_session, ability_route, Ability, ability_data, "ability")
        _reconcile_assignments(db_session, ability_id, payload.get("assigned_combat_profile_ids", []))
        _reconcile_relations(db_session, ability_id, payload.get("relations", []))
        db_session.commit()
        return jsonify(_packet(db_session, ability))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
