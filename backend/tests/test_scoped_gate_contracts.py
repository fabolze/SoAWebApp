from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_requirements import Requirement
from backend.app.routes import r_ui_scoped_gates


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_scoped_gates, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_scoped_gates.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        Flag(id="flag-old", slug="old", name="Old Flag", description="Old.", flag_type=FlagType.StoryProgress),
        Requirement(id="req-old", slug="old-gate", tags=[]),
        Encounter(
            id="enc-1",
            slug="enc-1",
            name="Ambush",
            encounter_type=EncounterType.Combat,
            participants=[],
            rewards={"xp": 0, "items": [], "currencies": [], "reputation": [], "flags_set": []},
            tags=[],
        ),
        Event(
            id="event-1",
            slug="event-1",
            title="Start",
            type=EventType.Encounter,
            encounter_id="enc-1",
            flags_set=[],
            tags=[],
        ),
    ])
    session.commit()
    session.close()


def _bundle():
    return {
        "flags": [{
            "id": "flag-new",
            "slug": "ambush-done",
            "name": "Ambush Done",
            "description": "The ambush has been resolved.",
            "flag_type": "Story Progress",
            "default_value": False,
            "tags": ["scoped-gate"],
        }],
        "requirement": {
            "id": "req-new",
            "slug": "ambush-done-gate",
            "required_flags": ["flag-new"],
            "forbidden_flags": [],
            "min_faction_reputation": [],
            "tags": ["scoped-gate"],
        },
        "requirement_attachments": [{
            "schema_name": "events",
            "entry_id": "event-1",
            "requirements_id": "req-new",
        }],
    }


def test_packet_includes_usage_dependency_context_and_supported_targets(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    body = client.get("/api/ui/scoped-gates").get_json()

    assert "events" in {group["schema_name"] for group in body["requirement_targets"]}
    assert "encounters" in {group["schema_name"] for group in body["requirement_targets"]}
    assert "dependency_index" in body
    assert body["requirements"][0]["id"] == "req-old"
    assert body["flags"][0]["id"] == "flag-old"


def test_preview_rolls_back_and_reports_gate_changes(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/scoped-gates/preview", json=_bundle())

    assert response.status_code == 200
    body = response.get_json()
    assert body["review"]["created"] == [
        {"table": "flags", "id": "flag-new", "details": {}},
        {"table": "requirements", "id": "req-new", "details": {}},
    ]
    assert body["review"]["changed"] == [
        {"table": "events", "id": "event-1", "details": {"requirements_id": "req-new"}},
    ]
    assert Session().get(Flag, "flag-new") is None
    assert Session().get(Event, "event-1").requirements_id is None


def test_bundle_saves_flag_requirement_and_attachment_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/scoped-gates/bundle", json=_bundle())

    assert response.status_code == 200
    session = Session()
    assert session.get(Flag, "flag-new").slug == "ambush-done"
    requirement = session.get(Requirement, "req-new")
    assert [row.flag_id for row in requirement.required_flags] == ["flag-new"]
    assert session.get(Event, "event-1").requirements_id == "req-new"
    session.close()


def test_bundle_rejects_contradictory_requirement_and_rolls_back(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    bundle = _bundle()
    bundle["requirement"]["forbidden_flags"] = ["flag-new"]

    response = client.post("/api/ui/scoped-gates/bundle", json=bundle)

    assert response.status_code == 400
    assert "require and forbid" in response.get_json()["message"]
    assert Session().get(Flag, "flag-new") is None
    assert Session().get(Event, "event-1").requirements_id is None


def test_bundle_rejects_unsupported_target_and_malformed_arrays(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    malformed = {**_bundle(), "flags": "not-an-array"}

    response = client.post("/api/ui/scoped-gates/bundle", json=malformed)

    assert response.status_code == 400
    assert response.get_json()["message"] == "flags must be an array"
    unsupported = _bundle()
    unsupported["requirement_attachments"][0]["schema_name"] = "characters"

    response = client.post("/api/ui/scoped-gates/bundle", json=unsupported)

    assert response.status_code == 400
    assert "schema_name is not supported" in response.get_json()["message"]
