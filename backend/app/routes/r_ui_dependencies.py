from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
from backend.app.models.m_flags import Flag
from backend.app.models.m_requirements import Requirement
from backend.app.routes.bundle_validation import bundle_error_response
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.routes.r_ui_item_ecosystem import _columns, _upsert
from backend.app.services.dependency_index import build_dependency_index


bp = Blueprint("ui_dependencies", __name__)


def _models_by_table():
    return {model.__tablename__: model for model in ALL_MODELS if getattr(model, "__tablename__", None)}


@bp.get("/api/ui/dependencies")
def get_dependencies():
    db_session = get_db_session()
    try:
        return jsonify(build_dependency_index(db_session))
    finally:
        db_session.close()


@bp.post("/api/ui/dependencies/bundle")
def save_dependency_focus():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            abort(400, description="dependency bundle must be an object")
        requirement_data = payload.get("requirement")
        if requirement_data is not None:
            _upsert(db_session, requirement_route, Requirement, requirement_data, "requirement")
        assignment = payload.get("assignment")
        if assignment is not None:
            if not isinstance(assignment, dict):
                abort(400, description="assignment must be an object")
            model = _models_by_table().get(assignment.get("schema_name"))
            if not model or not hasattr(model, "requirements_id"):
                abort(400, description="assignment.schema_name does not support direct requirements")
            item = db_session.get(model, assignment.get("entry_id"))
            if not item:
                abort(400, description="assignment.entry_id references missing content")
            requirement_id = assignment.get("requirements_id") or None
            if requirement_id and not db_session.get(Requirement, requirement_id):
                abort(400, description="assignment.requirements_id references missing requirement")
            item.requirements_id = requirement_id
            db_session.add(item)
        source = payload.get("source_flags")
        if source is not None:
            if not isinstance(source, dict):
                abort(400, description="source_flags must be an object")
            model = _models_by_table().get(source.get("schema_name"))
            allowed = {
                "quests": "flags_set_on_completion",
                "events": "flags_set",
                "interaction_profiles": "flags_set_on_interaction",
            }
            field = allowed.get(source.get("schema_name"))
            item = db_session.get(model, source.get("entry_id")) if model and field else None
            flags = source.get("flags")
            if not item or not isinstance(flags, list):
                abort(400, description="source_flags references an unsupported or missing source")
            for flag_id in flags:
                if not db_session.get(Flag, flag_id):
                    abort(400, description=f"source_flags references missing flag: {flag_id}")
            setattr(item, field, flags)
            db_session.add(item)
        db_session.commit()
        return jsonify(build_dependency_index(db_session))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
