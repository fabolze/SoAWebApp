from pathlib import Path

from flask import Flask

from backend.app.services import recovery
from backend.app.models.m_factions import Faction
from backend.app.models.m_requirements import Requirement, RequirementMinFactionReputation


def test_ordered_tables_uses_canonical_order_then_alphabetical_unknowns():
    ordered, unordered = recovery.ordered_tables({"items", "stats", "custom_b", "custom_a"})

    assert ordered == ["stats", "items", "custom_a", "custom_b"]
    assert unordered == ["custom_a", "custom_b"]


def test_world_building_recovery_tables_follow_dependencies():
    ordered, _unordered = recovery.ordered_tables({
        "locations",
        "location_routes",
        "items",
        "dialogues",
        "encounters",
        "events",
        "location_pois",
        "location_encounter_tables",
        "route_event_bindings",
        "travel_tuning",
        "location_creative_briefs",
    })

    position = {table: index for index, table in enumerate(ordered)}

    assert position["location_routes"] > position["locations"]
    assert position["travel_tuning"] > position["location_routes"]
    assert position["location_pois"] > position["items"]
    assert position["location_pois"] > position["dialogues"]
    assert position["location_pois"] > position["encounters"]
    assert position["location_pois"] > position["events"]
    assert position["location_encounter_tables"] > position["encounters"]
    assert position["route_event_bindings"] > position["location_routes"]
    assert position["route_event_bindings"] > position["events"]
    assert position["location_creative_briefs"] > position["locations"]


def test_collect_csv_paths_normalizes_seed_and_source_suffixes(tmp_path: Path):
    (tmp_path / "items_seed.csv").write_text("id\n", encoding="utf-8")
    (tmp_path / "stats.source.csv").write_text("id\n", encoding="utf-8")

    paths = recovery.collect_csv_paths(tmp_path)

    assert paths["items"].name == "items_seed.csv"
    assert paths["stats"].name == "stats.source.csv"


def test_startup_recovery_missing_mode_partially_imports_non_empty_database(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(recovery, "RECOVERY_STARTUP_IMPORT_MODE", "missing")
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)
    monkeypatch.setattr(recovery, "import_missing_source_csvs", lambda app, source_dir=None: {
        "status": "success",
        "message": "Partial recovery import completed for empty tables with source rows.",
        "database_empty": None,
        "tables": [],
        "warnings": [],
        "errors": [],
    })
    monkeypatch.setattr(recovery, "get_sync_status", lambda source_dir=None: {
        "csv_newer_than_db": False,
        "restore_recommended": False,
        "latest_csv_mtime": None,
        "latest_csv_mtime_iso": None,
        "active_db_mtime": None,
        "active_db_mtime_iso": None,
    })
    state_writes = []
    monkeypatch.setattr(recovery, "_write_recovery_state", lambda operation, source_dir=None: state_writes.append(operation))
    printed = []
    monkeypatch.setattr(recovery, "print_recovery_report", lambda title, report: printed.append((title, report)))

    report = recovery.run_startup_recovery(Flask(__name__), tmp_path)

    assert report["status"] == "success"
    assert report["database_empty"] is False
    assert "Partial recovery" in report["message"]
    assert state_writes == ["startup_partial_import"]
    assert printed[0][0] == "Startup recovery"


def test_startup_recovery_newer_mode_replaces_when_csvs_are_newer(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(recovery, "RECOVERY_STARTUP_IMPORT_MODE", "newer")
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)
    monkeypatch.setattr(recovery, "get_sync_status", lambda source_dir=None: {
        "csv_newer_than_db": True,
        "restore_recommended": True,
        "latest_csv_mtime": 200.0,
        "latest_csv_mtime_iso": "1970-01-01T00:03:20+00:00",
        "active_db_mtime": 100.0,
        "active_db_mtime_iso": "1970-01-01T00:01:40+00:00",
    })
    monkeypatch.setattr(recovery, "replace_tables_from_source_csvs", lambda app, source_dir=None: {
        "status": "success",
        "message": "Recovery import completed.",
        "database_empty": None,
        "tables": [{"table": "locations", "status": "success", "imported": 3, "deleted": 2}],
        "warnings": [],
        "errors": [],
    })
    state_writes = []
    monkeypatch.setattr(recovery, "_write_recovery_state", lambda operation, source_dir=None: state_writes.append(operation))
    monkeypatch.setattr(recovery, "print_recovery_report", lambda title, report: None)

    report = recovery.run_startup_recovery(Flask(__name__), tmp_path)

    assert report["status"] == "success"
    assert report["database_empty"] is False
    assert report["startup_import_mode"] == "newer"
    assert report["tables"][0]["table"] == "locations"
    assert state_writes == ["startup_newer_csv_import"]


