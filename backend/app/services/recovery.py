from __future__ import annotations

import csv
import json
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable
from threading import RLock

from flask import Flask
from sqlalchemy import func, text

from backend.app.config import DATA_DIR, RECOVERY_STARTUP_IMPORT_MODE
from backend.app.db import init_db as db_runtime
from backend.app.models import ALL_MODELS
from backend.app.models.base import Base
from backend.app.utils.csv_tools import UE_ROW_KEY_HEADER, build_csv_rows, coerce_row_from_schema

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
    "ability_relations",
    "attribute_stat_links",
    "characterclasses",
    "locations",
    "location_routes",
    "travel_tuning",
    "characters",
    "character_story_profiles",
    "character_relationships",
    "combat_profiles",
    "interaction_profiles",
    "items",
    "item_stat_modifiers",
    "item_attribute_modifiers",
    "shops",
    "shops_inventory",
    "timelines",
    "story_arcs",
    "adventure_beats",
    "lore_entries",
    "quests",
    "dialogues",
    "dialogue_nodes",
    "encounters",
    "events",
    "character_story_beats",
    "adventure_beat_links",
    "location_pois",
    "location_encounter_tables",
    "route_event_bindings",
    "location_creative_briefs",
    "talent_trees",
    "talent_nodes",
    "talent_node_links",
    "creation_flow_manifests",
    "creation_flow_artifacts",
]

_last_startup_report: dict[str, Any] | None = None
_last_export_report: dict[str, Any] | None = None
_last_restore_report: dict[str, Any] | None = None
RECOVERY_STATE_PATH = DATA_DIR / ".recovery_state.json"
STARTUP_IMPORT_MODES = {"newer", "missing", "always", "off"}
_recovery_lock = RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def startup_import_mode() -> str:
    mode = str(RECOVERY_STARTUP_IMPORT_MODE or "newer").strip().lower()
    return mode if mode in STARTUP_IMPORT_MODES else "newer"


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


