from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_characters import Character
from backend.app.models.m_currencies import Currency, CurrencyType
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_items import Item, ItemType
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_locations import Location
from backend.app.models.m_requirements import Requirement
from backend.app.routes import r_ui_encounters


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_encounters, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_encounters.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        Character(id="char-1", slug="char-1", name="Profileless", level=3),
        Character(id="char-2", slug="char-2", name="Other", level=2),
        Currency(id="currency-1", slug="gold", name="Gold", type=CurrencyType.Soft),
        Faction(id="faction-1", slug="guild", name="Guild", alignment=Alignment.Friendly),
        Flag(id="flag-1", slug="done", name="Done", description="Done.", flag_type=FlagType.StoryProgress),
        Item(id="item-1", slug="potion", name="Potion", type=ItemType.Consumable, base_price=10),
        Location(id="loc-1", slug="loc-1", name="Road"),
        Location(id="loc-2", slug="loc-2", name="Keep"),
        Requirement(id="req-shared", slug="shared", tags=[]),
        Encounter(
            id="enc-other",
            slug="other",
            name="Other",
            encounter_type=EncounterType.Combat,
            participants=[],
            rewards={},
            tags=[],
        ),
    ])
    session.flush()
    session.add_all([
        Event(id="event-1", slug="event-1", title="Gate Event", type=EventType.Encounter, requirements_id="req-shared"),
        LocationEncounterTable(
            id="table-1",
            slug="table-1",
            location_id="loc-1",
            name="Road Table",
            encounter_entries=[{"encounter_id": "enc-other", "weight": 7, "min_count": 1, "max_count": 1}],
            tags=[],
        ),
        LocationEncounterTable(
            id="table-2",
            slug="table-2",
            location_id="loc-2",
            name="Keep Table",
            encounter_entries=[],
            tags=[],
        ),
    ])
    session.commit()
    session.close()


def _encounter(encounter_id="enc-1", requirement_id="req-shared"):
    return {
        "id": encounter_id,
        "slug": encounter_id,
        "name": "Encounter Stage",
        "description": "A staged encounter.",
        "encounter_type": "Combat",
        "requirements_id": requirement_id,
        "participants": [
            {"character_id": "char-1", "contexts": ["Combat", "Interaction"], "combat_side": "Hostile"},
        ],
        "rewards": {
            "xp": 20,
            "items": [{"item_id": "item-1", "quantity": 1}],
            "currencies": [{"currency_id": "currency-1", "amount": 5}],
            "reputation": [{"faction_id": "faction-1", "amount": 2}],
            "flags_set": ["flag-1"],
        },
        "tags": ["stage"],
    }


def _requirement():
    return {
        "id": "req-shared",
        "slug": "shared",
        "required_flags": ["flag-1"],
        "forbidden_flags": [],
        "min_faction_reputation": [],
        "tags": ["gate"],
    }


def test_packet_includes_profiles_catalogs_placements_and_requirement_usage(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Encounter(**{
        **_encounter(),
        "encounter_type": EncounterType.Combat,
    }))
    table = session.get(LocationEncounterTable, "table-1")
    table.encounter_entries = [
        *table.encounter_entries,
        {"encounter_id": "enc-1", "weight": 2, "min_count": 1, "max_count": 2},
    ]
    session.commit()
    session.close()

    body = client.get("/api/ui/encounters/enc-1").get_json()
    assert body["encounter"]["id"] == "enc-1"
    assert body["characters"][0]["combat_profile"] is None
    assert body["characters"][0]["interaction_profile"] is None
    assert body["placements"][0]["table_id"] == "table-1"
    assert body["encounter_tables"][0]["location"]["name"] == "Road"
    assert body["requirement"]["id"] == "req-shared"
    assert body["requirement_usages"][0]["schema_name"] == "events"


