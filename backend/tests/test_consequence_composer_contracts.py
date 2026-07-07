from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_adventure_narrative import (
    AdventureBeat,
    AdventureBeatLink,
    AdventureBeatLinkRole,
    AdventureBeatLinkTargetType,
    AdventureChangeType,
    AdventureImportance,
    AdventureOccurrenceKind,
    AdventureBeatType,
)
from backend.app.models.m_currencies import Currency, CurrencyType
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_items import Item, ItemType, Rarity
from backend.app.models.m_quests import Quest
from backend.app.routes import r_ui_consequences


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_consequences, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_consequences.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        Flag(id="flag-1", slug="ambush-done", name="Ambush Done", description="Done.", flag_type=FlagType.StoryProgress),
        Item(
            id="item-1",
            slug="signal-key",
            name="Signal Key",
            type=ItemType.Quest,
            rarity=Rarity.Rare,
            base_price=0,
            tags=[],
        ),
        Currency(id="cur-1", slug="gold", name="Gold", type=CurrencyType.Soft, tags=[]),
        Faction(id="faction-1", slug="guard", name="Guard", alignment=Alignment.Friendly, tags=[]),
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
            item_rewards=[],
            currency_rewards=[],
            reputation_rewards=[],
            tags=[],
        ),
        Event(
            id="event-2",
            slug="event-2",
            title="Aftermath",
            type=EventType.ScriptedScene,
            flags_set=[],
            item_rewards=[],
            currency_rewards=[],
            reputation_rewards=[],
            tags=[],
        ),
        Quest(
            id="quest-1",
            slug="quest-1",
            title="Quest",
            description="Quest.",
            objectives=[{"objective_id": "find-key", "description": "Find the key.", "requirements_id": "", "flags_set": []}],
            flags_set_on_completion=[],
            item_rewards=[],
            currency_rewards=[],
            reputation_rewards=[],
            tags=[],
        ),
        Dialogue(id="dialogue-1", slug="dialogue-1", title="Talk", tags=[]),
        DialogueNode(
            id="node-1",
            slug="node-1",
            dialogue_id="dialogue-1",
            speaker="Guide",
            text="Go.",
            choices=[],
            set_flags=[],
            tags=[],
        ),
        AdventureBeat(
            id="beat-1",
            slug="beat-1",
            title="Ambush Beat",
            beat_type=AdventureBeatType.Conflict,
            sort_order=1,
            tags=[],
        ),
        AdventureBeatLink(
            id="link-existing",
            adventure_beat_id="beat-1",
            target_type=AdventureBeatLinkTargetType.Encounter,
            target_id="enc-1",
            role=AdventureBeatLinkRole.Runtime,
            occurrence_kind=AdventureOccurrenceKind.Appearance,
            change_type=AdventureChangeType.Active,
            importance=AdventureImportance.Major,
            sort_order=0,
            tags=[],
        ),
    ])
    session.commit()
    session.close()


def _columns(model):
    return {
        column.name: getattr(getattr(model, column.name), "value", getattr(model, column.name))
        for column in model.__table__.columns
    }


def _bundle(Session):
    session = Session()
    event = session.get(Event, "event-1")
    encounter = session.get(Encounter, "enc-1")
    quest = session.get(Quest, "quest-1")
    node = session.get(DialogueNode, "node-1")
    session.close()
    return {
        "events": [{
            **_columns(event),
            "flags_set": ["flag-1"],
            "item_rewards": [{"item_id": "item-1", "quantity": 1}],
            "currency_rewards": [{"currency_id": "cur-1", "amount": 10}],
            "reputation_rewards": [{"faction_id": "faction-1", "amount": 2}],
            "xp_reward": 50,
            "next_event_id": "event-2",
            "expected_previous": _columns(event),
        }],
        "encounters": [{
            **_columns(encounter),
            "rewards": {
                "xp": 100,
                "items": [{"item_id": "item-1", "quantity": 1}],
                "currencies": [{"currency_id": "cur-1", "amount": 5}],
                "reputation": [{"faction_id": "faction-1", "amount": 1}],
                "flags_set": ["flag-1"],
            },
            "expected_previous": _columns(encounter),
        }],
        "quests": [{
            **_columns(quest),
            "flags_set_on_completion": ["flag-1"],
            "item_rewards": [{"item_id": "item-1", "quantity": 1}],
            "currency_rewards": [{"currency_id": "cur-1", "amount": 7}],
            "reputation_rewards": [{"faction_id": "faction-1", "amount": 3}],
            "xp_reward": 200,
            "expected_previous": _columns(quest),
        }],
        "dialogue_nodes": [{
            **_columns(node),
            "set_flags": ["flag-1"],
            "expected_previous": _columns(node),
        }],
        "adventure_beat_links": [{
            "id": "link-item",
            "adventure_beat_id": "beat-1",
            "target_type": "item",
            "target_id": "item-1",
            "role": "reward",
            "occurrence_kind": "reward",
            "change_type": "obtained",
            "state_label": "",
            "starts_at_beat_id": "",
            "ends_at_beat_id": "",
            "continuity_group_id": "item-1",
            "importance": "major",
            "sort_order": 1,
            "notes": "",
            "tags": [],
        }],
    }


