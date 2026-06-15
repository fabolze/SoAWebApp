from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_characters import Character
from backend.app.models.m_character_narrative import CharacterRelationship, CharacterStoryBeat, CharacterStoryProfile
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_locations import Location
from backend.app.models.m_location_pois import LocationPoi, PoiType
from backend.app.models.m_requirements import Requirement, RequirementRequiredFlag
from backend.app.routes import base_route, r_dialogue_nodes, r_ui_dialogues


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_dialogues, "get_db_session", lambda: Session())
    monkeypatch.setattr(r_dialogue_nodes, "get_db_session", lambda: Session())
    monkeypatch.setattr(base_route, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_dialogues.bp)
    app.register_blueprint(r_dialogue_nodes.bp)
    return app.test_client(), Session


def _dialogue(dialogue_id="dialogue-1"):
    return {"id": dialogue_id, "slug": dialogue_id, "title": "Test Dialogue", "description": "", "tags": []}


def _node(node_id, dialogue_id="dialogue-1", choices=None, requirement_id=None):
    return {
        "id": node_id,
        "slug": node_id,
        "dialogue_id": dialogue_id,
        "speaker": "NPC",
        "text": f"Line {node_id}",
        "choices": choices or [],
        "requirements_id": requirement_id,
        "set_flags": [],
        "tags": [],
    }


def test_dialogue_packet_includes_graph_playthrough_data_and_context(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(id="character-1", slug="character-1", name="Guide", tags=[]),
        Location(id="location-1", slug="location-1", name="Crossroads"),
        Dialogue(**_dialogue(), character_id="character-1", location_id="location-1"),
        DialogueNode(**_node("node-1")),
        Requirement(id="req-1", slug="req-1"),
        Flag(id="flag-1", slug="flag-1", name="Flag", description="Flag", flag_type=FlagType.StoryProgress),
        InteractionProfile(id="profile-1", character_id="character-1", dialogue_tree_id="dialogue-1"),
        Event(id="event-1", slug="event-1", title="Event", type=EventType.Dialogue, dialogue_id="dialogue-1"),
        LocationPoi(id="poi-1", slug="poi-1", location_id="location-1", name="POI", poi_type=PoiType.Interactable, dialogue_id="dialogue-1"),
    ])
    session.commit()
    session.close()

    body = client.get("/api/ui/dialogues/dialogue-1").get_json()
    assert body["dialogue"]["id"] == "dialogue-1"
    assert body["nodes"][0]["id"] == "node-1"
    assert body["requirements"][0]["id"] == "req-1"
    assert body["flags"][0]["id"] == "flag-1"
    assert body["context"]["events"][0]["id"] == "event-1"
    assert body["context"]["pois"][0]["id"] == "poi-1"
    assert body["context"]["interaction_profiles"][0]["id"] == "profile-1"
    assert body["context"]["character"]["id"] == "character-1"
    assert body["context"]["location"]["id"] == "location-1"


def test_bundle_creates_new_cross_linked_nodes_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [
            _node("node-1", choices=[{"choice_text": "Next", "next_node_id": "node-2", "set_flags": []}]),
            _node("node-2"),
        ],
        "deletions": {"nodes": []},
    })

    assert response.status_code == 200
    session = Session()
    assert session.get(Dialogue, "dialogue-1")
    assert session.get(DialogueNode, "node-1").choices[0]["next_node_id"] == "node-2"
    session.close()


def test_bundle_rolls_back_for_invalid_choice_requirement(monkeypatch):
    client, Session = _client(monkeypatch)
    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [
            _node("node-1", choices=[{"next_node_id": "node-2", "requirements_id": "missing"}]),
            _node("node-2"),
        ],
    })

    assert response.status_code == 400
    assert response.get_json()["path"].startswith("nodes[0]")
    session = Session()
    assert session.get(Dialogue, "dialogue-1") is None
    assert session.get(DialogueNode, "node-1") is None
    session.close()


