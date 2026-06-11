from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_abilities import Ability, AbilityType, Targeting
from backend.app.models.m_abilities_links import AbilityEffectLink
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_effects import Effect, EffectTarget, EffectType
from backend.app.models.m_items import DamageType, Item, ItemType
from backend.app.models.m_stats import Stat, StatCategory, ValueType
from backend.app.models.m_statuses import Status, StatusCategory
from backend.app.models.m_talent_trees import TalentNode, TalentNodeType, TalentTree
from backend.app.routes import r_ui_abilities


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_abilities, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_abilities.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        Stat(id="stat-1", slug="power", name="Power", category=StatCategory.Magic, value_type=ValueType.Float, tags=[]),
        Status(id="status-shared", slug="burn", name="Burn", category=StatusCategory.DoT, tags=[]),
        Effect(
            id="effect-shared",
            slug="shared-fire",
            name="Shared Fire",
            type=EffectType.Damage,
            target=EffectTarget.Enemy,
            value=10,
            damage_type=DamageType.Fire,
            tags=[],
        ),
        Ability(
            id="ability-old",
            slug="old",
            name="Old Ability",
            type=AbilityType.Active,
            targeting=Targeting.Single,
            tags=[],
        ),
        Character(id="char-1", slug="fighter", name="Fighter", level=1),
        CharacterClass(
            id="class-1",
            slug="mage",
            name="Mage",
            role=ClassRole.Damage,
            base_stats=[],
            starting_abilities=["ability-old"],
            tags=[],
        ),
        TalentTree(id="tree-1", slug="tree", name="Tree", tags=[]),
        Item(id="item-1", slug="wand", name="Wand", type=ItemType.Weapon, base_price=1, effects=["effect-shared"], tags=[]),
    ])
    session.flush()
    session.add_all([
        AbilityEffectLink(ability_id="ability-old", effect_id="effect-shared"),
        CombatProfile(id="profile-1", character_id="char-1", custom_abilities=["ability-old"], tags=[]),
        TalentNode(
            id="node-1",
            slug="node",
            tree_id="tree-1",
            name="Node",
            node_type=TalentNodeType.Active,
            granted_abilities=["ability-old"],
            tags=[],
        ),
    ])
    session.commit()
    session.close()


def _ability(ability_id="ability-new", effects=None):
    return {
        "id": ability_id,
        "slug": ability_id,
        "name": "Spellcraft Ability",
        "type": "Active",
        "targeting": "Single",
        "trigger_condition": "On Use",
        "damage_type_source": "None",
        "resource_cost": 5,
        "cooldown": 2,
        "effects": effects or [],
        "scaling": [],
        "tags": [],
    }


def test_bundle_creates_ability_effect_status_and_assignment_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    response = client.post("/api/ui/abilities/bundle", json={
        "ability": _ability(effects=["effect-new"]),
        "effect_upserts": [{
            "id": "effect-new",
            "slug": "apply-freeze",
            "name": "Apply Freeze",
            "type": "Status",
            "target": "Enemy",
            "status_id": "status-new",
            "apply_chance": 100,
            "tags": [],
        }],
        "status_upserts": [{
            "id": "status-new",
            "slug": "freeze",
            "name": "Freeze",
            "category": "Control",
            "tags": [],
        }],
        "assigned_combat_profile_ids": ["profile-1"],
    })
    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(Ability, "ability-new")
    assert session.get(Effect, "effect-new").status_id == "status-new"
    assert session.get(Status, "status-new").name == "Freeze"
    assert session.get(CombatProfile, "profile-1").custom_abilities == ["ability-old", "ability-new"]
    session.close()


