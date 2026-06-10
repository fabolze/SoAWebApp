import re

from flask import jsonify
from werkzeug.exceptions import HTTPException


class BundleValidationError(ValueError):
    def __init__(self, path: str, message: str):
        super().__init__(message)
        self.path = path
        self.message = message


def error_message(error: Exception) -> str:
    if isinstance(error, HTTPException):
        return str(error.description)
    return str(error)


def infer_error_path(message: str) -> str:
    candidates = re.findall(r"[a-z][a-z0-9_]*(?:\[\d+\])?(?:\.[a-z][a-z0-9_]*(?:\[\d+\])?)*", message)
    bundle_roots = {
        "character", "combat_profile", "interaction_profile", "encounters", "locations", "routes", "pois",
        "encounter_tables", "route_event_bindings", "travel_tuning", "creative_briefs", "dialogue", "nodes", "deletions",
        "encounter", "requirement", "placements",
    }
    rooted = [candidate for candidate in candidates if candidate.split(".", 1)[0].split("[", 1)[0] in bundle_roots]
    if rooted:
        return rooted[0]
    preferred = [
        candidate
        for candidate in candidates
        if "." in candidate or "[" in candidate or "_" in candidate
    ]
    return preferred[0] if preferred else ""


def wrap_bundle_error(path: str, error: Exception) -> BundleValidationError:
    message = error_message(error)
    inferred = infer_error_path(message)
    if inferred == path or inferred.startswith(f"{path}.") or inferred.startswith(f"{path}["):
        return BundleValidationError(inferred, message)
    return BundleValidationError(f"{path}.{inferred}" if inferred else path, message)


def bundle_error_response(error: Exception):
    if isinstance(error, BundleValidationError):
        path = error.path
        message = error.message
    else:
        message = error_message(error)
        path = infer_error_path(message)
    return jsonify({
        "error": True,
        "message": message,
        "path": path,
        "status": 400,
        "type": error.__class__.__name__,
    }), 400