def preflight_source_csvs(source_dir: Path | None = None) -> dict[str, Any]:
    """Validate the complete source CSV set before a destructive rebuild."""
    directory = source_dir or DATA_DIR
    paths = collect_csv_paths(directory)
    model_map = _model_by_table()
    parsed_rows: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    final_ids: dict[str, set[str]] = {}
    errors: list[dict[str, Any]] = []

    for table_name in sorted(set(model_map) - set(paths)):
        errors.append({"table": table_name, "row": None, "field": None, "message": "Missing source CSV for rebuild."})

    for table_name, path in paths.items():
        model = model_map.get(table_name)
        if model is None:
            errors.append({"table": table_name, "row": None, "field": None, "message": "No model found for source CSV."})
            continue
        rows: list[tuple[int, dict[str, Any]]] = []
        ids: set[str] = set()
        try:
            with path.open("r", newline="", encoding="utf-8-sig") as handle:
                for row_number, raw_row in enumerate(csv.DictReader(handle), start=2):
                    try:
                        row = coerce_row_from_schema(table_name, {key: value for key, value in raw_row.items() if key}, strict_json=True)
                    except Exception as exc:
                        errors.append({"table": table_name, "row": row_number, "field": None, "message": f"Failed to parse row: {exc}"})
                        continue
                    row.pop(UE_ROW_KEY_HEADER, None)
                    item_id = str(row.get("id") or "").strip()
                    if not item_id:
                        errors.append({"table": table_name, "row": row_number, "field": "id", "message": "Missing required id."})
                        continue
                    if item_id in ids:
                        errors.append({"table": table_name, "row": row_number, "field": "id", "referenced_id": item_id, "message": f"Duplicate id: {item_id}"})
                        continue
                    ids.add(item_id)
                    rows.append((row_number, row))
        except Exception as exc:
            errors.append({"table": table_name, "row": None, "field": None, "message": f"Failed to read CSV: {exc}"})
        parsed_rows[table_name] = rows
        final_ids[table_name] = ids

    for table_name, rows in parsed_rows.items():
        model = model_map[table_name]
        for row_number, row in rows:
            for column in model.__table__.columns:
                value = row.get(column.name)
                if value in (None, ""):
                    continue
                for foreign_key in column.foreign_keys:
                    target_table = foreign_key.column.table.name
                    target_id = str(value)
                    if target_id not in final_ids.get(target_table, set()):
                        errors.append({
                            "table": table_name,
                            "row": row_number,
                            "field": column.name,
                            "referenced_id": target_id,
                            "message": f"Missing referenced {target_table}.id: {target_id}",
                        })

    faction_ids = final_ids.get("factions", set())
    nested_reputation = set()
    for row_number, requirement in parsed_rows.get("requirements", []):
        reputation_rows = requirement.get("min_faction_reputation") or []
        if not isinstance(reputation_rows, list):
            errors.append({"table": "requirements", "row": row_number, "field": "min_faction_reputation", "message": "Expected an array."})
            continue
        for index, reputation in enumerate(reputation_rows):
            field = f"min_faction_reputation[{index}].faction_id"
            if not isinstance(reputation, dict):
                errors.append({"table": "requirements", "row": row_number, "field": field, "message": "Expected an object."})
                continue
            faction_id = str(reputation.get("faction_id") or "").strip()
            minimum = reputation.get("min")
            if faction_id and minimum is not None:
                try:
                    nested_reputation.add((str(requirement.get("id")), faction_id, float(minimum)))
                except (TypeError, ValueError):
                    errors.append({"table": "requirements", "row": row_number, "field": f"min_faction_reputation[{index}].min", "message": "Minimum reputation must be numeric."})
            if not faction_id or faction_id not in faction_ids:
                errors.append({
                    "table": "requirements",
                    "row": row_number,
                    "field": field,
                    "referenced_id": faction_id,
                    "message": f"Missing referenced factions.id: {faction_id or '<empty>'}",
                })

    normalized_reputation = set()
    for row_number, row in parsed_rows.get("requirement_min_faction_reputation", []):
        if not row.get("requirement_id") or not row.get("faction_id") or row.get("min_value") is None:
            continue
        try:
            normalized_reputation.add((str(row.get("requirement_id")), str(row.get("faction_id")), float(row.get("min_value"))))
        except (TypeError, ValueError):
            errors.append({"table": "requirement_min_faction_reputation", "row": row_number, "field": "min_value", "message": "Minimum reputation must be numeric."})
    for requirement_id, faction_id, minimum in sorted(nested_reputation - normalized_reputation):
        errors.append({
            "table": "requirements",
            "row": None,
            "field": "min_faction_reputation",
            "referenced_id": faction_id,
            "message": f"Nested reputation entry is missing from requirement_min_faction_reputation CSV: {requirement_id}/{faction_id}/{minimum}",
        })
    for requirement_id, faction_id, minimum in sorted(normalized_reputation - nested_reputation):
        errors.append({
            "table": "requirement_min_faction_reputation",
            "row": None,
            "field": "faction_id",
            "referenced_id": faction_id,
            "message": f"Normalized reputation entry is missing from requirements CSV: {requirement_id}/{faction_id}/{minimum}",
        })

    return {
        "status": "error" if errors else "ok",
        "source_dir": str(directory),
        "tables": len(parsed_rows),
        "rows": sum(len(rows) for rows in parsed_rows.values()),
        "errors": errors,
    }


def foreign_key_integrity_errors() -> list[dict[str, Any]]:
    with db_runtime.get_engine().connect() as connection:
        return [
            {
                "table": row[0],
                "rowid": row[1],
                "parent": row[2],
                "foreign_key_index": row[3],
                "message": f"{row[0]} row {row[1]} references missing {row[2]} row.",
            }
            for row in connection.execute(text("PRAGMA foreign_key_check")).fetchall()
        ]


def csv_has_data_rows(path: Path) -> bool:
    try:
        with path.open("r", newline="", encoding="utf-8-sig") as handle:
            reader = csv.reader(handle)
            next(reader, None)
            return any(any(str(cell).strip() for cell in row) for row in reader)
    except Exception:
        return False


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


