import json

from flask import Flask
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_effects import Effect, EffectTarget, EffectType
from backend.app.models.m_items import EquipmentSet, Item, ItemType
from backend.app.db.init_db import _upgrade_sqlite_schema
from backend.app.routes import base_route, r_equipment_sets, r_items, r_ui_items
from backend.app.utils.csv_tools import build_csv_rows


def _app_with_session(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _foreign_keys(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def get_session():
        return Session()

    monkeypatch.setattr(base_route, "get_db_session", get_session)
    monkeypatch.setattr(r_equipment_sets, "get_db_session", get_session)
    monkeypatch.setattr(r_items, "get_db_session", get_session)
    monkeypatch.setattr(r_ui_items, "get_db_session", get_session)

    app = Flask(__name__)
    app.register_blueprint(r_equipment_sets.bp)
    app.register_blueprint(r_items.bp)
    app.register_blueprint(r_ui_items.bp)
    return app.test_client(), Session


def _item_payload(**overrides):
    payload = {
        "id": "item-1",
        "slug": "set-blade",
        "name": "Set Blade",
        "type": "Weapon",
        "base_price": 10,
        "equipment_slot": "main_hand",
        "weapon_type": "Longsword",
        "effects": [],
        "tags": [],
    }
    payload.update(overrides)
    return payload


def _set_payload(**overrides):
    payload = {
        "id": "set-1",
        "slug": "storm-guard",
        "name": "Storm Guard",
        "description": "Equipment for a storm-bound guardian.",
        "bonuses": [],
        "tags": ["storm"],
    }
    payload.update(overrides)
    return payload


def test_equipment_set_membership_preserves_weapon_type_and_lists_piece(monkeypatch):
    client, Session = _app_with_session(monkeypatch)

    assert client.post("/api/equipment-sets", json=_set_payload()).status_code == 200
    response = client.post(
        "/api/items",
        json=_item_payload(equipment_set_id="set-1"),
    )
    assert response.status_code == 200

    item = client.get("/api/items/item-1").get_json()
    assert item["type"] == "Weapon"
    assert item["weapon_type"] == "Longsword"
    assert item["equipment_set_id"] == "set-1"

    inspector_item = client.get("/api/ui/items/item-1").get_json()
    assert inspector_item["equipment_set"]["name"] == "Storm Guard"

    equipment_set = client.get("/api/equipment-sets/set-1").get_json()
    assert equipment_set["piece_count"] == 1
    assert equipment_set["pieces"][0]["id"] == "item-1"

    session = Session()
    try:
        persisted = session.get(Item, "item-1")
        assert persisted.type == ItemType.Weapon
        assert persisted.equipment_set_id == "set-1"
    finally:
        session.close()


def test_equipment_set_bonus_thresholds_are_sorted_and_validate_effects(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    session = Session()
    try:
        session.add(
            Effect(
                id="effect-1",
                slug="set-power",
                name="Set Power",
                type=EffectType.Modifier,
                target=EffectTarget.Self,
            )
        )
        session.commit()
    finally:
        session.close()

    response = client.post(
        "/api/equipment-sets",
        json=_set_payload(
            bonuses=[
                {
                    "required_pieces": 4,
                    "name": "Tempest",
                    "description": "Gain the full tempest effect.",
                    "effect_ids": ["effect-1"],
                },
                {
                    "required_pieces": 2,
                    "name": "Gathering Storm",
                    "effect_ids": [],
                },
            ]
        ),
    )
    assert response.status_code == 200
    payload = client.get("/api/equipment-sets/set-1").get_json()
    assert [bonus["required_pieces"] for bonus in payload["bonuses"]] == [2, 4]

    duplicate = client.post(
        "/api/equipment-sets",
        json=_set_payload(
            id="set-duplicate",
            slug="duplicate",
            bonuses=[
                {"required_pieces": 2, "effect_ids": []},
                {"required_pieces": 2, "effect_ids": []},
            ],
        ),
    )
    assert duplicate.status_code == 400

    missing_effect = client.post(
        "/api/equipment-sets",
        json=_set_payload(
            id="set-missing-effect",
            slug="missing-effect",
            bonuses=[{"required_pieces": 2, "effect_ids": ["missing"]}],
        ),
    )
    assert missing_effect.status_code == 400


def test_set_membership_rejects_non_equipment_items(monkeypatch):
    client, _Session = _app_with_session(monkeypatch)
    assert client.post("/api/equipment-sets", json=_set_payload()).status_code == 200

    response = client.post(
        "/api/items",
        json=_item_payload(
            type="Consumable",
            equipment_set_id="set-1",
            equipment_slot=None,
            weapon_type=None,
        ),
    )
    assert response.status_code == 400


def test_deleting_equipment_set_unassigns_pieces_without_deleting_items(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    assert client.post("/api/equipment-sets", json=_set_payload()).status_code == 200
    assert client.post(
        "/api/items",
        json=_item_payload(equipment_set_id="set-1"),
    ).status_code == 200

    assert client.delete("/api/equipment-sets/set-1").status_code == 200
    session = Session()
    try:
        item = session.get(Item, "item-1")
        assert item is not None
        assert item.equipment_set_id is None
        assert session.get(EquipmentSet, "set-1") is None
    finally:
        session.close()


def test_legacy_setpiece_payload_is_normalized_without_losing_weapon_fields(monkeypatch):
    client, _Session = _app_with_session(monkeypatch)
    response = client.post("/api/items", json=_item_payload(type="SetPiece"))
    assert response.status_code == 200

    item = client.get("/api/items/item-1").get_json()
    assert item["type"] == "Weapon"
    assert item["weapon_type"] == "Longsword"
    assert "SetPiece" not in {member.value for member in ItemType}


def test_equipment_set_schema_and_item_schema_expose_relationship():
    with open("backend/app/schemas/items.json", encoding="utf-8") as handle:
        item_schema = json.load(handle)
    with open("backend/app/schemas/equipment_sets.json", encoding="utf-8") as handle:
        set_schema = json.load(handle)

    assert "SetPiece" not in item_schema["properties"]["type"]["enum"]
    assert item_schema["properties"]["equipment_set_id"]["ui"]["reference"] == "equipment_sets"
    assert set_schema["properties"]["bonuses"]["items"]["properties"]["required_pieces"]["minimum"] == 1


def test_sqlite_upgrade_normalizes_legacy_setpiece_rows_with_partial_columns(tmp_path):
    db_path = tmp_path / "legacy-items.sqlite"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE equipment_sets (
                id VARCHAR PRIMARY KEY,
                slug VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                bonuses JSON
            )
        """))
        connection.execute(text("""
            CREATE TABLE items (
                id VARCHAR PRIMARY KEY,
                type VARCHAR NOT NULL,
                equipment_slot VARCHAR,
                weapon_type VARCHAR
            )
        """))
        connection.execute(text("""
            INSERT INTO items (id, type, equipment_slot, weapon_type) VALUES
                ('weapon-piece', 'SetPiece', 'main_hand', 'Longsword'),
                ('ring-piece', 'SetPiece', 'ring', NULL),
                ('armor-piece', 'SetPiece', 'chest', NULL)
        """))

    _upgrade_sqlite_schema(engine)

    assert "equipment_set_id" in {
        column["name"] for column in inspect(engine).get_columns("items")
    }
    with engine.connect() as connection:
        rows = dict(
            connection.execute(
                text("SELECT id, type FROM items ORDER BY id")
            ).all()
        )
    assert rows == {
        "armor-piece": "Armor",
        "ring-piece": "Accessory",
        "weapon-piece": "Weapon",
    }


def test_equipment_set_source_export_excludes_derived_piece_summaries():
    equipment_set = EquipmentSet(
        id="set-1",
        slug="storm-guard",
        name="Storm Guard",
        bonuses=[{"required_pieces": 2, "effect_ids": []}],
        tags=[],
    )
    columns, data_rows = build_csv_rows(
        "equipment_sets",
        EquipmentSet,
        [equipment_set],
        mode="source",
    )

    assert "bonuses" in columns
    assert "piece_count" not in columns
    assert "pieces" not in columns
    assert len(data_rows) == 1