def test_selector_accepts_missing_id_collection_request_with_trailing_slash(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.get("/api/ui/encounters/")

    assert response.status_code == 200
    body = response.get_json()
    assert body["encounters"][0]["id"] == "enc-other"
    assert body["encounter_tables"][0]["location"]["name"] == "Road"


def test_bundle_saves_profileless_encounter_requirement_and_placements_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/encounters/bundle", json={
        "encounter": _encounter(),
        "requirement": _requirement(),
        "placements": [{
            "table_id": "table-2",
            "entry": {
                "encounter_id": "enc-1",
                "weight": 3,
                "spawn_group": "night",
                "min_count": 1,
                "max_count": 2,
                "spawn_notes": "After dusk.",
            },
        }],
    })

    assert response.status_code == 200
    body = response.get_json()
    assert body["encounter"]["participants"][0]["contexts"] == ["Combat", "Interaction"]
    assert body["placements"][0]["table_id"] == "table-2"
    session = Session()
    assert session.get(Encounter, "enc-1")
    assert session.get(Requirement, "req-shared").tags == ["gate"]
    assert session.get(LocationEncounterTable, "table-1").encounter_entries == [
        {"encounter_id": "enc-other", "weight": 7, "min_count": 1, "max_count": 1},
    ]
    assert session.get(LocationEncounterTable, "table-2").encounter_entries[0]["spawn_group"] == "night"
    session.close()


def test_bundle_replaces_only_current_encounter_rows(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Encounter(**{**_encounter(), "encounter_type": EncounterType.Combat}))
    table = session.get(LocationEncounterTable, "table-1")
    table.encounter_entries = [
        *table.encounter_entries,
        {"encounter_id": "enc-1", "weight": 1, "min_count": 1, "max_count": 1},
    ]
    session.commit()
    session.close()

    response = client.post("/api/ui/encounters/bundle", json={
        "encounter": _encounter(),
        "requirement": None,
        "placements": [{
            "table_id": "table-1",
            "entry": {"encounter_id": "enc-1", "weight": 9, "min_count": 2, "max_count": 3},
        }],
    })
    assert response.status_code == 200
    entries = Session().get(LocationEncounterTable, "table-1").encounter_entries
    assert entries == [
        {"encounter_id": "enc-other", "weight": 7, "min_count": 1, "max_count": 1},
        {"encounter_id": "enc-1", "weight": 9.0, "min_count": 2, "max_count": 3},
    ]


def test_bundle_rolls_back_on_invalid_placement_or_reward_reference(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/encounters/bundle", json={
        "encounter": _encounter(),
        "requirement": _requirement(),
        "placements": [{"table_id": "missing", "entry": {"encounter_id": "enc-1", "weight": 1}}],
    })
    assert response.status_code == 400
    assert Session().get(Encounter, "enc-1") is None
    assert Session().get(Requirement, "req-shared").tags == []

    invalid = _encounter("enc-bad", "")
    invalid["rewards"]["items"] = [{"item_id": "missing", "quantity": 1}]
    response = client.post("/api/ui/encounters/bundle", json={
        "encounter": invalid,
        "placements": [],
    })
    assert response.status_code == 400
    assert response.get_json()["path"].startswith("encounter")
    assert Session().get(Encounter, "enc-bad") is None


def test_bundle_rejects_duplicate_participants_and_placement_tables(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    encounter = _encounter()
    encounter["participants"].append(dict(encounter["participants"][0]))

    duplicate_participants = client.post("/api/ui/encounters/bundle", json={
        "encounter": encounter,
        "placements": [],
    })
    assert duplicate_participants.status_code == 400

    duplicate_tables = client.post("/api/ui/encounters/bundle", json={
        "encounter": _encounter(),
        "placements": [
            {"table_id": "table-1", "entry": {"encounter_id": "enc-1", "weight": 1}},
            {"table_id": "table-1", "entry": {"encounter_id": "enc-1", "weight": 2}},
        ],
    })
    assert duplicate_tables.status_code == 400
