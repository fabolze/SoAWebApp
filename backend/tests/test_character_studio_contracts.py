from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_character_narrative import CharacterRelationship, CharacterStoryBeat, CharacterStoryProfile
from backend.app.models.m_characters import Character
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.routes import r_export, r_ui_character_studio


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_character_studio, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_character_studio.bp)
    return app.test_client(), Session


def _character(character_id, name):
    return {"id": character_id, "slug": character_id, "name": name, "level": 1, "tags": []}


def _relationship():
    return {
        "id": "relation-1",
        "from_character_id": "char-1",
        "to_character_id": "char-2",
        "relationship_type": "Rival",
        "summary": "Compete for command.",
        "trust": -10,
        "tension": 70,
        "influence": 40,
        "is_secret": False,
        "tags": [],
    }


def _beat():
    return {
        "id": "beat-1",
        "character_id": "char-1",
        "title": "The Challenge",
        "beat_type": "Conflict",
        "sort_order": 0,
        "summary": "The rivalry becomes public.",
        "relationship_changes": [{"relationship_id": "relation-1", "tension": 90, "summary": "Lines are drawn."}],
        "tags": [],
    }


def test_preview_rolls_back_and_commit_persists_complete_narrative_bundle(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add(Character(**_character("char-2", "Second")))
    session.commit()
    session.close()
    payload = {
        "mode": "individual",
        "character": _character("char-1", "Primary"),
        "story_profile": {
            "id": "profile-1",
            "character_id": "char-1",
            "want": "Lead the expedition.",
            "need": "Learn to delegate.",
            "tags": [],
        },
        "relationships": [_relationship()],
        "story_beats": [_beat()],
        "deletions": {},
    }

    preview = client.post("/api/ui/character-studio/preview", json=payload)
    assert preview.status_code == 200
    assert {row["table"] for row in preview.get_json()["review"]["created"]} == {
        "characters", "character_story_profiles", "character_relationships", "character_story_beats",
    }
    session = Session()
    assert session.get(Character, "char-1") is None
    assert session.get(CharacterStoryProfile, "profile-1") is None
    session.close()

    commit = client.post("/api/ui/character-studio/bundle", json=payload)
    assert commit.status_code == 200
    packet = commit.get_json()["packet"]
    assert packet["story_profile"]["want"] == "Lead the expedition."
    assert packet["relationships"][0]["relationship_type"] == "Rival"
    assert packet["story_beats"][0]["relationship_changes"][0]["tension"] == 90
    session = Session()
    assert session.get(CharacterStoryBeat, "beat-1")
    session.close()


def test_invalid_story_beat_rolls_back_complete_bundle(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add(Character(**_character("char-2", "Second")))
    session.commit()
    session.close()
    beat = _beat()
    beat["quest_id"] = "missing"
    payload = {
        "mode": "individual",
        "character": _character("char-1", "Primary"),
        "relationships": [_relationship()],
        "story_beats": [beat],
        "deletions": {},
    }

    response = client.post("/api/ui/character-studio/bundle", json=payload)
    assert response.status_code == 400
    session = Session()
    assert session.get(Character, "char-1") is None
    assert session.get(CharacterRelationship, "relation-1") is None
    session.close()


def test_ensemble_rejects_records_outside_selected_scope(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(**_character("char-1", "First")),
        Character(**_character("char-2", "Second")),
        Character(**_character("char-3", "Third")),
    ])
    session.commit()
    session.close()
    relationship = _relationship()
    relationship["to_character_id"] = "char-3"

    response = client.post("/api/ui/character-studio/preview", json={
        "mode": "ensemble",
        "selected_character_ids": ["char-1", "char-2"],
        "relationships": [relationship],
        "deletions": {},
    })
    assert response.status_code == 400


def test_dialogue_speaker_reassignment_requires_warning_approval(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(**_character("char-1", "First")),
        Character(**_character("char-2", "Second")),
        Dialogue(id="dialogue-1", slug="dialogue-1", title="Greeting", tags=[]),
        DialogueNode(
            id="node-1", slug="node-1", dialogue_id="dialogue-1", speaker="Fallback",
            speaker_character_id="char-2", text="Hello.", choices=[], set_flags=[], tags=[],
        ),
    ])
    session.commit()
    session.close()
    payload = {
        "mode": "individual",
        "character": _character("char-1", "First"),
        "presence": {"dialogue_nodes": [{"id": "node-1", "expected_previous": "char-2", "value": "char-1"}]},
        "deletions": {},
    }

    preview = client.post("/api/ui/character-studio/preview", json=payload)
    warning_id = preview.get_json()["warnings"][0]["id"]
    assert client.post("/api/ui/character-studio/bundle", json=payload).status_code == 400
    payload["accepted_warning_ids"] = [warning_id]
    assert client.post("/api/ui/character-studio/bundle", json=payload).status_code == 200
    session = Session()
    assert session.get(DialogueNode, "node-1").speaker_character_id == "char-1"
    session.close()


def test_existing_relationship_update_rejects_stale_expected_value(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(**_character("char-1", "First")),
        Character(**_character("char-2", "Second")),
        CharacterRelationship(**_relationship()),
    ])
    session.commit()
    session.close()
    changed = _relationship()
    changed["trust"] = 20
    changed["expected_previous"] = {**_relationship(), "trust": 99}

    response = client.post("/api/ui/character-studio/preview", json={
        "mode": "individual",
        "character": _character("char-1", "First"),
        "relationships": [changed],
        "deletions": {},
    })
    assert response.status_code == 400
    assert response.get_json()["path"].startswith("relationships[0].expected_previous")


def test_narrative_tables_export_to_source_but_not_ue(monkeypatch):
    _, Session = _client(monkeypatch)
    monkeypatch.setattr(r_export, "get_db_session", lambda: Session())
    app = Flask(__name__)
    app.register_blueprint(r_export.bp)
    client = app.test_client()

    source = client.get("/api/source/export/csv/character_story_profiles")
    assert source.status_code == 200
    assert "character_id" in source.get_data(as_text=True)
    ue = client.get("/api/export/ue/csv/character_story_profiles")
    assert ue.status_code == 400