def test_crud_uses_canonical_choice_requirements_id(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([Dialogue(**_dialogue()), DialogueNode(**_node("node-2")), Requirement(id="req-1", slug="req-1")])
    session.commit()
    session.close()

    valid = client.post("/api/dialogue-nodes", json=_node("node-1", choices=[{"next_node_id": "node-2", "requirements_id": "req-1"}]))
    invalid = client.post("/api/dialogue-nodes", json=_node("node-3", choices=[{"next_node_id": "node-2", "requirements_id": "missing"}]))
    assert valid.status_code == 200
    assert invalid.status_code == 400
    assert "Invalid requirements_id" in invalid.get_json()["message"]


def test_bundle_rejects_cross_dialogue_target_and_rolls_back(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([Dialogue(**_dialogue("dialogue-2")), DialogueNode(**_node("other-node", "dialogue-2"))])
    session.commit()
    session.close()

    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [_node("node-1", choices=[{"next_node_id": "other-node"}])],
    })
    assert response.status_code == 400
    session = Session()
    assert session.get(Dialogue, "dialogue-1") is None
    session.close()


def test_bundle_safe_deletion_requires_incoming_links_removed(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Dialogue(**_dialogue()),
        DialogueNode(**_node("node-1", choices=[{"next_node_id": "node-2"}])),
        DialogueNode(**_node("node-2")),
    ])
    session.commit()
    session.close()

    rejected = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [_node("node-1", choices=[{"next_node_id": "node-2"}])],
        "deletions": {"nodes": ["node-2"]},
    })
    assert rejected.status_code == 400

    accepted = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [_node("node-1")],
        "deletions": {"nodes": ["node-2"]},
    })
    assert accepted.status_code == 200
    session = Session()
    assert session.get(DialogueNode, "node-2") is None
    session.close()


def test_bundle_normalizes_blank_optional_references(monkeypatch):
    client, Session = _client(monkeypatch)
    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": {**_dialogue(), "character_id": "", "location_id": "", "requirements_id": ""},
        "nodes": [{**_node("node-1"), "requirements_id": ""}],
    })

    assert response.status_code == 200
    session = Session()
    dialogue = session.get(Dialogue, "dialogue-1")
    node = session.get(DialogueNode, "node-1")
    assert (dialogue.character_id, dialogue.location_id, dialogue.requirements_id) == (None, None, None)
    assert node.requirements_id is None
    session.close()


def test_bundle_rejects_malformed_json_field_shapes(monkeypatch):
    client, _ = _client(monkeypatch)
    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": {**_dialogue(), "tags": "not-an-array"},
        "nodes": [_node("node-1")],
    })
    assert response.status_code == 400
    assert response.get_json()["path"] == "dialogue"

    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [_node("node-1", choices=[{"next_node_id": "node-2", "set_flags": "not-an-array"}]), _node("node-2")],
    })
    assert response.status_code == 400
    assert response.get_json()["path"].startswith("nodes[0]")


def test_bundle_requires_every_saved_node_or_explicit_deletion(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([Dialogue(**_dialogue()), DialogueNode(**_node("node-1")), DialogueNode(**_node("node-2"))])
    session.commit()
    session.close()

    response = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [_node("node-1")],
        "deletions": {"nodes": []},
    })
    assert response.status_code == 400
    assert "node-2" in response.get_json()["message"]


def _story_beat(beat_id="beat-1", dialogue_id="dialogue-1"):
    return {
        "id": beat_id,
        "character_id": "character-1",
        "title": "The Reveal",
        "beat_type": "Revelation",
        "sort_order": 0,
        "dialogue_id": dialogue_id,
        "summary": "The truth becomes visible.",
        "required_flags": [],
        "forbidden_flags": [],
        "expected_output_flags": ["flag-1"],
        "relationship_changes": [],
        "tags": [],
    }


