from flask import Blueprint, request, jsonify
from backend.app.models.m_enemies import Enemy
from backend.app.db.init_db import get_db_session

bp = Blueprint('enemies', __name__)

@bp.route("/api/enemies", methods=["POST"])
def upsert_enemy():
    db_session = get_db_session()
    data = request.json
    enemy_id = data.get("id")
    
    enemy = db_session.get(Enemy, enemy_id) or Enemy(id=enemy_id)
    enemy.name = data.get("name")
    enemy.health = data.get("health")
    enemy.attack = data.get("attack")
    enemy.defense = data.get("defense")
    enemy.icon_path = data.get("icon_path")
    
    db_session.add(enemy)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/enemies", methods=["GET"])
def list_enemies():
    db_session = get_db_session()
    enemies = db_session.query(Enemy).all()
    return jsonify([{"id": e.id, "name": e.name} for e in enemies])
