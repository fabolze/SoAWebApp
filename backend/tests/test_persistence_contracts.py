import json
from pathlib import Path

from flask import Flask, jsonify
from sqlalchemy import Boolean, Enum, Float, Integer, JSON, String, Text, create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import backend.app.models
from backend.app.models.base import Base
from backend.app.models.m_flags import Flag
from backend.app.routes import base_route, r_flags
from backend.app.routes.r_content_packs import ContentPackRoute
from backend.app.routes.r_currencies import CurrencyRoute
from backend.app.routes.r_shop_inventory import ShopInventoryRoute


SCHEMAS_DIR = Path(__file__).parents[1] / "app" / "schemas"
VIRTUAL_SCHEMA_FIELDS = {
    "abilities": {"effects", "scaling"},
    "attributes": {"results_in"},
    "items": {"stat_modifiers", "attribute_modifiers"},
    "requirements": {"required_flags", "forbidden_flags", "min_faction_reputation"},
    "shops": {"inventory"},
}
LEGACY_COLUMNS = {"abilities": {"requirements"}}


def _schema(table_name):
    return json.loads((SCHEMAS_DIR / f"{table_name}.json").read_text(encoding="utf-8-sig"))


def test_resource_schema_fields_and_column_types_stay_aligned():
    for table in Base.metadata.tables.values():
        schema_path = SCHEMAS_DIR / f"{table.name}.json"
        if not schema_path.exists():
            continue
        schema = _schema(table.name)
        properties = schema.get("properties", {})
        columns = {column.name: column for column in table.columns}

        assert set(properties) - set(columns) <= VIRTUAL_SCHEMA_FIELDS.get(table.name, set())
        assert set(columns) - set(properties) <= LEGACY_COLUMNS.get(table.name, set())

        for name, column in columns.items():
            if name not in properties:
                continue
            expected = properties[name].get("type")
            if isinstance(column.type, Integer):
                assert expected == "integer", f"{table.name}.{name}"
            elif isinstance(column.type, Float):
                assert expected == "number", f"{table.name}.{name}"
            elif isinstance(column.type, Boolean):
                assert expected == "boolean", f"{table.name}.{name}"
            elif isinstance(column.type, JSON):
                assert expected in {"array", "object"}, f"{table.name}.{name}"
            elif isinstance(column.type, Enum):
                assert expected == "string", f"{table.name}.{name}"
            elif isinstance(column.type, (String, Text)):
                assert expected == "string", f"{table.name}.{name}"


def test_faction_reputation_has_cascading_database_foreign_key():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    foreign_keys = inspect(engine).get_foreign_keys("requirement_min_faction_reputation")
    faction_fk = next(foreign_key for foreign_key in foreign_keys if foreign_key["constrained_columns"] == ["faction_id"])

    assert faction_fk["referred_table"] == "factions"
    assert faction_fk["referred_columns"] == ["id"]
    assert faction_fk["options"]["ondelete"] == "CASCADE"


def test_schema_lookup_handles_bom_and_table_name_aliases():
    assert ContentPackRoute().get_schema_required_fields() == ["id", "slug", "name"]
    assert CurrencyRoute().get_schema_required_fields() == ["id", "slug", "name", "type"]
    assert ShopInventoryRoute().get_schema_required_fields() == ["id", "slug", "shop_id", "item_id"]


def _flags_client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(base_route, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_flags.bp)
    return app.test_client(), Session


def test_common_persistence_normalizes_blank_references_and_string_tags(monkeypatch):
    client, Session = _flags_client(monkeypatch)
    response = client.post("/api/flags", json={
        "id": "flag-1",
        "slug": "FLAG-ONE",
        "name": "Flag",
        "description": "Description",
        "content_pack_id": "",
        "tags": "Story",
    })

    assert response.status_code == 200
    session = Session()
    flag = session.get(Flag, "flag-1")
    assert flag.content_pack_id is None
    assert flag.tags == ["story"]
    session.close()


def test_common_persistence_rejects_wrong_json_shape(monkeypatch):
    client, _ = _flags_client(monkeypatch)
    response = client.post("/api/flags", json={
        "id": "flag-1",
        "slug": "flag-one",
        "name": "Flag",
        "description": "Description",
        "tags": {"wrong": "shape"},
    })

    assert response.status_code == 400
    assert "tags must be an array" in response.get_json()["message"]
