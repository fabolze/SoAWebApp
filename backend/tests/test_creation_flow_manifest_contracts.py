from flask import Flask, jsonify
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_creation_flow import CreationFlowArtifact, CreationFlowManifest
from backend.app.routes import base_route, r_creation_flow_manifests, r_export
from backend.app.services.recovery import ordered_tables
from backend.app.utils.csv_tools import AUTHORING_ONLY_TABLES, build_csv_rows


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(base_route, "get_db_session", lambda: Session())
    monkeypatch.setattr(r_export, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_creation_flow_manifests.creation_flow_manifests_bp)
    app.register_blueprint(r_creation_flow_manifests.creation_flow_artifacts_bp)
    app.register_blueprint(r_export.bp)
    return app.test_client(), Session, engine


def _manifest():
    return {
        "id": "flow-1",
        "slug": "Flow-One",
        "title": "Mara aftermath",
        "format": "SOA-CREATION-FLOW/1",
        "schema_version": 1,
        "compiler_version": "capture-only",
        "origin_kind": "dialogue",
        "origin_id": "dialogue-1",
        "origin_sub_kind": "dialogue_choice",
        "origin_sub_id": "choice-1",
        "normalized_draft": {"format": "SOA-CREATION-FLOW/1", "id": "flow-1", "steps": []},
        "accepted_warning_ids": [],
        "source_snapshots": {},
        "artifact_dispositions": {},
        "created_at": 100,
        "updated_at": 100,
        "tags": ["Creation-Flow"],
    }


def test_manifest_and_artifact_round_trip_with_cascade(monkeypatch):
    client, Session, engine = _client(monkeypatch)

    response = client.post("/api/creation-flow-manifests", json=_manifest())
    assert response.status_code == 200
    artifact = {
        "id": "artifact-link-1",
        "slug": "Artifact-Link-1",
        "manifest_id": "flow-1",
        "step_id": "step-1",
        "artifact_kind": "event",
        "artifact_id": "event-1",
        "ownership": "generated",
        "disposition": "still_owned",
        "expected_snapshot": {"id": "event-1", "title": "Portal opens"},
        "notes": "Generated for the first step.",
        "tags": ["Creation-Flow"],
    }
    assert client.post("/api/creation-flow-artifacts", json=artifact).status_code == 200

    manifest = client.get("/api/creation-flow-manifests/flow-1").get_json()
    assert manifest["slug"] == "flow-one"
    assert manifest["tags"] == ["creation-flow"]
    assert manifest["artifacts"][0]["step_id"] == "step-1"

    foreign_keys = inspect(engine).get_foreign_keys("creation_flow_artifacts")
    manifest_fk = next(key for key in foreign_keys if key["constrained_columns"] == ["manifest_id"])
    assert manifest_fk["referred_table"] == "creation_flow_manifests"
    assert manifest_fk["options"]["ondelete"] == "CASCADE"

    assert client.delete("/api/creation-flow-manifests/flow-1").status_code == 200
    session = Session()
    assert session.query(CreationFlowArtifact).count() == 0
    session.close()


def test_manifest_rejects_format_or_identity_drift(monkeypatch):
    client, _, _ = _client(monkeypatch)
    invalid = _manifest()
    invalid["normalized_draft"] = {"format": "SOA-CREATION-FLOW/0", "id": "another-flow"}
    response = client.post("/api/creation-flow-manifests", json=invalid)
    assert response.status_code == 400
    assert "SOA-CREATION-FLOW/1" in response.get_json()["message"]


def test_artifact_rejects_unknown_manifest_and_invalid_disposition(monkeypatch):
    client, _, _ = _client(monkeypatch)
    response = client.post("/api/creation-flow-artifacts", json={
        "id": "artifact-link-1",
        "slug": "artifact-link-1",
        "manifest_id": "missing",
        "step_id": "step-1",
        "artifact_kind": "event",
        "artifact_id": "event-1",
        "ownership": "generated",
        "disposition": "deleted_silently",
        "expected_snapshot": {},
        "tags": [],
    })
    assert response.status_code == 400
    assert "Invalid manifest_id" in response.get_json()["message"]


def test_manifests_are_source_recoverable_but_never_runtime_exports(monkeypatch):
    client, Session, _ = _client(monkeypatch)
    assert {"creation_flow_manifests", "creation_flow_artifacts"} <= AUTHORING_ONLY_TABLES
    assert client.get("/api/export/ue/csv/creation_flow_manifests").status_code == 400
    assert client.get("/api/export/ue/csv/creation_flow_artifacts").status_code == 400

    session = Session()
    session.add(CreationFlowManifest(
        id="flow-1", slug="flow-1", title="Flow", format="SOA-CREATION-FLOW/1", schema_version=1,
        compiler_version="capture-only", normalized_draft={"format": "SOA-CREATION-FLOW/1", "id": "flow-1"},
        accepted_warning_ids=[], source_snapshots={}, artifact_dispositions={}, created_at=1, updated_at=1, tags=[],
    ))
    session.commit()
    columns, rows = build_csv_rows("creation_flow_manifests", CreationFlowManifest, session.query(CreationFlowManifest).all(), mode="source")
    session.close()
    assert "normalized_draft" in columns
    assert len(rows) == 1

    ordered, unordered = ordered_tables(["creation_flow_artifacts", "creation_flow_manifests"])
    assert ordered == ["creation_flow_manifests", "creation_flow_artifacts"]
    assert unordered == []