def test_startup_recovery_off_mode_skips_import(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(recovery, "RECOVERY_STARTUP_IMPORT_MODE", "off")
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)
    monkeypatch.setattr(recovery, "get_sync_status", lambda source_dir=None: {
        "csv_newer_than_db": True,
        "restore_recommended": True,
        "latest_csv_mtime": 200.0,
        "latest_csv_mtime_iso": "1970-01-01T00:03:20+00:00",
        "active_db_mtime": 100.0,
        "active_db_mtime_iso": "1970-01-01T00:01:40+00:00",
    })
    monkeypatch.setattr(recovery, "print_recovery_report", lambda title, report: None)

    report = recovery.run_startup_recovery(Flask(__name__), tmp_path)

    assert report["status"] == "skipped"
    assert report["database_empty"] is False
    assert report["startup_import_mode"] == "off"


def test_import_missing_source_csvs_only_imports_empty_tables_with_rows(monkeypatch, tmp_path: Path):
    (tmp_path / "stats_seed.csv").write_text("id\nstat-1\n", encoding="utf-8")
    (tmp_path / "locations_seed.csv").write_text("id,slug,name\nloc-1,loc-1,Location\n", encoding="utf-8")
    (tmp_path / "items_seed.csv").write_text("id\n", encoding="utf-8")

    monkeypatch.setattr(recovery, "RECOVERY_IMPORT_ORDER", ["stats", "locations", "items"])
    monkeypatch.setattr(recovery, "_table_row_count", lambda table: {"stats": 2, "locations": 0, "items": 0}[table])
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)

    imported = []
    app = Flask(__name__)

    @app.post("/api/source/import/csv/<table_name>")
    def import_table(table_name):
        imported.append(table_name)
        return {"status": "success", "imported": 1, "deleted": 0}

    report = recovery.import_missing_source_csvs(app, tmp_path)

    statuses = {table["table"]: table["status"] for table in report["tables"]}
    assert report["status"] == "success"
    assert imported == ["locations"]
    assert statuses["stats"] == "skipped"
    assert statuses["locations"] == "success"
    assert statuses["items"] == "skipped"


def test_export_source_csvs_writes_reported_files(monkeypatch, tmp_path: Path):
    class DummyQuery:
        def all(self):
            return []

    class DummySession:
        def query(self, _model_class):
            return DummyQuery()

        def close(self):
            pass

    class DummyModel:
        __tablename__ = "stats"

        class __table__:
            columns = []

    monkeypatch.setattr(recovery, "ALL_MODELS", [DummyModel])
    monkeypatch.setattr(recovery.db_runtime, "get_db_session", lambda: DummySession())

    report = recovery.export_source_csvs(tmp_path)

    assert report["status"] == "success"
    assert report["tables"][0]["table"] == "stats"
    assert (tmp_path / "stats_seed.csv").exists()


def test_sync_status_recommends_restore_when_csv_newer_without_matching_marker(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)
    monkeypatch.setattr(recovery, "latest_recovery_csv_mtime", lambda source_dir=None: 200.0)
    monkeypatch.setattr(recovery, "active_db_mtime", lambda: 100.0)
    monkeypatch.setattr(recovery, "active_db_path", lambda: tmp_path / "db.sqlite")
    monkeypatch.setattr(recovery.db_runtime, "get_active_db_name", lambda: "db")
    monkeypatch.setattr(recovery, "_read_recovery_state", lambda: {})

    status = recovery.get_sync_status(tmp_path)

    assert status["csv_newer_than_db"] is True
    assert status["restore_recommended"] is True


def test_sync_status_does_not_recommend_restore_after_local_export_marker(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)
    monkeypatch.setattr(recovery, "latest_recovery_csv_mtime", lambda source_dir=None: 200.0)
    monkeypatch.setattr(recovery, "active_db_mtime", lambda: 100.0)
    monkeypatch.setattr(recovery, "active_db_path", lambda: tmp_path / "db.sqlite")
    monkeypatch.setattr(recovery.db_runtime, "get_active_db_name", lambda: "db")
    monkeypatch.setattr(recovery, "_read_recovery_state", lambda: {"active_db": "db.sqlite", "latest_csv_mtime": 200.0})

    status = recovery.get_sync_status(tmp_path)

    assert status["csv_newer_than_db"] is True
    assert status["restore_recommended"] is False


def _write_source_csv(path: Path, header: str, rows: list[str]):
    path.write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")


def _limit_preflight_to_reputation_tables(monkeypatch):
    monkeypatch.setattr(recovery, "_model_by_table", lambda: {
        "factions": Faction,
        "requirements": Requirement,
        "requirement_min_faction_reputation": RequirementMinFactionReputation,
    })


def test_source_preflight_validates_nested_and_normalized_faction_references(monkeypatch, tmp_path: Path):
    _limit_preflight_to_reputation_tables(monkeypatch)
    _write_source_csv(tmp_path / "factions_seed.csv", "Name,id,slug,name,alignment", ["guild,faction-1,guild,Guild,Friendly"])
    _write_source_csv(
        tmp_path / "requirements_seed.csv",
        "Name,id,slug,required_flags,forbidden_flags,min_faction_reputation,tags",
        ['gate,req-1,gate,[],[],\"[{\"\"faction_id\"\":\"\"faction-1\"\",\"\"min\"\":5}]\",[]'],
    )
    _write_source_csv(
        tmp_path / "requirement_min_faction_reputation_seed.csv",
        "Name,id,requirement_id,faction_id,min_value",
        ["gate-guild,rep-1,req-1,faction-1,5"],
    )

    report = recovery.preflight_source_csvs(tmp_path)

    assert report["status"] == "ok"
    assert report["errors"] == []


