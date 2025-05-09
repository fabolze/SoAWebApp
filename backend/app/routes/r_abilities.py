from flask import Blueprint, request, jsonify
from backend.app.models.m_abilities import Ability, AbilityEffectLink, AbilityScalingLink
from backend.app.db.init_db import get_db_session
from backend.app.models import Effect, Attribute

bp = Blueprint('abilities', __name__)

@bp.route("/api/abilities", methods=["POST"])
def upsert_ability():
    db_session = get_db_session()
    data = request.json
    ability_id = data.get("id")

    # Upsert core fields
    ability = db_session.get(Ability, ability_id) or Ability(id=ability_id)
    ability.name = data.get("name")
    ability.type = data.get("type")
    ability.icon_path = data.get("icon_path")
    ability.description = data.get("description")
    ability.resource_cost = data.get("resource_cost")
    ability.cooldown = data.get("cooldown")
    ability.targeting = data.get("targeting")
    ability.trigger_condition = data.get("trigger_condition")
    ability.requirements = data.get("requirements")

    # Clear and reset effect links
    ability.effects.clear()
    for effect_id in data.get("effects", []):
        link = AbilityEffectLink(effect_id=effect_id)
        link.ability = ability
        db_session.add(link)

    # Clear and reset scaling
    ability.scaling.clear()
    for entry in data.get("scaling", []):
        link = AbilityScalingLink(attribute_id=entry["attribute_id"], multiplier=entry["multiplier"])
        link.ability = ability
        db_session.add(link)

    db_session.add(ability)
    db_session.commit()

    return jsonify({"status": "ok"})



@bp.route("/api/abilities", methods=["GET"])
def list_abilities():
    db_session = get_db_session()
    abilities = db_session.query(Ability).all()
    result = []
    for a in abilities:
        result.append({
            "id": a.id,
            "name": a.name,
            "type": a.type.value if a.type else None,
            "icon_path": a.icon_path,
            "description": a.description
        })
    return jsonify(result)
