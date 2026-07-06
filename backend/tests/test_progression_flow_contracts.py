from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_requirements import Requirement
from backend.app.routes import r_ui_progression_flow


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_progression_flow, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_progression_flow.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        Flag(id="flag-old", slug="old", name="Old Flag", description="Old.", flag_type=FlagType.StoryProgress),
        Requirement(id="req-old", slug="old-gate", tags=[]),
        Dialogue(id="dialogue-1", slug="dialogue-1", title="Intro", tags=[]),
        LoreEntry(id="lore-1", slug="lore-1", title="Lore", text="Lore content.", tags=[]),
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
            "tags": ["progression-flow"],
        }],
        "requirement": {
            "id": "req-new",
            "slug": "ambush-done-gate",
            "required_flags": ["flag-new"],
            "forbidden_flags": [],
            "min_faction_reputation": [],
            "tags": ["progression-flow"],
        },
        "events": [{
            "id": "event-1",
            "slug": "event-1",
            "title": "Start",
            "type": "Encounter",
            "requirements_id": "",
            "encounter_id": "enc-1",
            "dialogue_id": "",
            "lore_id": "",
            "flags_set": ["flag-new"],
            "next_event_id": "",
            "item_rewards": [],
            "xp_reward": 0,
            "currency_rewards": [],
            "reputation_rewards": [],
            "tags": [],
        }],
        "encounters": [{
            "id": "enc-1",
            "slug": "enc-1",
            "name": "Ambush",
            "encounter_type": "Combat",
            "participants": [],
            "rewards": {"xp": 0, "items": [], "currencies": [], "reputation": [], "flags_set": ["flag-new"]},
            "tags": [],
        }],
        "requirement_attachments": [{
            "schema_name": "events",
            "entry_id": "event-1",
            "requirements_id": "req-new",
        }],
    }


def test_packet_includes_dependency_usage_and_supported_targets(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    body = client.get("/api/ui/progression-flow").get_json()

    assert body["events"][0]["id"] == "event-1"
    assert body["event_context"][0]["payload"] == {"kind": "encounters", "id": "enc-1"}
    assert "events" in {group["schema_name"] for group in body["requirement_targets"]}
    assert "dependency_index" in body


def test_preview_rolls_back_and_reports_bundle_changes(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/progression-flow/preview", json=_bundle())

    assert response.status_code == 200
    body = response.get_json()
    assert body["review"]["created"] == [
        {"table": "flags", "id": "flag-new", "details": {}},
        {"table": "requirements", "id": "req-new", "details": {}},
    ]
    assert Session().get(Flag, "flag-new") is None


def test_bundle_saves_flags_requirement_event_encounter_and_attachment(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/progression-flow/bundle", json=_bundle())

    assert response.status_code == 200
    session = Session()
    assert session.get(Flag, "flag-new").slug == "ambush-done"
    requirement = session.get(Requirement, "req-new")
    assert [row.flag_id for row in requirement.required_flags] == ["flag-new"]
    assert session.get(Event, "event-1").requirements_id == "req-new"
    assert session.get(Event, "event-1").flags_set == ["flag-new"]
    assert session.get(Encounter, "enc-1").rewards["flags_set"] == ["flag-new"]
    session.close()


def test_bundle_rejects_contradictory_requirement_and_rolls_back(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    bundle = _bundle()
    bundle["requirement"]["forbidden_flags"] = ["flag-new"]

    response = client.post("/api/ui/progression-flow/bundle", json=bundle)

    assert response.status_code == 400
    assert "require and forbid" in response.get_json()["message"]
    assert Session().get(Flag, "flag-new") is None
