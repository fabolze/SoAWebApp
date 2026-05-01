import os
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request

bp = Blueprint("authoring", __name__)


def _schema_filter_patch(schema: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    properties = schema.get("properties") if isinstance(schema, dict) else {}
    if not isinstance(properties, dict) or not properties:
        return patch
    return {key: value for key, value in patch.items() if key in properties}


def _get_authoring_provider():
    if os.environ.get("SOA_AUTHORING_AI_ENABLED", "").lower() not in ("1", "true", "yes"):
        return None
    return _mockable_provider


def _mockable_provider(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Provider hook for deployments/tests.

    Real AI integration can replace this function behind the same response shape
    without exposing API keys to the frontend.
    """
    schema_name = str(payload.get("schemaName") or "entry")
    brief = payload.get("brief") if isinstance(payload.get("brief"), dict) else {}
    theme = str(brief.get("theme") or "Generated")
    return [
        {
            "id": "ai-disabled-default",
            "title": f"{theme} {schema_name} idea",
            "summary": "Mock provider response. Replace provider for real AI generation.",
            "outputKind": "patch",
            "source": "ai",
            "risk": "needs_review",
            "patch": {
                "title": f"{theme} {schema_name} idea",
                "summary": "Mock provider response.",
                "mode": "fill_empty",
                "source": "ai",
                "risk": "needs_review",
                "patch": {
                    "name": f"{theme} Draft",
                    "title": f"{theme} Draft",
                    "description": "AI-generated draft text.",
                    "tags": ["ai", "generated"],
                },
            },
        }
    ]


@bp.route("/api/authoring/generate", methods=["POST"])
def generate_authoring():
    provider = _get_authoring_provider()
    if provider is None:
        return jsonify({
            "status": "disabled",
            "message": "AI authoring is disabled. Set SOA_AUTHORING_AI_ENABLED=true on the backend to enable a provider.",
            "suggestions": [],
        }), 501

    payload = request.get_json(silent=True) or {}
    schema_name = payload.get("schemaName")
    schema = payload.get("schema")
    current_entry = payload.get("currentEntry")
    brief = payload.get("brief")
    output_kind = payload.get("outputKind", "patch")
    if not isinstance(schema_name, str) or not schema_name.strip():
        return jsonify({"status": "error", "message": "schemaName is required."}), 400
    if not isinstance(schema, dict):
        return jsonify({"status": "error", "message": "schema must be an object."}), 400
    if not isinstance(current_entry, dict):
        return jsonify({"status": "error", "message": "currentEntry must be an object."}), 400
    if not isinstance(brief, dict):
        return jsonify({"status": "error", "message": "brief must be an object."}), 400
    if output_kind not in ("patch", "bundle"):
        return jsonify({"status": "error", "message": "outputKind must be patch or bundle."}), 400

    suggestions = provider(payload)
    safe_suggestions = []
    for suggestion in suggestions:
        if not isinstance(suggestion, dict):
            continue
        patch = suggestion.get("patch")
        if isinstance(patch, dict) and isinstance(patch.get("patch"), dict):
            patch["patch"] = _schema_filter_patch(schema, patch["patch"])
        safe_suggestions.append(suggestion)

    return jsonify({
        "status": "ok",
        "provider": "backend-ai",
        "suggestions": safe_suggestions,
    })
