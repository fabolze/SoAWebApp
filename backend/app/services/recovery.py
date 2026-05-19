from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from flask import Flask
from sqlalchemy import func

from backend.app.config import DATA_DIR
from backend.app.db import init_db as db_runtime
from backend.app.models import ALL_MODELS
from backend.app.models.base import Base
from backend.app.utils.csv_tools import build_csv_rows

RECOVERY_IMPORT_ORDER = [
    "content_packs",
    "stats",
    "attributes",
    "statuses",
    "currencies",
    "factions",
    "flags",
    "requirements",
    "requirement_required_flags",
    "requirement_forbidden_flags",
    "requirement_min_faction_reputation",
    "effects",
    "abilities",
    "ability_effect_links",
    "ability_scaling_links",
    "attribute_stat_links",
    "characterclasses",
    "locations",
    "location_routes",
    "characters",
    "combat_profiles",
    "interaction_profiles",
    "items",
    "item_stat_modifiers",
    "item_attribute_modifiers",
    "shops",
    "shops_inventory",
    "timelines",
    "story_arcs",
    "lore_entries",
    "quests",
    "dialogues",
    "dialogue_nodes",
    "encounters",
    "events",
    "talent_trees",
    "talent_nodes",
    "talent_node_links",
]

_last_startup_report: dict[str, Any] | None = None
_last_export_report: dict[str, Any] | None = None
_last_restore_report: dict[str, Any] | None = None
RECOVERY_STATE_PATH = DATA_DIR / ".recovery_state.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_from_mtime(mtime: float | None) -> str | None:
    if mtime is None:
        return None
    return datetime.fromtimestamp(mtime, timezone.utc).isoformat()


def _model_by_table() -> dict[str, Any]:
    return {
        getattr(model, "__tablename__", ""): model
        for model in ALL_MODELS
        if getattr(model, "__tablename__", None)
    }


def _csv_table_name(path: Path) -> str:
    name = path.stem
    if name.endswith("_seed"):
        name = name[: -len("_seed")]
    if name.endswith(".source"):
        name = name[: -len(".source")]
    return name


def collect_csv_paths(source_dir: Path | None = None) -> dict[str, Path]:
    directory = source_dir or DATA_DIR
    paths: dict[str, Path] = {}
    if not directory.exists():
        return paths
    for path in directory.glob("*.csv"):
        paths[_csv_table_name(path)] = path
    return paths


def latest_recovery_csv_mtime(source_dir: Path | None = None) -> float | None:
    paths = collect_csv_paths(source_dir)
    mtimes = [path.stat().st_mtime for path in paths.values() if path.exists()]
    return max(mtimes) if mtimes else None


def active_db_path() -> Path:
    return db_runtime.get_db_path(db_runtime.get_active_db_name())


def active_db_mtime() -> float | None:
    path = active_db_path()
    return path.stat().st_mtime if path.exists() else None


def _read_recovery_state() -> dict[str, Any]:
    try:
        with RECOVERY_STATE_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _is_default_source_dir(source_dir: Path | None = None) -> bool:
    try:
        return (source_dir or DATA_DIR).resolve() == DATA_DIR.resolve()
    except Exception:
        return False


def _write_recovery_state(operation: str, source_dir: Path | None = None) -> None:
    if not _is_default_source_dir(source_dir):
        return
    latest_csv_mtime = latest_recovery_csv_mtime(source_dir)
    payload = {
        "operation": operation,
        "timestamp": _now_iso(),
        "active_db": f"{db_runtime.get_active_db_name()}.sqlite",
        "active_db_path": str(active_db_path()),
        "source_dir": str(source_dir or DATA_DIR),
        "latest_csv_mtime": latest_csv_mtime,
        "latest_csv_mtime_iso": _iso_from_mtime(latest_csv_mtime),
    }
    try:
        RECOVERY_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with RECOVERY_STATE_PATH.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
    except Exception:
        pass


