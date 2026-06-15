from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_adventure_narrative import AdventureBeat, AdventureBeatLink
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_adventure_narrative import adventure_beat_link_route, adventure_beat_route
from backend.app.services.adventure_timeline import build_adventure_timeline


bp = Blueprint("ui_adventure_timeline", __name__)


@bp.get("/api/ui/adventure-timeline")
def get_adventure_timeline():
    db_session = get_db_session()
    try:
        return jsonify(build_adventure_timeline(db_session))
    finally:
        db_session.close()


def _columns(model):
    return {
        column.name: getattr(getattr(model, column.name), "value", getattr(model, column.name))
        for column in model.__table__.columns
    }


def _require_rows(payload, key):
    rows = payload.get(key, [])
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        abort(400, description=f"{key} must be an array of objects")
    ids = [row.get("id") for row in rows]
    if any(not isinstance(item_id, str) or not item_id for item_id in ids):
        abort(400, description=f"{key} entries require id")
    if len(ids) != len(set(ids)):
        abort(400, description=f"{key} contains duplicate ids")
    return rows


def _upsert(db_session, route, model, data, path):
    try:
        item = db_session.get(model, data["id"]) or model(id=data["id"])
        route.validate_required_fields(data, route.get_schema_required_fields())
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _review_change(review, category, table, item_id):
    review[category].append({"table": table, "id": item_id})


def _reconcile(db_session, payload):
    if not isinstance(payload, dict):
        abort(400, description="request body must be an object")
    beat_rows = _require_rows(payload, "adventure_beats")
    link_rows = _require_rows(payload, "adventure_beat_links")
    review = {"created": [], "changed": [], "deleted": []}

    for index, data in enumerate(beat_rows):
        existing = db_session.get(AdventureBeat, data["id"])
        if existing and data.get("expected_previous") is not None and data["expected_previous"] != _columns(existing):
            abort(400, description=f"adventure_beats[{index}].expected_previous is stale")
        item = _upsert(db_session, adventure_beat_route, AdventureBeat, data, f"adventure_beats[{index}]")
        _review_change(review, "changed" if existing else "created", "adventure_beats", item.id)

    for index, data in enumerate(link_rows):
        existing = db_session.get(AdventureBeatLink, data["id"])
        if existing and data.get("expected_previous") is not None and data["expected_previous"] != _columns(existing):
            abort(400, description=f"adventure_beat_links[{index}].expected_previous is stale")
        item = _upsert(
            db_session,
            adventure_beat_link_route,
            AdventureBeatLink,
            data,
            f"adventure_beat_links[{index}]",
        )
        _review_change(review, "changed" if existing else "created", "adventure_beat_links", item.id)

    deletions = payload.get("deletions", {})
    if not isinstance(deletions, dict):
        abort(400, description="deletions must be an object")
    delete_models = {
        "adventure_beat_links": AdventureBeatLink,
        "adventure_beats": AdventureBeat,
    }
    unsupported = set(deletions) - set(delete_models)
    if unsupported:
        abort(400, description=f"unsupported deletions: {', '.join(sorted(unsupported))}")
    for key in ["adventure_beat_links", "adventure_beats"]:
        ids = deletions.get(key, [])
        if not isinstance(ids, list) or any(not isinstance(item_id, str) for item_id in ids):
            abort(400, description=f"deletions.{key} must be an array of IDs")
        for item_id in ids:
            item = db_session.get(delete_models[key], item_id)
            if item:
                db_session.delete(item)
                _review_change(review, "deleted", key, item_id)
    db_session.flush()

    packet = build_adventure_timeline(db_session)
    return {
        "review": review,
        "warnings": packet["health"]["warnings"],
        "blockers": [],
    }, packet


@bp.post("/api/ui/adventure-timeline/preview")
def preview_adventure_timeline():
    db_session = get_db_session()
    try:
        result, _ = _reconcile(db_session, deepcopy(request.get_json(silent=True)))
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/adventure-timeline/bundle")
def save_adventure_timeline():
    db_session = get_db_session()
    try:
        result, packet = _reconcile(db_session, request.get_json(silent=True))
        db_session.commit()
        return jsonify({"result": result, "packet": packet})
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
