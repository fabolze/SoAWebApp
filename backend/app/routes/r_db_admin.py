# backend/app/routes/r_db_admin.py
from flask import Blueprint, request, jsonify
from backend.app.db.init_db import get_db_session
from backend.app.models.base import Base

from sqlalchemy import create_engine
import os
from backend.app.config import DATA_DIR

bp = Blueprint("db_admin", __name__)

# Main DB engine import (assume it's in init_db)
try:
    from backend.app.db.init_db import engine
except ImportError:
    engine = None

@bp.route("/api/db/reset", methods=["POST"])
def reset_main_db():
    if not engine:
        return jsonify({"error": "No engine found."}), 500
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return jsonify({"status": "ok"})

@bp.route("/api/db/create", methods=["POST"])
def create_preview_db():
    name = request.json.get("name") if request.is_json else request.form.get("name")
    if not name:
        return jsonify({"error": "Missing database name."}), 400
    db_path = DATA_DIR / f"{name}.sqlite"
    if db_path.exists():
        return jsonify({"error": "Database already exists."}), 400
    engine_preview = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine_preview)
    return jsonify({"status": "ok", "db": name})

@bp.route("/api/db/delete", methods=["POST"])
def delete_preview_db():
    name = request.json.get("name") if request.is_json else request.form.get("name")
    if not name:
        return jsonify({"error": "Missing database name."}), 400
    db_path = DATA_DIR / f"{name}.sqlite"
    if not db_path.exists():
        return jsonify({"error": "Database not found."}), 404
    try:
        db_path.unlink()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"status": "ok", "db": name})

@bp.route("/api/db/list", methods=["GET"])
def list_preview_dbs():
    dbs = [f.name for f in DATA_DIR.glob("*.sqlite")]
    return jsonify({"databases": dbs})