def test_dialogue_packet_includes_story_context_coverage_and_world_echo(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(id="character-1", slug="guide", name="Guide", tags=[]),
        Character(id="character-2", slug="rival", name="Rival", tags=[]),
        Dialogue(**_dialogue()),
        DialogueNode(**{**_node("node-1"), "speaker_character_id": "character-1", "set_flags": ["flag-1"]}),
        Flag(id="flag-1", slug="flag-1", name="Truth", description="Truth", flag_type=FlagType.StoryProgress),
        Requirement(id="req-1", slug="req-1", tags=[]),
        Event(id="event-1", slug="event-1", title="Aftermath", type=EventType.ScriptedScene, requirements_id="req-1"),
        CharacterStoryProfile(id="profile-1", character_id="character-1", want="Reveal the truth.", voice_notes="Measured.", tags=[]),
        CharacterRelationship(
            id="relation-1", from_character_id="character-1", to_character_id="character-2",
            relationship_type="Rival", trust=0, tension=50, influence=0, is_secret=False, tags=[],
        ),
        CharacterStoryBeat(**_story_beat()),
    ])
    session.flush()
    session.add(RequirementRequiredFlag(id="required-1", requirement_id="req-1", flag_id="flag-1"))
    session.commit()
    session.close()

    body = client.get("/api/ui/dialogues/dialogue-1").get_json()
    assert body["story_beats"][0]["id"] == "beat-1"
    assert body["context"]["participants"][0]["id"] == "character-1"
    assert body["context"]["story_profiles"][0]["want"] == "Reveal the truth."
    assert body["context"]["relationships"][0]["id"] == "relation-1"
    assert body["beat_coverage"]["beat-1"]["outputs"]["matched"][0]["flag_id"] == "flag-1"
    assert body["world_echo"]["produced_flags"][0]["entry_id"] == "flag-1"
    assert body["world_echo"]["consumers"][0]["entry_id"] == "event-1"


def test_dialogue_preview_rolls_back_and_commit_saves_story_beat_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(id="character-1", slug="guide", name="Guide", tags=[]),
        Flag(id="flag-1", slug="flag-1", name="Truth", description="Truth", flag_type=FlagType.StoryProgress),
    ])
    session.commit()
    session.close()
    payload = {
        "dialogue": _dialogue(),
        "nodes": [{**_node("node-1"), "speaker_character_id": "character-1", "set_flags": ["flag-1"]}],
        "story_beats": [_story_beat()],
        "beat_unlinks": [],
    }

    preview = client.post("/api/ui/dialogues/preview", json=payload)
    assert preview.status_code == 200
    assert preview.get_json()["review"]["created"]
    session = Session()
    assert session.get(Dialogue, "dialogue-1") is None
    assert session.get(CharacterStoryBeat, "beat-1") is None
    session.close()

    commit = client.post("/api/ui/dialogues/bundle", json=payload)
    assert commit.status_code == 200
    session = Session()
    assert session.get(DialogueNode, "node-1").set_flags == ["flag-1"]
    assert session.get(CharacterStoryBeat, "beat-1").dialogue_id == "dialogue-1"
    session.close()


def test_story_beat_validation_and_unlink_are_atomic(monkeypatch):
    client, Session = _client(monkeypatch)
    session = Session()
    session.add_all([
        Character(id="character-1", slug="guide", name="Guide", tags=[]),
        Character(id="character-2", slug="outsider", name="Outsider", tags=[]),
        Flag(id="flag-1", slug="flag-1", name="Truth", description="Truth", flag_type=FlagType.StoryProgress),
        Dialogue(**_dialogue()),
        DialogueNode(**{**_node("node-1"), "speaker_character_id": "character-1"}),
        CharacterStoryBeat(**_story_beat()),
    ])
    session.commit()
    existing = {
        column.name: getattr(session.get(CharacterStoryBeat, "beat-1"), column.name)
        for column in CharacterStoryBeat.__table__.columns
    }
    existing["beat_type"] = existing["beat_type"].value
    session.close()

    invalid = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [_node("node-1")],
        "story_beats": [{**_story_beat("beat-new"), "character_id": "character-2"}],
    })
    assert invalid.status_code == 400
    session = Session()
    assert session.get(CharacterStoryBeat, "beat-new") is None
    session.close()

    stale = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [{**_node("node-1"), "speaker_character_id": "character-1"}],
        "beat_unlinks": [{"id": "beat-1", "expected_previous": {**existing, "title": "Stale"}}],
    })
    assert stale.status_code == 400

    unlinked = client.post("/api/ui/dialogues/bundle", json={
        "dialogue": _dialogue(),
        "nodes": [{**_node("node-1"), "speaker_character_id": "character-1"}],
        "beat_unlinks": [{"id": "beat-1", "expected_previous": existing}],
    })
    assert unlinked.status_code == 200
    session = Session()
    assert session.get(CharacterStoryBeat, "beat-1") is not None
    assert session.get(CharacterStoryBeat, "beat-1").dialogue_id is None
    session.close()
