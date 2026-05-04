# backend/app/routes/r_export.py
from flask import Blueprint, Response, abort, request, jsonify
from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
from backend.app.routes.base_route import ROUTE_REGISTRY
from backend.app.utils.csv_tools import (
    UE_ROW_KEY_HEADER,
    build_csv_rows,
    write_csv_string,
    coerce_row_from_schema,
    load_schema,
)
import json
import csv
import io

bp = Blueprint("export", __name__)


def _slugify(s: str) -> str:
    import re
    if not s:
        return ""
    s = s.strip().lower()
    s = re.sub(r"[\u0300-\u036f]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    s = re.sub(r"-{2,}", "-", s)
    return s


def _read_uploaded_csv():
    if 'file' not in request.files:
        return None, (jsonify({"error": "No file uploaded."}), 400)
    file = request.files['file']
    if not file:
        return None, (jsonify({"error": "Empty file."}), 400)
    stream = io.StringIO(file.stream.read().decode("utf-8-sig"))
    return list(csv.DictReader(stream)), None


def _coercion_warnings(table_name, raw_row, row_number):
    warnings = []
    schema = load_schema(table_name) or {}
    properties = schema.get("properties", {}) if isinstance(schema.get("properties"), dict) else {}
    for key, raw_value in raw_row.items():
        if not key or raw_value is None or str(raw_value).strip() == "":
            continue
        field_schema = properties.get(key)
        if not isinstance(field_schema, dict):
            continue
        field_type = field_schema.get("type")
        if field_type not in ("array", "object"):
            continue
        try:
            parsed = json.loads(str(raw_value).strip())
        except Exception:
            parsed = None
        if field_type == "object" and not isinstance(parsed, dict):
            warnings.append({"row": row_number, "field": key, "message": "Expected JSON object; value may import as a primitive string."})
        if field_type == "array" and parsed is None and "," not in str(raw_value):
            warnings.append({"row": row_number, "field": key, "message": "Expected JSON array or comma-separated values."})
    return warnings


def _normalize_import_row(table_name, model_class, route, raw_row, strict_json=False):
    clean_row = {k: v for k, v in raw_row.items() if k}
    clean_row = coerce_row_from_schema(table_name, clean_row, strict_json=strict_json)
    row_key_value = clean_row.get(UE_ROW_KEY_HEADER)
    if row_key_value is not None and str(row_key_value).strip() != "":
        if not clean_row.get("slug"):
            clean_row["slug"] = str(row_key_value).strip().lower()
    clean_row.pop(UE_ROW_KEY_HEADER, None)
    if hasattr(model_class, '__table__') and 'slug' in model_class.__table__.columns:
        if not clean_row.get('slug'):
            base = clean_row.get('name') or clean_row.get('title') or clean_row.get('id')
            clean_row['slug'] = _slugify(str(base))
        else:
            clean_row['slug'] = str(clean_row.get('slug') or '').strip().lower()
    item_id = str(route.get_id_from_data(clean_row) if route else clean_row.get("id", ""))
    return item_id, clean_row


def _public_value(value):
    try:
        json.dumps(value)
        return value
    except Exception:
        return str(value)

def _export_csv_response(table_name, mode):
    session = get_db_session()
    try:
        # Find model class by __tablename__
        model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
        if model_class is None:
            abort(404, description=f"Table '{table_name}' not found.")
        rows = session.query(model_class).all()
        columns, data_rows = build_csv_rows(table_name, model_class, rows, mode=mode)
        csv_content = write_csv_string(columns, data_rows)
        response = Response(csv_content, mimetype="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={table_name}.{mode}.csv"
        return response
    finally:
        session.close()


@bp.route("/api/export/csv/<table_name>", methods=["GET"])
@bp.route("/api/export/ue/csv/<table_name>", methods=["GET"])
def export_ue_csv(table_name):
    return _export_csv_response(table_name, mode="ue")


@bp.route("/api/source/export/csv/<table_name>", methods=["GET"])
def export_source_csv(table_name):
    return _export_csv_response(table_name, mode="source")


def _preview_import_csv(table_name, strict_json=False):
    session = get_db_session()
    try:
        model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
        if model_class is None:
            abort(404, description=f"Table '{table_name}' not found.")
        raw_rows, error_response = _read_uploaded_csv()
        if error_response:
            return error_response

        route = ROUTE_REGISTRY.get(table_name)
        existing_rows = session.query(model_class).all()
        serializer = getattr(route, "serialize_item", None) if route else None
        existing_by_id = {}
        for row in existing_rows:
            row_id = str(getattr(row, "id", ""))
            if not row_id:
                continue
            existing_by_id[row_id] = serializer(row) if serializer else {
                column.name: getattr(row, column.name, None)
                for column in model_class.__table__.columns
            }

        errors = []
        warnings = []
        changes = []
        imported_ids = set()
        added = updated = unchanged = 0

        for index, raw_row in enumerate(raw_rows or [], start=2):
            warnings.extend(_coercion_warnings(table_name, raw_row, index))
            try:
                item_id, clean_row = _normalize_import_row(table_name, model_class, route, raw_row, strict_json=strict_json)
            except Exception as exc:
                errors.append({"row": index, "message": f"Failed to parse row: {str(exc)}"})
                continue
            if not clean_row.get("id"):
                errors.append({"row": index, "message": "Missing required column 'id' or empty id value"})
                continue
            if item_id in imported_ids:
                errors.append({"row": index, "id": item_id, "message": f"Duplicate id in CSV import: {item_id}"})
                continue
            imported_ids.add(item_id)

            existing = existing_by_id.get(item_id)
            if existing is None:
                added += 1
                changes.append({"id": item_id, "action": "added", "after": {k: _public_value(v) for k, v in clean_row.items()}})
                continue

            field_changes = {}
            for key, next_value in clean_row.items():
                before_value = existing.get(key)
                if before_value != next_value:
                    field_changes[key] = {"before": _public_value(before_value), "after": _public_value(next_value)}
            if field_changes:
                updated += 1
                changes.append({"id": item_id, "action": "updated", "fields": field_changes})
            else:
                unchanged += 1

        deleted_ids = sorted(set(existing_by_id.keys()) - imported_ids)
        for stale_id in deleted_ids[:25]:
            changes.append({"id": stale_id, "action": "deleted", "before": existing_by_id.get(stale_id, {})})

        return jsonify({
            "status": "error" if errors else "ok",
            "table": table_name,
            "counts": {
                "added": added,
                "updated": updated,
                "deleted": len(deleted_ids) if not errors else 0,
                "unchanged": unchanged,
            },
            "errors": errors,
            "warnings": warnings,
            "changes": changes[:100],
        })
    finally:
        session.close()


@bp.route("/api/import/csv/<table_name>/preview", methods=["POST"])
def preview_import_csv(table_name):
    return _preview_import_csv(table_name, strict_json=False)


@bp.route("/api/source/import/csv/<table_name>/preview", methods=["POST"])
def preview_import_source_csv(table_name):
    return _preview_import_csv(table_name, strict_json=True)


def _import_csv(table_name, strict_json=False):
    session = get_db_session()
    try:
        model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
        if model_class is None:
            abort(404, description=f"Table '{table_name}' not found.")
        raw_rows, error_response = _read_uploaded_csv()
        if error_response:
            return error_response

        count = 0
        route = ROUTE_REGISTRY.get(table_name)
        imported_ids = set()
        existing_ids = {row[0] for row in session.query(model_class.id).all()}

        try:
            for row in raw_rows or []:
                item_id, clean_row = _normalize_import_row(table_name, model_class, route, row, strict_json=strict_json)

                # Validate id present
                if not clean_row.get("id"):
                    raise ValueError("Missing required column 'id' or empty id value")

                if item_id in imported_ids:
                    raise ValueError(f"Duplicate id in CSV import: {item_id}")
                imported_ids.add(item_id)

                if route:
                    obj = session.get(route.model, item_id) or route.model(id=item_id)
                    route.process_input_data(session, obj, clean_row)
                    route._normalize_common_fields(obj, clean_row)
                else:
                    obj = session.get(model_class, item_id) or model_class(id=item_id)
                    for key, value in clean_row.items():
                        if hasattr(obj, key):
                            setattr(obj, key, value)

                session.add(obj)
                count += 1

            # Replace-all semantics with ORM deletes (preserves relationship logic).
            stale_ids = existing_ids - imported_ids
            for stale_id in stale_ids:
                stale_obj = session.get(model_class, stale_id)
                if stale_obj is not None:
                    session.delete(stale_obj)

            session.commit()
        except Exception as e:
            session.rollback()
            return jsonify({"error": f"Import failed: {str(e)}"}), 400

        return jsonify({"status": "success", "imported": count, "deleted": len(existing_ids - imported_ids)})
    finally:
        session.close()


@bp.route("/api/import/csv/<table_name>", methods=["POST"])
def import_csv(table_name):
    return _import_csv(table_name, strict_json=False)


@bp.route("/api/source/import/csv/<table_name>", methods=["POST"])
def import_source_csv(table_name):
    return _import_csv(table_name, strict_json=True)
