from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_abilities import Ability, AbilityType
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_currencies import Currency, CurrencyType
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_items import Item, ItemType
from backend.app.models.m_quests import Quest
from backend.app.models.m_shops import Shop
from backend.app.models.m_stats import Stat, StatCategory, ValueType
from backend.app.routes import r_ui_characters


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_characters, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_characters.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        CharacterClass(id="class-1", slug="fighter", name="Fighter", role=ClassRole.Damage, base_stats={}),
        Ability(id="ability-1", slug="strike", name="Strike", type=AbilityType.Active),
        Currency(id="currency-1", slug="gold", name="Gold", type=CurrencyType.Soft),
        Faction(id="faction-1", slug="guild", name="Guild", alignment=Alignment.Friendly),
        Item(id="item-1", slug="potion", name="Potion", type=ItemType.Consumable, base_price=10),
        Quest(id="quest-1", slug="first-quest", title="First Quest", description="Begin."),
        Stat(id="stat-1", slug="strength", name="Strength", category=StatCategory.Combat, value_type=ValueType.Int),
        Flag(id="flag-1", slug="met", name="Met", description="Met character.", flag_type=FlagType.NPCRelationship),
    ])
    session.commit()
    session.close()


def _character(character_id="char-1"):
    return {
        "id": character_id,
        "slug": character_id,
        "name": "Bundle Character",
        "level": 4,
        "class_id": "class-1",
        "tags": ["enemy"],
    }


def _combat(character_id="char-1", profile_id="combat-1"):
    return {
        "id": profile_id,
        "character_id": character_id,
        "enemy_type": "humanoid",
        "aggression": "Hostile",
        "custom_stats": [],
        "custom_abilities": ["ability-1"],
        "loot_table": [],
        "currency_rewards": [],
        "reputation_rewards": [],
        "related_quests": [],
        "tags": [],
    }


def test_bundle_creates_character_profiles_and_encounter_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "combat_profile": _combat(),
        "interaction_profile": {
            "id": "interaction-1",
            "character_id": "char-1",
            "role": "Questgiver",
            "available_quests": [],
            "inventory": [],
            "flags_set_on_interaction": [],
            "tags": [],
        },
        "encounters": [{
            "id": "encounter-1",
            "slug": "first-fight",
            "name": "First Fight",
            "encounter_type": "Combat",
            "participants": [{"character_id": "char-1", "contexts": ["Combat"], "combat_side": "Hostile"}],
            "rewards": {"xp": 0, "items": [], "currencies": [], "reputation": [], "flags_set": []},
            "tags": [],
        }],
    })

    assert response.status_code == 200
    body = response.get_json()
    assert body["combat_profile"]["character_id"] == "char-1"
    assert body["interaction_profile"]["role"] == "Questgiver"
    assert body["world_presence"]["encounters"][0]["id"] == "encounter-1"
    session = Session()
    assert session.get(Character, "char-1")
    assert session.get(CombatProfile, "combat-1")
    assert session.get(InteractionProfile, "interaction-1")
    assert session.get(Encounter, "encounter-1")
    session.close()


def test_bundle_rolls_back_all_records_when_profile_is_invalid(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    bad_combat = _combat()
    bad_combat["custom_abilities"] = ["missing"]

    response = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "combat_profile": bad_combat,
        "encounters": [],
    })

    assert response.status_code == 400
    assert response.get_json()["path"].startswith("combat_profile")
    session = Session()
    assert session.get(Character, "char-1") is None
    assert session.get(CombatProfile, "combat-1") is None
    session.close()


def test_bundle_returns_structured_error_path_for_encounter_rows(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "combat_profile": _combat(),
        "encounters": [{
            "id": "encounter-1",
            "slug": "bad-placement",
            "name": "Bad Placement",
            "encounter_type": "Combat",
            "participants": [{"character_id": "char-1", "contexts": ["Invalid"], "combat_side": "Hostile"}],
            "rewards": {},
            "tags": [],
        }],
    })

    assert response.status_code == 400
    assert response.get_json()["path"].startswith("encounters[0]")


