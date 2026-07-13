from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_abilities import Ability, AbilityType
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import Aggression, CombatProfile, EnemyType
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_items import Item, ItemType
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_locations import Location
from backend.app.routes import r_ui_creatures


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_creatures, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_creatures.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        CharacterClass(
            id="class-1",
            slug="stalker",
            name="Stalker",
            role=ClassRole.Damage,
            base_stats=[],
            tags=[],
        ),
        Ability(id="ability-1", slug="claw", name="Claw", type=AbilityType.Active, tags=[]),
        Item(id="item-1", slug="fang", name="Fang", type=ItemType.Material, base_price=1, tags=[]),
        Location(id="loc-1", slug="woods", name="Woods", tags=[]),
        Character(id="char-creature", slug="wolf", name="Wolf", level=2, class_id="class-1", tags=["creature", "enemy"]),
        Character(id="char-other", slug="guard", name="Guard", level=2, class_id="class-1", tags=[]),
    ])
    session.flush()
    session.add_all([
        CombatProfile(
            id="combat-1",
            character_id="char-creature",
            enemy_type=EnemyType.Beast,
            aggression=Aggression.Hostile,
            custom_abilities=["ability-1"],
            loot_table=[{"item_id": "item-1", "drop_chance": 50}],
            currency_rewards=[],
            reputation_rewards=[],
            related_quests=[],
            companion_config={},
            tags=[],
        ),
        Encounter(
            id="enc-1",
            slug="wolf-pack",
            name="Wolf Pack",
            encounter_type=EncounterType.Combat,
            participants=[{"character_id": "char-creature", "contexts": ["Combat"], "combat_side": "Hostile"}],
            rewards={"xp": 5},
            tags=[],
        ),
        Encounter(
            id="enc-other",
            slug="guard-post",
            name="Guard Post",
            encounter_type=EncounterType.Combat,
            participants=[{"character_id": "char-other", "contexts": ["Combat"], "combat_side": "Friendly"}],
            rewards={},
            tags=[],
        ),
        LocationEncounterTable(
            id="table-1",
            slug="woods-table",
            location_id="loc-1",
            name="Woods Table",
            encounter_entries=[{"encounter_id": "enc-1", "weight": 2, "min_count": 1, "max_count": 3}],
            tags=[],
        ),
    ])
    session.commit()
    session.close()


def test_packet_includes_creature_context_and_catalogs(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    body = client.get("/api/ui/creatures/char-creature").get_json()

    assert body["creature"]["name"] == "Wolf"
    assert body["combat_profile"]["enemy_type"] == "beast"
    assert body["appearances"][0]["id"] == "enc-1"
    assert body["habitats"][0]["table"]["location"]["name"] == "Woods"
    assert body["navigator"][0]["id"] == "char-creature"
    assert body["navigator"][0]["encounter_ids"] == ["enc-1"]
    assert body["navigator"][0]["habitat_location_ids"] == ["loc-1"]
    assert body["navigator"][0]["custom_abilities"] == ["ability-1"]
    assert body["boss_payoff"]["encounters"][0]["id"] == "enc-1"
    assert body["boss_payoff"]["encounters"][0]["has_any_payoff"] is True
    assert body["catalogs"]["abilities"][0]["id"] == "ability-1"


def test_preview_rolls_back_and_commit_persists_creature_bundle(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    payload = {
        "creature": {
            "id": "char-new",
            "slug": "cave-horror",
            "name": "Cave Horror",
            "level": 4,
            "class_id": "class-1",
            "tags": ["creature", "boss"],
        },
        "combat_profile": {
            "id": "combat-new",
            "character_id": "char-new",
            "enemy_type": "boss",
            "aggression": "Hostile",
            "custom_stats": [],
            "custom_abilities": ["ability-1"],
            "loot_table": [{"item_id": "item-1", "drop_chance": 100}],
            "currency_rewards": [],
            "reputation_rewards": [],
            "related_quests": [],
            "companion_config": {},
            "tags": ["boss"],
        },
        "encounter_changes": [],
        "encounter_table_changes": [],
    }

    preview = client.post("/api/ui/creatures/preview", json=payload)
    assert preview.status_code == 200
    assert preview.get_json()["review"]["created"][0]["table"] == "characters"
    assert Session().get(Character, "char-new") is None

    commit = client.post("/api/ui/creatures/bundle", json=payload)
    assert commit.status_code == 200
    session = Session()
    assert session.get(Character, "char-new").name == "Cave Horror"
    assert session.get(CombatProfile, "combat-new").enemy_type == EnemyType.Boss
    session.close()


def test_scoped_encounter_and_habitat_changes_are_stale_protected(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    encounter = session.get(Encounter, "enc-1")
    table = session.get(LocationEncounterTable, "table-1")
    expected_participants = list(encounter.participants)
    expected_entries = list(table.encounter_entries)
    session.close()

    response = client.post("/api/ui/creatures/bundle", json={
        "creature": {
            "id": "char-creature",
            "slug": "wolf",
            "name": "Wolf",
            "level": 2,
            "class_id": "class-1",
            "tags": ["creature", "enemy"],
        },
        "combat_profile": None,
        "encounter_changes": [{
            "id": "enc-1",
            "expected_previous": expected_participants,
            "participants": [
                {"character_id": "char-creature", "contexts": ["Combat"], "combat_side": "Hostile"},
                {"character_id": "char-other", "contexts": ["Combat"], "combat_side": "Friendly"},
            ],
        }],
        "encounter_table_changes": [{
            "id": "table-1",
            "expected_previous": expected_entries,
            "encounter_entries": [
                {"encounter_id": "enc-1", "weight": 5, "min_count": 1, "max_count": 2},
            ],
        }],
    })

    assert response.status_code == 400
    assert "unrelated participants" in response.get_json()["message"]

    stale = client.post("/api/ui/creatures/bundle", json={
        "creature": {
            "id": "char-creature",
            "slug": "wolf",
            "name": "Wolf",
            "level": 2,
            "class_id": "class-1",
            "tags": ["creature", "enemy"],
        },
        "combat_profile": None,
        "encounter_changes": [],
        "encounter_table_changes": [{
            "id": "table-1",
            "expected_previous": [],
            "encounter_entries": expected_entries,
        }],
    })
    assert stale.status_code == 400
    assert "expected_previous is stale" in stale.get_json()["message"]
