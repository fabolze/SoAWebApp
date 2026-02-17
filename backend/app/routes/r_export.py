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
)
import csv
import io

bp = Blueprint("export", __name__)

@bp.route("/api/export/csv/<table_name>", methods=["GET"])
def export_csv(table_name):
    session = get_db_session()
    try:
        # Find model class by __tablename__
        model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
        if model_class is None:
            abort(404, description=f"Table '{table_name}' not found.")
        rows = session.query(model_class).all()
        columns, data_rows = build_csv_rows(table_name, model_class, rows)
        csv_content = write_csv_string(columns, data_rows)
        response = Response(csv_content, mimetype="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={table_name}.csv"
        return response
    finally:
        session.close()

@bp.route("/api/import/csv/<table_name>", methods=["POST"])
def import_csv(table_name):
    session = get_db_session()
    try:
        model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
        if model_class is None:
            abort(404, description=f"Table '{table_name}' not found.")
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded."}), 400
        file = request.files['file']
        if not file:
            return jsonify({"error": "Empty file."}), 400

        stream = io.StringIO(file.stream.read().decode("utf-8"))
        reader = csv.DictReader(stream)

        # Simple slugify fallback if missing
        import re
        def slugify(s: str) -> str:
            if not s:
                return ""
            s = s.strip().lower()
            s = re.sub(r"[\u0300-\u036f]", "", s)
            s = re.sub(r"[^a-z0-9]+", "-", s)
            s = re.sub(r"^-+|-+$", "", s)
            s = re.sub(r"-{2,}", "-", s)
            return s

        count = 0
        route = ROUTE_REGISTRY.get(table_name)
        imported_ids = set()
        existing_ids = {row[0] for row in session.query(model_class.id).all()}

        try:
            for row in reader:
                clean_row = {k: v for k, v in row.items() if k}
                clean_row = coerce_row_from_schema(table_name, clean_row)

                row_key_value = clean_row.get(UE_ROW_KEY_HEADER)
                if row_key_value is not None and str(row_key_value).strip() != "":
                    if not clean_row.get("slug"):
                        clean_row["slug"] = str(row_key_value).strip().lower()
                clean_row.pop(UE_ROW_KEY_HEADER, None)

                # Validate id present
                if not clean_row.get("id"):
                    raise ValueError("Missing required column 'id' or empty id value")

                item_id = str(route.get_id_from_data(clean_row) if route else clean_row["id"])
                if item_id in imported_ids:
                    raise ValueError(f"Duplicate id in CSV import: {item_id}")
                imported_ids.add(item_id)

                # If model has a slug column and it's missing/empty, derive from name/title/id
                if hasattr(model_class, '__table__') and 'slug' in model_class.__table__.columns:
                    if not clean_row.get('slug'):
                        base = clean_row.get('name') or clean_row.get('title') or clean_row.get('id')
                        clean_row['slug'] = slugify(str(base))
                    else:
                        clean_row['slug'] = str(clean_row.get('slug') or '').strip().lower()

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