def test_bundle_existing_encounter_only_accepts_participant_changes(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Character(**_character()))
    session.add(Character(id="char-2", slug="char-2", name="Other Character"))
    session.add(CombatProfile(id="combat-1", character_id="char-1"))
    session.add(Encounter(
        id="encounter-1",
        slug="original",
        name="Original",
        encounter_type=EncounterType.Combat,
        participants=[
            {"character_id": "char-1", "contexts": ["Combat"], "combat_side": "Hostile"},
            {"character_id": "char-2", "contexts": [], "combat_side": "Neutral"},
        ],
        rewards={},
    ))
    session.commit()
    session.close()

    rejected = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "encounters": [{"id": "encounter-1", "name": "Changed", "participants": []}],
    })
    assert rejected.status_code == 400

    changed_other = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "encounters": [{"id": "encounter-1", "participants": [
            {"character_id": "char-1", "contexts": ["Combat"], "combat_side": "Hostile"},
            {"character_id": "char-2", "contexts": [], "combat_side": "Friendly"},
        ]}],
    })
    assert changed_other.status_code == 400

    accepted = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "encounters": [{"id": "encounter-1", "participants": [
            {"character_id": "char-2", "contexts": [], "combat_side": "Neutral"},
        ]}],
    })
    assert accepted.status_code == 200
    session = Session()
    encounter = session.get(Encounter, "encounter-1")
    assert encounter.name == "Original"
    assert encounter.participants == [{"character_id": "char-2", "contexts": [], "combat_side": "Neutral"}]
    session.close()


def test_character_packet_includes_world_presence(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Character(**_character()))
    session.add(Dialogue(id="dialogue-1", slug="greeting", title="Greeting", character_id="char-1"))
    session.add(Shop(id="shop-1", slug="store", name="Store", character_id="char-1"))
    session.commit()
    session.close()

    body = client.get("/api/ui/characters/char-1").get_json()
    assert body["world_presence"]["dialogues"][0]["id"] == "dialogue-1"
    assert body["world_presence"]["shops"][0]["id"] == "shop-1"


def test_bundle_round_trips_existing_schema_fields_and_normalizes_tags(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    character = _character()
    character.update({"image_path": "portraits/enemy.png", "tags": ["Enemy", " Elite "]})
    combat = _combat()
    combat.update({
        "custom_stats": [{"stat_id": "stat-1", "value": 12}],
        "loot_table": [{"item_id": "item-1", "drop_chance": 25}],
        "currency_rewards": [{"currency_id": "currency-1", "amount": 5, "drop_chance": 80}],
        "reputation_rewards": [{"faction_id": "faction-1", "amount": -2, "drop_chance": 100}],
        "xp_reward": 40,
        "related_quests": ["quest-1"],
        "companion_config": {
            "class_id": "class-1",
            "level": 4,
            "custom_abilities": ["ability-1"],
            "custom_stats": [{"stat_id": "stat-1", "value": 8}],
            "progression": {
                "level_cap": 20,
                "xp_multiplier": 1.2,
                "stat_growth": [{"stat_id": "stat-1", "value": 1}],
            },
        },
        "tags": ["Combat", " ELITE "],
    })
    response = client.post("/api/ui/characters/bundle", json={
        "character": character,
        "combat_profile": combat,
        "interaction_profile": {
            "id": "interaction-1",
            "character_id": "char-1",
            "role": "Merchant",
            "available_quests": ["quest-1"],
            "inventory": [{"item_id": "item-1", "price": 15}],
            "flags_set_on_interaction": ["flag-1"],
            "tags": ["Vendor"],
        },
        "encounters": [],
    })

    assert response.status_code == 200
    body = response.get_json()
    assert body["character"]["image_path"] == "portraits/enemy.png"
    assert body["character"]["tags"] == ["enemy", "elite"]
    assert body["combat_profile"]["tags"] == ["combat", "elite"]
    assert body["combat_profile"]["currency_rewards"][0]["drop_chance"] == 80
    assert body["combat_profile"]["companion_config"]["progression"]["stat_growth"][0]["stat_id"] == "stat-1"
    assert body["interaction_profile"]["inventory"][0]["price"] == 15
    assert body["interaction_profile"]["tags"] == ["vendor"]


def test_bundle_rejects_profile_id_owned_by_another_character(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Character(**_character("char-1")),
        Character(**_character("char-2")),
        CombatProfile(id="combat-1", character_id="char-1"),
        InteractionProfile(id="interaction-1", character_id="char-1"),
    ])
    session.commit()
    session.close()

    stolen_combat = _combat("char-2", "combat-1")
    response = client.post("/api/ui/characters/bundle", json={
        "character": _character("char-2"),
        "combat_profile": stolen_combat,
        "encounters": [],
    })
    assert response.status_code == 400

    response = client.post("/api/ui/characters/bundle", json={
        "character": _character("char-2"),
        "interaction_profile": {
            "id": "interaction-1",
            "character_id": "char-2",
            "role": "Story",
            "available_quests": [],
            "inventory": [],
            "flags_set_on_interaction": [],
            "tags": [],
        },
        "encounters": [],
    })
    assert response.status_code == 400


