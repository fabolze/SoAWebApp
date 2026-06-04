from pathlib import Path

from flask import Flask

from backend.app.services import recovery


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


def test_startup_recovery_skips_non_empty_database(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(recovery, "is_database_empty", lambda: False)
    printed = []
    monkeypatch.setattr(recovery, "print_recovery_report", lambda title, report: printed.append((title, report)))

    report = recovery.run_startup_recovery(Flask(__name__), tmp_path)

    assert report["status"] == "skipped"
    assert report["database_empty"] is False
    assert "not empty" in report["message"]
    assert printed[0][0] == "Startup recovery"


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