def test_clone_upsert_keeps_shared_effect_unchanged(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    response = client.post("/api/ui/abilities/bundle", json={
        "ability": _ability(effects=["effect-clone"]),
        "effect_upserts": [{
            "id": "effect-clone",
            "slug": "shared-fire-variant",
            "name": "Shared Fire Variant",
            "type": "Damage",
            "target": "Enemy",
            "value": 30,
            "damage_type": "Fire",
            "tags": [],
        }],
        "status_upserts": [],
        "assigned_combat_profile_ids": [],
    })
    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(Effect, "effect-shared").value == 10
    assert session.get(Effect, "effect-clone").value == 30
    assert session.get(Item, "item-1").effects == ["effect-shared"]
    session.close()


def test_explicit_shared_effect_edit_and_usage_analysis(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    packet = client.get("/api/ui/abilities/ability-old").get_json()
    assert packet["usage"]["abilities"]["ability-old"]["combat_profiles"][0]["id"] == "profile-1"
    assert packet["usage"]["abilities"]["ability-old"]["characterclasses"][0]["id"] == "class-1"
    assert packet["usage"]["abilities"]["ability-old"]["talent_nodes"][0]["id"] == "node-1"
    assert packet["usage"]["effects"]["effect-shared"]["items"][0]["id"] == "item-1"

    response = client.post("/api/ui/abilities/bundle", json={
        "ability": packet["ability"],
        "effect_upserts": [{
            "id": "effect-shared",
            "slug": "shared-fire",
            "name": "Shared Fire",
            "type": "Damage",
            "target": "Enemy",
            "value": 22,
            "damage_type": "Fire",
            "tags": [],
        }],
        "status_upserts": [],
        "assigned_combat_profile_ids": ["profile-1"],
    })
    assert response.status_code == 200, response.get_json()
    assert Session().get(Effect, "effect-shared").value == 22


def test_invalid_bundle_rolls_back_effect_and_ability(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    response = client.post("/api/ui/abilities/bundle", json={
        "ability": _ability(effects=["effect-new"]),
        "effect_upserts": [{
            "id": "effect-new",
            "slug": "new-effect",
            "name": "New Effect",
            "type": "Damage",
            "target": "Enemy",
            "value": 20,
            "tags": [],
        }],
        "status_upserts": [],
        "assigned_combat_profile_ids": ["missing-profile"],
    })
    assert response.status_code == 400
    session = Session()
    assert session.get(Ability, "ability-new") is None
    assert session.get(Effect, "effect-new") is None
    session.close()


def test_bundle_accepts_blank_optional_damage_type_as_unset(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    ability = _ability()
    ability["damage_type"] = ""

    response = client.post("/api/ui/abilities/bundle", json={
        "ability": ability,
        "effect_upserts": [],
        "status_upserts": [],
        "assigned_combat_profile_ids": [],
    })

    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(Ability, "ability-new").damage_type is None
    session.close()


def test_bundle_saves_timed_links_advanced_status_and_relation(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    ability = _ability(effects=["effect-new"])
    ability["effect_links"] = [{"effect_id": "effect-new", "phase": "Aftermath", "turn_offset": 1.5, "sort_order": 2}]
    ability["design_intent"] = "Create a setup window."
    response = client.post("/api/ui/abilities/bundle", json={
        "ability": ability,
        "effect_upserts": [{
            "id": "effect-new", "slug": "burning", "name": "Burning", "type": "Status", "target": "Enemy",
            "status_id": "status-new", "status_operation": "Apply", "tags": [],
        }],
        "status_upserts": [{
            "id": "status-new", "slug": "burning", "name": "Burning", "category": "DoT", "polarity": "Harmful",
            "reapplication_policy": "AddIndependentStack", "stack_decay_policy": "Independent",
            "can_cleanse": True, "can_dispel": True, "tags": [],
        }],
        "relations": [{
            "id": "relation-1", "from_ability_id": "ability-new", "to_ability_id": "ability-old", "relation_type": "Setup",
        }],
        "assigned_combat_profile_ids": [],
    })
    assert response.status_code == 200, response.get_json()
    payload = response.get_json()
    assert payload["ability"]["effect_links"][0]["phase"] == "Aftermath"
    assert payload["ability"]["effect_links"][0]["turn_offset"] == 1.5
    assert payload["relations"][0]["relation_type"] == "Setup"
    assert payload["linked_statuses"][0]["reapplication_policy"] == "AddIndependentStack"