def test_bundle_rejects_out_of_scope_new_encounter_data(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Character(id="char-2", slug="char-2", name="Other Character"))
    session.commit()
    session.close()

    base_encounter = {
        "id": "encounter-1",
        "slug": "fight",
        "name": "Fight",
        "encounter_type": "Combat",
        "participants": [{"character_id": "char-1", "contexts": ["Combat"], "combat_side": "Hostile"}],
        "rewards": {"xp": 0, "items": [], "currencies": [], "reputation": [], "flags_set": []},
        "tags": [],
    }
    with_other_participant = dict(base_encounter)
    with_other_participant["participants"] = [
        *base_encounter["participants"],
        {"character_id": "char-2", "contexts": [], "combat_side": "Neutral"},
    ]
    response = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "combat_profile": _combat(),
        "encounters": [with_other_participant],
    })
    assert response.status_code == 400

    with_rewards = dict(base_encounter)
    with_rewards["rewards"] = {"xp": 10, "items": [], "currencies": [], "reputation": [], "flags_set": []}
    response = client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "combat_profile": _combat(),
        "encounters": [with_rewards],
    })
    assert response.status_code == 400


def test_bundle_rejects_invalid_json_shapes_and_reward_rows(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    bad_tags = _character()
    bad_tags["tags"] = {"enemy": True}
    assert client.post("/api/ui/characters/bundle", json={"character": bad_tags, "encounters": []}).status_code == 400

    bad_combat = _combat()
    bad_combat["loot_table"] = [{"item_id": "item-1", "drop_chance": 101}]
    assert client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "combat_profile": bad_combat,
        "encounters": [],
    }).status_code == 400

    assert client.post("/api/ui/characters/bundle", json={
        "character": _character(),
        "interaction_profile": {
            "id": "interaction-1",
            "character_id": "char-1",
            "role": "Merchant",
            "available_quests": [],
            "inventory": [{"item_id": "item-1"}],
            "flags_set_on_interaction": [],
            "tags": [],
        },
        "encounters": [],
    }).status_code == 400

    bad_level = _character("char-level")
    bad_level["level"] = "4"
    assert client.post("/api/ui/characters/bundle", json={"character": bad_level, "encounters": []}).status_code == 400

    bad_amount = _combat("char-amount", "combat-amount")
    bad_amount["currency_rewards"] = [{"currency_id": "currency-1", "amount": "5"}]
    assert client.post("/api/ui/characters/bundle", json={
        "character": _character("char-amount"),
        "combat_profile": bad_amount,
        "encounters": [],
    }).status_code == 400


def test_bundle_normalizes_cleared_optional_references(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    character = _character()
    character.update({"class_id": "", "faction_id": "", "home_location_id": ""})
    response = client.post("/api/ui/characters/bundle", json={
        "character": character,
        "interaction_profile": {
            "id": "interaction-1",
            "character_id": "char-1",
            "role": "Story",
            "dialogue_tree_id": "",
            "available_quests": [],
            "inventory": [],
            "flags_set_on_interaction": [],
            "tags": [],
        },
        "encounters": [],
    })
    assert response.status_code == 200
    body = response.get_json()
    assert body["character"]["class_id"] is None
    assert body["character"]["faction_id"] is None
    assert body["character"]["home_location_id"] is None
    assert body["interaction_profile"]["dialogue_tree_id"] is None