def test_source_preflight_reports_missing_faction_in_both_representations(monkeypatch, tmp_path: Path):
    _limit_preflight_to_reputation_tables(monkeypatch)
    _write_source_csv(tmp_path / "factions_seed.csv", "Name,id,slug,name,alignment", [])
    _write_source_csv(
        tmp_path / "requirements_seed.csv",
        "Name,id,slug,required_flags,forbidden_flags,min_faction_reputation,tags",
        ['gate,req-1,gate,[],[],\"[{\"\"faction_id\"\":\"\"missing\"\",\"\"min\"\":5}]\",[]'],
    )
    _write_source_csv(
        tmp_path / "requirement_min_faction_reputation_seed.csv",
        "Name,id,requirement_id,faction_id,min_value",
        ["gate-missing,rep-1,req-1,missing,5"],
    )

    report = recovery.preflight_source_csvs(tmp_path)

    assert report["status"] == "error"
    fields = {(error["table"], error["field"]) for error in report["errors"]}
    assert ("requirements", "min_faction_reputation[0].faction_id") in fields
    assert ("requirement_min_faction_reputation", "faction_id") in fields


def test_source_preflight_rejects_disagreeing_reputation_representations(monkeypatch, tmp_path: Path):
    _limit_preflight_to_reputation_tables(monkeypatch)
    _write_source_csv(tmp_path / "factions_seed.csv", "Name,id,slug,name,alignment", ["guild,faction-1,guild,Guild,Friendly"])
    _write_source_csv(
        tmp_path / "requirements_seed.csv",
        "Name,id,slug,required_flags,forbidden_flags,min_faction_reputation,tags",
        ['gate,req-1,gate,[],[],\"[{\"\"faction_id\"\":\"\"faction-1\"\",\"\"min\"\":5}]\",[]'],
    )
    _write_source_csv(
        tmp_path / "requirement_min_faction_reputation_seed.csv",
        "Name,id,requirement_id,faction_id,min_value",
        [],
    )

    report = recovery.preflight_source_csvs(tmp_path)

    assert report["status"] == "error"
    assert any("missing from requirement_min_faction_reputation CSV" in error["message"] for error in report["errors"])


def test_restore_preflight_failure_does_not_reset_database(monkeypatch, tmp_path: Path):
    _limit_preflight_to_reputation_tables(monkeypatch)
    _write_source_csv(
        tmp_path / "requirements_seed.csv",
        "Name,id,slug,required_flags,forbidden_flags,min_faction_reputation,tags",
        [],
    )
    _write_source_csv(tmp_path / "factions_seed.csv", "Name,id,slug,name,alignment", [])
    _write_source_csv(
        tmp_path / "requirement_min_faction_reputation_seed.csv",
        "Name,id,requirement_id,faction_id,min_value",
        ["bad,rep-1,missing-req,missing-faction,5"],
    )
    resets = []
    app = Flask(__name__)

    @app.post("/api/db/reset")
    def reset():
        resets.append(True)
        return {"status": "ok"}

    report = recovery.restore_database_from_source(app, tmp_path)

    assert report["status"] == "error"
    assert "not reset" in report["message"]
    assert resets == []


def test_source_preflight_rejects_incomplete_rebuild_directory(monkeypatch, tmp_path: Path):
    _limit_preflight_to_reputation_tables(monkeypatch)
    _write_source_csv(tmp_path / "factions_seed.csv", "Name,id,slug,name,alignment", [])

    report = recovery.preflight_source_csvs(tmp_path)

    assert report["status"] == "error"
    missing_tables = {error["table"] for error in report["errors"] if "Missing source CSV" in error["message"]}
    assert missing_tables == {"requirements", "requirement_min_faction_reputation"}


def test_reset_rebuild_reports_post_import_foreign_key_failures(monkeypatch, tmp_path: Path):
    _write_source_csv(tmp_path / "stats_seed.csv", "Name,id,slug,name,category,value_type", [])
    monkeypatch.setattr(recovery, "preflight_source_csvs", lambda source_dir=None: {
        "status": "ok",
        "source_dir": str(tmp_path),
        "tables": 1,
        "rows": 0,
        "errors": [],
    })
    monkeypatch.setattr(recovery, "foreign_key_integrity_errors", lambda: [{
        "table": "broken",
        "rowid": 1,
        "parent": "missing",
        "foreign_key_index": 0,
        "message": "broken reference",
    }])
    app = Flask(__name__)

    @app.post("/api/db/reset")
    def reset():
        return {"status": "ok"}

    @app.post("/api/source/import/csv/<table_name>")
    def import_table(table_name):
        return {"status": "success", "imported": 0, "deleted": 0}

    report = recovery.import_source_csvs(app, tmp_path, reset_first=True)

    assert report["status"] == "error"
    assert report["integrity"]["status"] == "error"
    assert report["errors"][0]["table"] == "broken"