def test_packet_includes_supported_sources_and_story_context(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    body = client.get("/api/ui/consequences").get_json()

    assert body["events"][0]["id"] == "event-1"
    assert body["encounters"][0]["id"] == "enc-1"
    assert body["quests"][0]["id"] == "quest-1"
    assert body["dialogue_nodes"][0]["id"] == "node-1"
    assert body["adventure_beats"][0]["id"] == "beat-1"
    assert "dependency_index" in body
    assert "story_packet" in body


def test_preview_rolls_back_all_consequence_changes(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/consequences/preview", json=_bundle(Session))

    assert response.status_code == 200
    body = response.get_json()
    changed_tables = {row["table"] for row in body["review"]["changed"]}
    assert {"events", "encounters", "quests", "dialogue_nodes"}.issubset(changed_tables)
    assert body["review"]["created"] == [{"table": "adventure_beat_links", "id": "link-item", "details": {}}]
    session = Session()
    assert session.get(Event, "event-1").flags_set == []
    assert session.get(Encounter, "enc-1").rewards["flags_set"] == []
    assert session.get(Quest, "quest-1").flags_set_on_completion == []
    assert session.get(DialogueNode, "node-1").set_flags == []
    assert session.get(AdventureBeatLink, "link-item") is None
    session.close()


def test_bundle_saves_consequences_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/consequences/bundle", json=_bundle(Session))

    assert response.status_code == 200
    session = Session()
    assert session.get(Event, "event-1").flags_set == ["flag-1"]
    assert session.get(Event, "event-1").item_rewards == [{"item_id": "item-1", "quantity": 1}]
    assert session.get(Event, "event-1").next_event_id == "event-2"
    assert session.get(Encounter, "enc-1").rewards["items"] == [{"item_id": "item-1", "quantity": 1}]
    assert session.get(Quest, "quest-1").flags_set_on_completion == ["flag-1"]
    assert session.get(DialogueNode, "node-1").set_flags == ["flag-1"]
    assert session.get(AdventureBeatLink, "link-item").target_id == "item-1"
    session.close()


def test_preview_rolls_back_objective_consequence_flags(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    quest = session.get(Quest, "quest-1")
    payload = {
        "quests": [{
            **_columns(quest),
            "objectives": [{
                "objective_id": "find-key",
                "description": "Find the key.",
                "requirements_id": "",
                "flags_set": ["flag-1"],
            }],
            "expected_previous": _columns(quest),
        }],
    }
    session.close()

    response = client.post("/api/ui/consequences/preview", json=payload)

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["review"]["changed"] == [{"table": "quests", "id": "quest-1", "details": {}}]
    session = Session()
    assert session.get(Quest, "quest-1").objectives[0]["flags_set"] == []
    session.close()


def test_bundle_saves_objective_consequence_flags_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    quest = session.get(Quest, "quest-1")
    payload = {
        "quests": [{
            **_columns(quest),
            "objectives": [{
                "objective_id": "find-key",
                "description": "Find the key.",
                "requirements_id": "",
                "flags_set": ["flag-1"],
            }],
            "expected_previous": _columns(quest),
        }],
    }
    session.close()

    response = client.post("/api/ui/consequences/bundle", json=payload)

    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(Quest, "quest-1").objectives[0]["flags_set"] == ["flag-1"]
    session.close()


def test_bundle_rejects_unknown_objective_flag_without_partial_writes(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    quest = session.get(Quest, "quest-1")
    payload = {
        "quests": [{
            **_columns(quest),
            "objectives": [{
                "objective_id": "find-key",
                "description": "Find the key.",
                "requirements_id": "",
                "flags_set": ["missing-flag"],
            }],
            "expected_previous": _columns(quest),
        }],
    }
    session.close()

    response = client.post("/api/ui/consequences/bundle", json=payload)

    assert response.status_code == 400
    assert "Invalid flag_id in objective" in response.get_json()["message"]
    session = Session()
    assert session.get(Quest, "quest-1").objectives[0]["flags_set"] == []
    session.close()


def test_bundle_rejects_unsupported_dialogue_rewards_without_partial_writes(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    payload = {**_bundle(Session), "dialogue_rewards": [{"dialogue_id": "dialogue-1", "item_id": "item-1"}]}

    response = client.post("/api/ui/consequences/bundle", json=payload)

    assert response.status_code == 400
    assert "unsupported consequence payload" in response.get_json()["message"]
    assert Session().get(Event, "event-1").flags_set == []


def test_bundle_rejects_stale_expected_previous(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    payload = _bundle(Session)
    payload["events"][0]["expected_previous"]["title"] = "Wrong"

    response = client.post("/api/ui/consequences/bundle", json=payload)

    assert response.status_code == 400
    assert "expected_previous is stale" in response.get_json()["message"]
    assert Session().get(Event, "event-1").flags_set == []
