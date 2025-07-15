# backend/app/routes/r_bulk_export.py
from flask import Blueprint, Response, abort, send_file
from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
import csv
import io
import zipfile
import tempfile
import os

bp = Blueprint("bulk_export", __name__)

@bp.route("/api/export/all-csv-zip", methods=["GET"])
def export_all_csv_zip():
    session = get_db_session()
    temp_dir = tempfile.mkdtemp()
    csv_files = []
    try:
        # Write each table to a CSV file in temp_dir
        for model_class in ALL_MODELS:
            table_name = getattr(model_class, "__tablename__", None)
            if not table_name:
                continue
            rows = session.query(model_class).all()
            columns = [c.name for c in model_class.__table__.columns]
            csv_path = os.path.join(temp_dir, f"{table_name}.csv")
            with open(csv_path, "w", newline='', encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(columns)
                for row in rows:
                    writer.writerow([getattr(row, col) for col in columns])
            csv_files.append(csv_path)
        # Create zip
        zip_path = os.path.join(temp_dir, "all_tables.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path in csv_files:
                zipf.write(file_path, os.path.basename(file_path))
        # Send zip
        return send_file(zip_path, mimetype="application/zip", as_attachment=True, download_name="all_tables.zip")
    finally:
        # Clean up temp files after request is done
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
