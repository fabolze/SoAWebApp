import io

from flask import Flask, jsonify
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_requirements import Requirement, RequirementMinFactionReputation
from backend.app.routes import base_route, r_export, r_factions, r_requirements
from backend.app.utils.csv_tools import build_csv_rows


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(base_route, "get_db_session", lambda: Session())
    monkeypatch.setattr(r_factions, "get_db_session", lambda: Session())
    monkeypatch.setattr(r_requirements, "get_db_session", lambda: Session())
    monkeypatch.setattr(r_export, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_factions.bp)
    app.register_blueprint(r_requirements.bp)
    app.register_blueprint(r_export.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    requirement = Requirement(id="req-1", slug="req-1", tags=[])
    session.add_all([
        Faction(id="keep", slug="keep", name="Keep", alignment=Alignment.Friendly, relationships={}, reputation_config={}, tags=[]),
        Faction(id="remove", slug="remove", name="Remove", alignment=Alignment.Neutral, relationships={}, reputation_config={}, tags=[]),
        requirement,
        RequirementMinFactionReputation(id="rep-1", requirement=requirement, faction_id="remove", min_value=5),
    ])
    session.commit()
    session.close()


def _faction_csv():
    return b"Name,id,slug,name,alignment,relationships,reputation_config,tags\nkeep,keep,keep,Keep,Friendly,{},{},[]\n"


def test_faction_delete_cascades_reputation_rows_but_keeps_requirement(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.delete("/api/factions/remove")

    assert response.status_code == 200
    assert response.get_json()["cascade_deleted"]["requirement_min_faction_reputation"] == 1
    session = Session()
    assert session.get(Requirement, "req-1") is not None
    assert session.get(RequirementMinFactionReputation, "rep-1") is None
    session.close()


def test_invalid_faction_reputation_is_rejected_by_route_and_database(monkeypatch):
    client, Session = _client(monkeypatch)

    response = client.post("/api/requirements", json={
        "id": "req-1",
        "slug": "req-1",
        "required_flags": [],
        "forbidden_flags": [],
        "min_faction_reputation": [{"faction_id": "missing", "min": 5}],
    })
    assert response.status_code == 400
    assert "Invalid faction_id" in response.get_json()["message"]

    session = Session()
    session.add(Requirement(id="req-2", slug="req-2", tags=[]))
    session.commit()
    session.add(RequirementMinFactionReputation(id="rep-bad", requirement_id="req-2", faction_id="missing", min_value=5))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
    else:
        raise AssertionError("Database should reject a missing faction_id")
    session.close()


def test_faction_csv_preview_and_import_report_cascade_deletions(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    preview = client.post(
        "/api/source/import/csv/factions/preview",
        data={"file": (io.BytesIO(_faction_csv()), "factions_seed.csv")},
        content_type="multipart/form-data",
    )
    imported = client.post(
        "/api/source/import/csv/factions",
        data={"file": (io.BytesIO(_faction_csv()), "factions_seed.csv")},
        content_type="multipart/form-data",
    )

    assert preview.status_code == 200
    assert preview.get_json()["counts"]["cascade_deleted"]["requirement_min_faction_reputation"] == 1
    assert imported.status_code == 200
    assert imported.get_json()["cascade_deleted"]["requirement_min_faction_reputation"] == 1
    session = Session()
    assert session.get(RequirementMinFactionReputation, "rep-1") is None
    session.close()


def test_faction_reputation_source_export_contains_round_trip_columns(monkeypatch):
    _, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    rows = session.query(RequirementMinFactionReputation).all()

    columns, data_rows = build_csv_rows(
        "requirement_min_faction_reputation",
        RequirementMinFactionReputation,
        rows,
        mode="source",
    )

    assert {"id", "requirement_id", "faction_id", "min_value"} <= set(columns)
    row = data_rows[0]
    assert row[columns.index("id")] == "rep-1"
    assert row[columns.index("requirement_id")] == "req-1"
    assert row[columns.index("faction_id")] == "remove"
    session.close()