def get_sync_status(source_dir: Path | None = None) -> dict[str, Any]:
    database_empty = is_database_empty()
    csv_mtime = latest_recovery_csv_mtime(source_dir)
    db_mtime = active_db_mtime()
    csv_newer_than_db = bool(csv_mtime is not None and db_mtime is not None and csv_mtime > db_mtime)
    state = _read_recovery_state()
    state_mtime = state.get("latest_csv_mtime")
    marker_matches_csv = (
        isinstance(state_mtime, (int, float))
        and csv_mtime is not None
        and abs(float(state_mtime) - csv_mtime) < 0.001
        and state.get("active_db") == f"{db_runtime.get_active_db_name()}.sqlite"
    )
    restore_recommended = bool(not database_empty and csv_newer_than_db and not marker_matches_csv)
    return {
        "active_db": f"{db_runtime.get_active_db_name()}.sqlite",
        "active_db_path": str(active_db_path()),
        "active_db_mtime": db_mtime,
        "active_db_mtime_iso": _iso_from_mtime(db_mtime),
        "latest_csv_mtime": csv_mtime,
        "latest_csv_mtime_iso": _iso_from_mtime(csv_mtime),
        "csv_newer_than_db": csv_newer_than_db,
        "database_empty": database_empty,
        "restore_recommended": restore_recommended,
        "local_recovery_state": state,
    }


def ordered_tables(existing_tables: Iterable[str]) -> tuple[list[str], list[str]]:
    existing = set(existing_tables)
    ordered = [table for table in RECOVERY_IMPORT_ORDER if table in existing]
    unordered = sorted(existing - set(ordered))
    ordered.extend(unordered)
    return ordered, unordered


def is_database_empty() -> bool:
    session = db_runtime.get_db_session()
    try:
        for model in ALL_MODELS:
            table_name = getattr(model, "__tablename__", None)
            if not table_name:
                continue
            try:
                count = session.query(func.count()).select_from(model).scalar() or 0
            except Exception:
                continue
            if count > 0:
                return False
        return True
    finally:
        session.close()


def _empty_report(status: str, message: str, source_dir: Path) -> dict[str, Any]:
    return {
        "status": status,
        "message": message,
        "timestamp": _now_iso(),
        "active_db": f"{db_runtime.get_active_db_name()}.sqlite",
        "source_dir": str(source_dir),
        "database_empty": None,
        "tables": [],
        "warnings": [],
        "errors": [],
    }


def import_source_csvs(
    app: Flask,
    source_dir: Path | None = None,
    *,
    reset_first: bool = False,
) -> dict[str, Any]:
    directory = source_dir or DATA_DIR
    paths = collect_csv_paths(directory)
    report = _empty_report("success", "Recovery import completed.", directory)
    report["database_empty"] = is_database_empty()

    if not paths:
        report["status"] = "skipped"
        report["message"] = f"No CSV files found in {directory}."
        return report

    tables, unordered = ordered_tables(paths.keys())
    if unordered:
        report["warnings"].append({
            "message": "Some CSV files are not in the canonical recovery order and were imported alphabetically afterward.",
            "tables": unordered,
        })

    client = app.test_client()
    if reset_first:
        reset = client.post("/api/db/reset")
        if reset.status_code >= 400:
            report["status"] = "error"
            report["message"] = "Database reset failed before recovery import."
            report["errors"].append({"table": None, "message": reset.get_data(as_text=True)})
            return report

    for table_name in tables:
        path = paths[table_name]
        table_report: dict[str, Any] = {
            "table": table_name,
            "file": str(path),
            "imported": 0,
            "deleted": 0,
            "status": "success",
            "warnings": [],
            "errors": [],
        }
        try:
            with path.open("rb") as handle:
                response = client.post(
                    f"/api/source/import/csv/{table_name}",
                    data={"file": (BytesIO(handle.read()), path.name)},
                    content_type="multipart/form-data",
                )
            payload = response.get_json(silent=True) or {}
            if response.status_code >= 400:
                table_report["status"] = "error"
                table_report["errors"].append(payload.get("error") or response.get_data(as_text=True))
                report["errors"].append({"table": table_name, "message": table_report["errors"][0]})
            else:
                table_report["imported"] = payload.get("imported", 0)
                table_report["deleted"] = payload.get("deleted", 0)
        except Exception as exc:
            table_report["status"] = "error"
            table_report["errors"].append(str(exc))
            report["errors"].append({"table": table_name, "message": str(exc)})
        report["tables"].append(table_report)

    if report["errors"]:
        report["status"] = "warning"
        report["message"] = "Recovery import completed with failures."
    return report


