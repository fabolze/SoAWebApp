# backend/app/routes/r_export.py
from flask import Blueprint, Response, abort, request, jsonify
from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
from sqlalchemy.types import Enum as SAEnum, JSON as SAJSON
import csv
import enum
import io
import json

bp = Blueprint("export", __name__)


def _ordered_columns(model_class):
    columns = [c.name for c in model_class.__table__.columns]
    head = [c for c in ["id", "slug"] if c in columns]
    tail = [c for c in columns if c not in head]
    return head + tail


def _resolve_row_key(columns):
    if "slug" in columns:
        return "slug"
    if "id" in columns:
        return "id"
    return columns[0]


def _serialize_csv_cell(value):
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    if value is None:
        return ""
    return value


def _parse_import_cell(raw_value, column):
    if raw_value is None:
        return None
    if isinstance(raw_value, str):
        raw_value = raw_value.strip()
    if raw_value == "":
        return None

    if isinstance(column.type, SAEnum):
        enum_class = column.type.enum_class
        candidate = raw_value
        if isinstance(raw_value, str):
            # Accept common UE/Python enum text shapes:
            # - "Value"
            # - "EnumType.Value"
            # - "E_Enum::Value"
            candidate = raw_value.split("::")[-1].split(".")[-1]
        try:
            return enum_class(candidate)
        except Exception:
            try:
                return enum_class[str(candidate)]
            except Exception:
                # UE UserDefinedEnum CSV exports can use internal names like NewEnumerator3.
                if isinstance(candidate, str) and candidate.startswith("NewEnumerator"):
                    try:
                        idx = int(candidate.replace("NewEnumerator", ""))
                        members = list(enum_class)
                        if 0 <= idx < len(members):
                            return members[idx]
                    except Exception:
                        pass
                return raw_value

    if isinstance(column.type, SAJSON) and isinstance(raw_value, str):
        try:
            return json.loads(raw_value)
        except Exception:
            return raw_value

    return raw_value

@bp.route("/api/export/csv/<table_name>", methods=["GET"])
def export_csv(table_name):
    session = get_db_session()
    # Find model class by __tablename__
    model_class = next((m for m in ALL_MODELS if getattr(m, "__tablename__", None) == table_name), None)
    if model_class is None:
        abort(404, description=f"Table '{table_name}' not found.")
    rows = session.query(model_class).all()
    columns = _ordered_columns(model_class)
    row_key = _resolve_row_key(columns)
    output = io.StringIO()
    writer = csv.writer(output)
    # Canonical UE export format: first column is DataTable row key.
    writer.writerow(["Name", *columns])
    for row in rows:
        serialized = [_serialize_csv_cell(getattr(row, col)) for col in columns]
        writer.writerow([_serialize_csv_cell(getattr(row, row_key)), *serialized])
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
    model_columns = {c.name: c for c in model_class.__table__.columns}
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
            clean_row = {}
            for key, value in row.items():
                if not key or key not in model_columns:
                    continue
                clean_row[key] = _parse_import_cell(value, model_columns[key])
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