def _table_row_count(table_name: str) -> int | None:
    model = _model_by_table().get(table_name)
    if model is None:
        return None
    session = db_runtime.get_db_session()
    try:
        return int(session.query(func.count()).select_from(model).scalar() or 0)
    except Exception:
        return None
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
    only_empty_tables: bool = False,
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
        preflight = preflight_source_csvs(directory)
        report["preflight"] = preflight
        if preflight["status"] == "error":
            report["status"] = "error"
            report["message"] = "Recovery preflight failed; active database was not reset."
            report["errors"].extend(preflight["errors"])
            return report
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
        if only_empty_tables:
            row_count = _table_row_count(table_name)
            if row_count is None:
                table_report["status"] = "skipped"
                table_report["warnings"].append("No model found for table.")
                report["tables"].append(table_report)
                continue
            if row_count > 0:
                table_report["status"] = "skipped"
                table_report["warnings"].append("Table already has data.")
                report["tables"].append(table_report)
                continue
            if not csv_has_data_rows(path):
                table_report["status"] = "skipped"
                table_report["warnings"].append("CSV has no data rows.")
                report["tables"].append(table_report)
                continue

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
    elif reset_first:
        integrity_errors = foreign_key_integrity_errors()
        report["integrity"] = {"status": "error" if integrity_errors else "ok", "errors": integrity_errors}
        if integrity_errors:
            report["status"] = "error"
            report["message"] = "Recovery import completed, but database foreign-key integrity failed."
            report["errors"].extend(integrity_errors)
    elif only_empty_tables:
        imported_tables = [table for table in report["tables"] if table.get("status") == "success" and table.get("imported", 0) > 0]
        if imported_tables:
            report["message"] = "Partial recovery import completed for empty tables with source rows."
        else:
            report["status"] = "skipped"
            report["message"] = "Partial recovery import skipped: no empty tables with source rows."
    return report