def run_startup_recovery(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    global _last_startup_report
    directory = source_dir or DATA_DIR
    database_empty = is_database_empty()
    if not database_empty:
        report = _empty_report("skipped", "Recovery import skipped: database not empty.", directory)
        report["database_empty"] = False
    else:
        report = import_source_csvs(app, directory, reset_first=False)
        report["database_empty"] = True
        if report.get("status") == "success":
            _write_recovery_state("startup_import", directory)
    _last_startup_report = report
    print_recovery_report("Startup recovery", report)
    return report


def export_source_csvs(output_dir: Path | None = None) -> dict[str, Any]:
    global _last_export_report
    directory = output_dir or DATA_DIR
    directory.mkdir(parents=True, exist_ok=True)
    model_map = _model_by_table()
    tables, unordered = ordered_tables(model_map.keys())
    session = db_runtime.get_db_session()
    report = {
        "status": "success",
        "message": "Recovery source CSV export completed.",
        "timestamp": _now_iso(),
        "active_db": f"{db_runtime.get_active_db_name()}.sqlite",
        "source_dir": str(directory),
        "tables": [],
        "warnings": [],
        "errors": [],
    }
    if unordered:
        report["warnings"].append({
            "message": "Some database tables are not in the canonical recovery order and were exported alphabetically afterward.",
            "tables": unordered,
        })
    try:
        for table_name in tables:
            model_class = model_map[table_name]
            table_report: dict[str, Any] = {
                "table": table_name,
                "file": str(directory / f"{table_name}_seed.csv"),
                "rows": 0,
                "status": "success",
                "errors": [],
            }
            try:
                rows = session.query(model_class).all()
                columns, data_rows = build_csv_rows(table_name, model_class, rows, mode="source")
                with (directory / f"{table_name}_seed.csv").open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.writer(handle)
                    writer.writerow(columns)
                    writer.writerows(data_rows)
                table_report["rows"] = len(data_rows)
            except Exception as exc:
                table_report["status"] = "error"
                table_report["errors"].append(str(exc))
                report["errors"].append({"table": table_name, "message": str(exc)})
            report["tables"].append(table_report)
    finally:
        session.close()

    if report["errors"]:
        report["status"] = "error"
        report["message"] = "Recovery source CSV export completed with failures."
    else:
        _write_recovery_state("export", directory)
    _last_export_report = report
    return report


def reset_database() -> None:
    engine = db_runtime.get_engine()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def rebuild_database_from_source(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    report = import_source_csvs(app, source_dir or DATA_DIR, reset_first=True)
    if report.get("status") == "success":
        _write_recovery_state("rebuild", source_dir or DATA_DIR)
    return report


def restore_database_from_source(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    global _last_restore_report
    report = import_source_csvs(app, source_dir or DATA_DIR, reset_first=True)
    if report.get("status") == "success":
        _write_recovery_state("restore", source_dir or DATA_DIR)
    _last_restore_report = report
    return report


def get_recovery_status() -> dict[str, Any]:
    sync_status = get_sync_status(DATA_DIR)
    return {
        "active_db": f"{db_runtime.get_active_db_name()}.sqlite",
        "source_dir": str(DATA_DIR),
        "sync": sync_status,
        "latest_csv_mtime": sync_status["latest_csv_mtime"],
        "latest_csv_mtime_iso": sync_status["latest_csv_mtime_iso"],
        "active_db_mtime": sync_status["active_db_mtime"],
        "active_db_mtime_iso": sync_status["active_db_mtime_iso"],
        "csv_newer_than_db": sync_status["csv_newer_than_db"],
        "restore_recommended": sync_status["restore_recommended"],
        "last_startup_import": _last_startup_report,
        "last_export": _last_export_report,
        "last_restore": _last_restore_report,
    }


def print_recovery_report(title: str, report: dict[str, Any]) -> None:
    print(f"{title}: {report.get('status')} - {report.get('message')}")
    for warning in report.get("warnings", []):
        print(f"  warning: {warning.get('message')}")
    for table in report.get("tables", []):
        if table.get("status") == "success":
            if "imported" in table:
                print(f"  {table.get('table')}: imported={table.get('imported', 0)} deleted={table.get('deleted', 0)}")
            else:
                print(f"  {table.get('table')}: rows={table.get('rows', 0)}")
        else:
            print(f"  {table.get('table')}: failed - {'; '.join(table.get('errors', []))}")
