from flask import Blueprint, current_app, jsonify

from backend.app.services import recovery

bp = Blueprint("recovery", __name__)


@bp.route("/api/recovery/export-source", methods=["POST"])
def export_recovery_source():
    report = recovery.export_source_csvs()
    status_code = 500 if report.get("status") == "error" else 200
    return jsonify(report), status_code


@bp.route("/api/recovery/status", methods=["GET"])
def recovery_status():
    return jsonify(recovery.get_recovery_status())


@bp.route("/api/recovery/restore-source", methods=["POST"])
def restore_recovery_source():
    report = recovery.restore_database_from_source(current_app)
    return jsonify(report), 500 if report.get("status") in ("error", "warning") else 200


@bp.route("/api/recovery/import-source", methods=["POST"])
def import_recovery_source():
    report = recovery.replace_tables_from_source_csvs(current_app)
    return jsonify(report), 500 if report.get("status") in ("error", "warning") else 200
