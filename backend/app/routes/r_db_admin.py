# backend/app/routes/r_db_admin.py
from flask import Blueprint, request, jsonify
from sqlalchemy import create_engine

from backend.app.config import DATA_DIR
from backend.app.db import init_db as db_runtime
from backend.app.models.base import Base

bp = Blueprint("db_admin", __name__)

@bp.route("/api/db/reset", methods=["POST"])
def reset_main_db():
    engine = db_runtime.get_engine()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    return jsonify({"status": "ok", "active": f"{db_runtime.get_active_db_name()}.sqlite"})


def _extract_db_name():
    raw_name = request.json.get("name") if request.is_json else request.form.get("name")
    if raw_name is None:
        raise ValueError("Missing database name.")
    return db_runtime.normalize_db_name(raw_name)

@bp.route("/api/db/create", methods=["POST"])
def create_preview_db():
    try:
        name = _extract_db_name()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    db_path = db_runtime.get_db_path(name)
    if db_path.exists():
        return jsonify({"error": "Database already exists."}), 400
    engine_preview = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine_preview)
    engine_preview.dispose()
    return jsonify({"status": "ok", "db": f"{name}.sqlite"})

@bp.route("/api/db/delete", methods=["POST"])
def delete_preview_db():
    try:
        name = _extract_db_name()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    if name == db_runtime.get_active_db_name():
        return jsonify({"error": "Cannot delete active database."}), 400
    db_path = db_runtime.get_db_path(name)
    if not db_path.exists():
        return jsonify({"error": "Database not found."}), 404
    try:
        db_path.unlink()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"status": "ok", "db": f"{name}.sqlite"})


@bp.route("/api/db/select", methods=["POST"])
def select_active_db():
    try:
        name = _extract_db_name()
        active_name, db_path = db_runtime.switch_active_database(name)
        db_runtime.init_db()
        return jsonify({
            "status": "ok",
            "active": f"{active_name}.sqlite",
            "path": db_path,
        })
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/db/active", methods=["GET"])
def get_active_db():
    return jsonify({
        "active": f"{db_runtime.get_active_db_name()}.sqlite",
        "uri": db_runtime.get_active_db_uri(),
    })

@bp.route("/api/db/list", methods=["GET"])
def list_preview_dbs():
    dbs = sorted([f.name for f in DATA_DIR.glob("*.sqlite")])
    return jsonify({
        "databases": dbs,
        "active": f"{db_runtime.get_active_db_name()}.sqlite",
    })
