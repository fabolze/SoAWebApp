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
    count = 0
    try:
        # Start transaction
        session.query(model_class).delete()
        for row in reader:
            clean_row = {k: v for k, v in row.items() if k}
            obj = model_class(**clean_row)
            session.add(obj)
            count += 1
        session.commit()
    except Exception as e:
        session.rollback()
        return jsonify({"error": f"Import failed: {str(e)}"}), 400
    return jsonify({"status": "success", "imported": count})
