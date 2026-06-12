# backend/app/routes/r_bulk_export.py
from flask import Blueprint, Response, abort, send_file
from backend.app.db.init_db import get_db_session
from backend.app.models import ALL_MODELS
from backend.app.utils.csv_tools import AUTHORING_ONLY_TABLES, build_csv_rows
import csv
import zipfile
import tempfile
import os

bp = Blueprint("bulk_export", __name__)


def _export_all_csv_zip(mode: str, download_name: str):
    session = get_db_session()
    temp_dir = tempfile.mkdtemp()
    csv_files = []
    try:
        # Write each table to a CSV file in temp_dir
        for model_class in ALL_MODELS:
            table_name = getattr(model_class, "__tablename__", None)
            if not table_name:
                continue
            if mode == "ue" and table_name in AUTHORING_ONLY_TABLES:
                continue
            rows = session.query(model_class).all()
            csv_path = os.path.join(temp_dir, f"{table_name}.csv")
            with open(csv_path, "w", newline='', encoding="utf-8") as f:
                columns, data_rows = build_csv_rows(table_name, model_class, rows, mode=mode)
                writer = csv.writer(f)
                writer.writerow(columns)
                writer.writerows(data_rows)
            csv_files.append(csv_path)
        # Create zip
        zip_path = os.path.join(temp_dir, "all_tables.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for file_path in csv_files:
                zipf.write(file_path, os.path.basename(file_path))
        # Send zip
        return send_file(zip_path, mimetype="application/zip", as_attachment=True, download_name=download_name)
    finally:
        # Clean up temp files after request is done
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


@bp.route("/api/export/all-csv-zip", methods=["GET"])
@bp.route("/api/export/ue/all-csv-zip", methods=["GET"])
def export_all_ue_csv_zip():
    return _export_all_csv_zip(mode="ue", download_name="soa_ue_tables.zip")


@bp.route("/api/source/export/all-csv-zip", methods=["GET"])
def export_all_source_csv_zip():
    return _export_all_csv_zip(mode="source", download_name="soa_source_tables.zip")
