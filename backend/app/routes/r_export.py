# backend/app/routes/r_export.py
from flask import Blueprint, Response, abort, request, jsonify
from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
import csv
import io

bp = Blueprint("export", __name__)

@bp.route("/api/export/csv/<table_name>", methods=["GET"])
def export_csv(table_name):
    session = get_db_session()
    # Find model class by __tablename__
    model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
    if model_class is None:
        abort(404, description=f"Table '{table_name}' not found.")
    rows = session.query(model_class).all()
    columns = [c.name for c in model_class.__table__.columns]
    # Ensure id and slug appear first if present
    def order(cols):
        head = [c for c in ["id", "slug"] if c in cols]
        tail = [c for c in cols if c not in head]
        return head + tail
    columns = order(columns)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([getattr(row, col) for col in columns])
    output.seek(0)
    response = Response(output.read(), mimetype="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={table_name}.csv"
    return response

@bp.route("/api/import/csv/<table_name>", methods=["POST"])
def import_csv(table_name):
    session = get_db_session()
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
    try:
        # Start transaction
        session.query(model_class).delete()
        for row in reader:
            clean_row = {k: v for k, v in row.items() if k}
            # Validate id present
            if not clean_row.get("id"):
                raise ValueError("Missing required column 'id' or empty id value")
            # If model has a slug column and it's missing/empty, derive from name/title/id
            if hasattr(model_class, '__table__') and 'slug' in model_class.__table__.columns:
                if not clean_row.get('slug'):
                    base = clean_row.get('name') or clean_row.get('title') or clean_row.get('id')
                    clean_row['slug'] = slugify(base)
            obj = model_class(**clean_row)
            session.add(obj)
            count += 1
        session.commit()
    except Exception as e:
        session.rollback()
        return jsonify({"error": f"Import failed: {str(e)}"}), 400
    return jsonify({"status": "success", "imported": count})
