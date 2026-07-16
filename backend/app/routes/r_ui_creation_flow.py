from copy import deepcopy

from flask import Blueprint, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.routes.bundle_validation import bundle_error_response
from backend.app.routes.r_creation_flow_manifests import route as manifest_route
from backend.app.services.bundle_operations import apply_creation_flow_mutation
from backend.app.services.creation_flow_catalog import creation_flow_catalog
from backend.app.services.creation_flow_compiler import (
    compile_creation_flow,
    upsert_creation_flow_manifest,
)


bp = Blueprint("ui_creation_flow", __name__)


def _draft_from_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("request body must be an object")
    draft = payload.get("draft", payload)
    if not isinstance(draft, dict):
        raise ValueError("draft must be an object")
    return draft


@bp.get("/api/ui/creation-flow/catalog")
def get_creation_flow_catalog():
    db_session = get_db_session()
    try:
        return jsonify(creation_flow_catalog(db_session))
    finally:
        db_session.close()


@bp.post("/api/ui/creation-flow/preview")
def preview_creation_flow():
    db_session = get_db_session()
    try:
        draft = _draft_from_payload(deepcopy(request.get_json(silent=True)))
        result = compile_creation_flow(db_session, draft)
        if result["can_commit"]:
            result["review"] = apply_creation_flow_mutation(db_session, result["implementation"])
        else:
            result["review"] = {"created": [], "changed": [], "deleted": [], "unlinked": []}
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/creation-flow/bundle")
def save_creation_flow_bundle():
    db_session = get_db_session()
    try:
        payload = deepcopy(request.get_json(silent=True))
        if not isinstance(payload, dict):
            raise ValueError("request body must be an object")
        draft = _draft_from_payload(payload)
        supplied_hash = str(payload.get("preview_hash") or "").strip()
        if not supplied_hash:
            raise ValueError("preview_hash is required; preview the current draft before commit")
        accepted_warning_ids = payload.get("accepted_warning_ids", [])
        if not isinstance(accepted_warning_ids, list) or any(not isinstance(value, str) for value in accepted_warning_ids):
            raise ValueError("accepted_warning_ids must be an array of strings")

        result = compile_creation_flow(db_session, draft)
        if supplied_hash != result["preview_hash"]:
            return jsonify({
                "error": True,
                "status": 409,
                "type": "StaleCreationFlowPreview",
                "message": "The draft or referenced canonical data changed after preview. Preview again before committing.",
                "expected_preview_hash": result["preview_hash"],
                "result": result,
            }), 409
        if result["blockers"]:
            return jsonify({
                "error": True,
                "status": 400,
                "type": "CreationFlowBlocked",
                "message": "The creation flow has compiler blockers.",
                "result": result,
            }), 400
        missing_acceptance = sorted({issue["id"] for issue in result["warnings"]} - set(accepted_warning_ids))
        if missing_acceptance:
            return jsonify({
                "error": True,
                "status": 400,
                "type": "CreationFlowWarningsUnaccepted",
                "message": "Accept every current compiler warning before committing.",
                "missing_warning_ids": missing_acceptance,
                "result": result,
            }), 400

        result["review"] = apply_creation_flow_mutation(db_session, result["implementation"])
        manifest = upsert_creation_flow_manifest(db_session, result, accepted_warning_ids)
        serialized_manifest = manifest_route.serialize_item(manifest)
        db_session.commit()
        return jsonify({
            **result,
            "committed": True,
            "manifest": serialized_manifest,
        })
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