def import_missing_source_csvs(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    return import_source_csvs(app, source_dir, reset_first=False, only_empty_tables=True)


def replace_tables_from_source_csvs(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    return import_source_csvs(app, source_dir, reset_first=False, only_empty_tables=False)


def _annotate_startup_report(report: dict[str, Any], mode: str, source_dir: Path) -> dict[str, Any]:
    sync_status = get_sync_status(source_dir)
    report["startup_import_mode"] = mode
    report["csv_newer_than_db"] = sync_status["csv_newer_than_db"]
    report["restore_recommended"] = sync_status["restore_recommended"]
    report["latest_csv_mtime"] = sync_status["latest_csv_mtime"]
    report["latest_csv_mtime_iso"] = sync_status["latest_csv_mtime_iso"]
    report["active_db_mtime"] = sync_status["active_db_mtime"]
    report["active_db_mtime_iso"] = sync_status["active_db_mtime_iso"]
    return report


def run_startup_recovery(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    global _last_startup_report
    directory = source_dir or DATA_DIR
    mode = startup_import_mode()
    database_empty = is_database_empty()

    if mode == "off":
        report = _empty_report("skipped", "Startup recovery import skipped: RECOVERY_STARTUP_IMPORT_MODE=off.", directory)
        report["database_empty"] = database_empty
    elif database_empty:
        report = import_source_csvs(app, directory, reset_first=False)
        report["database_empty"] = True
        if report.get("status") == "success":
            _write_recovery_state("startup_import", directory)
    elif mode == "always":
        report = replace_tables_from_source_csvs(app, directory)
        report["database_empty"] = False
        if report.get("status") == "success":
            _write_recovery_state("startup_replace_import", directory)
    elif mode == "newer" and get_sync_status(directory).get("restore_recommended"):
        report = replace_tables_from_source_csvs(app, directory)
        report["database_empty"] = False
        if report.get("status") == "success":
            _write_recovery_state("startup_newer_csv_import", directory)
    else:
        report = import_missing_source_csvs(app, directory)
        if report.get("status") == "success":
            _write_recovery_state("startup_partial_import", directory)
        report["database_empty"] = False

    _annotate_startup_report(report, mode, directory)
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
    report = staged_rebuild_database_from_source(app, source_dir or DATA_DIR)
    if report.get("status") == "success":
        _write_recovery_state("rebuild", source_dir or DATA_DIR)
    return report


def restore_database_from_source(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    global _last_restore_report
    report = staged_rebuild_database_from_source(app, source_dir or DATA_DIR)
    if report.get("status") == "success":
        _write_recovery_state("restore", source_dir or DATA_DIR)
    _last_restore_report = report
    return report


def staged_rebuild_database_from_source(app: Flask, source_dir: Path | None = None) -> dict[str, Any]:
    """Build a complete sibling SQLite database before replacing the active file."""
    directory = source_dir or DATA_DIR
    original_name = db_runtime.get_active_db_name()
    staging_name = f".{original_name}.staging-{uuid.uuid4().hex}"
    staging_path = db_runtime.get_db_path(staging_name)
    report = _empty_report("error", "Staged recovery rebuild failed.", directory)
    report.update({
        "staging_path": str(staging_path),
        "replacement_result": "not_attempted",
        "rollback_result": "not_required",
        "failure_phase": None,
    })

    with _recovery_lock:
        preflight = preflight_source_csvs(directory)
        report["preflight"] = preflight
        if preflight["status"] == "error":
            report["message"] = "Recovery preflight failed; active database was not reset or modified."
            report["errors"].extend(preflight["errors"])
            report["failure_phase"] = "preflight"
            return report

        try:
            staging_path.parent.mkdir(parents=True, exist_ok=True)
            staging_path.touch(exist_ok=False)
            db_runtime.switch_active_database(staging_name)
            db_runtime.init_db()
            report = import_source_csvs(app, directory, reset_first=False)
            report.update({
                "preflight": preflight,
                "staging_path": str(staging_path),
                "replacement_result": "not_attempted",
                "rollback_result": "not_required",
                "failure_phase": None,
            })
            if report.get("status") != "success":
                report["status"] = "error"
                report["message"] = "Staging import failed; active database was not modified."
                report["failure_phase"] = "import"
                return report
            integrity_errors = foreign_key_integrity_errors()
            report["integrity"] = {"status": "error" if integrity_errors else "ok", "errors": integrity_errors}
            if integrity_errors:
                report["status"] = "error"
                report["message"] = "Staging database failed foreign-key integrity; active database was not modified."
                report["errors"].extend(integrity_errors)
                report["failure_phase"] = "integrity"
                return report
        except Exception as error:
            report["status"] = "error"
            report["message"] = f"Staging rebuild failed: {error}"
            report["errors"].append({"table": None, "message": str(error)})
            report["failure_phase"] = report.get("failure_phase") or "staging"
            return report
        finally:
            if db_runtime.get_active_db_name() != original_name:
                try:
                    db_runtime.switch_active_database(original_name)
                    report["rollback_result"] = "runtime_restored"
                except Exception as error:
                    report["rollback_result"] = f"runtime_restore_failed: {error}"
            if report.get("status") != "success" and staging_path.exists():
                try:
                    staging_path.unlink()
                except Exception:
                    pass

        try:
            db_runtime.replace_active_database_file(staging_path, original_name)
            report["replacement_result"] = "replaced"
            report["rollback_result"] = "not_required"
            report["status"] = "success"
            report["message"] = "Staging database passed validation and atomically replaced the active database."
            return report
        except Exception as error:
            report["status"] = "error"
            report["message"] = f"Atomic database replacement failed: {error}"
            report["errors"].append({"table": None, "message": str(error)})
            report["replacement_result"] = "failed"
            report["failure_phase"] = "replacement"
            try:
                db_runtime.switch_active_database(original_name)
                report["rollback_result"] = "runtime_restored"
            except Exception as rollback_error:
                report["rollback_result"] = f"runtime_restore_failed: {rollback_error}"
            if staging_path.exists():
                try:
                    staging_path.unlink()
                except Exception:
                    pass
            return report


def get_recovery_status() -> dict[str, Any]:
    sync_status = get_sync_status(DATA_DIR)
    return {
        "active_db": f"{db_runtime.get_active_db_name()}.sqlite",
        "source_dir": str(DATA_DIR),
        "startup_import_mode": startup_import_mode(),
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
        elif table.get("status") == "skipped":
            reason = "; ".join(table.get("warnings", [])) or "skipped"
            print(f"  {table.get('table')}: skipped - {reason}")
        else:
            print(f"  {table.get('table')}: failed - {'; '.join(table.get('errors', []))}")
