from flask import Blueprint, request, jsonify
from backend.app.models.m_effects import Effect
from backend.app.db.init_db import get_db_session

bp = Blueprint("effects", __name__)

@bp.route("/api/effects", methods=["GET"])
def get_effects():
    db = get_db_session()
    effects = db.query(Effect).all()
    return jsonify([e.__dict__ for e in effects])

@bp.route("/api/effects", methods=["POST"])
def upsert_effect():
    db = get_db_session()
    payload = request.json
    effect_id = payload.get("effect_id")
    effect = db.get(Effect, effect_id) if effect_id else None

    if not effect:
        effect = Effect(id=effect_id)
        db.add(effect)

    for key, value in payload.items():
        if hasattr(effect, key):
            setattr(effect, key, value)

    db.commit()
    return jsonify(success=True)
