from flask import Flask
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import Aggression, CombatProfile, EnemyType
from backend.app.models.m_currencies import Currency, CurrencyType
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_items import Item, ItemType, Rarity
from backend.app.models.m_location_routes import LocationRoute, LocationRouteType
from backend.app.models.m_locations import Biome, Location
from backend.app.models.m_interaction_profiles import InteractionProfile, InteractionRole
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.routes import base_route
from backend.app.routes import r_location_routes, r_locations, r_shops, r_ui_characters, r_ui_items, r_ui_location_graph


def _app_with_session(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def get_session():
        return Session()

    monkeypatch.setattr(r_shops, "get_db_session", get_session)
    monkeypatch.setattr(r_location_routes, "get_db_session", get_session)
    monkeypatch.setattr(r_locations, "get_db_session", get_session)
    monkeypatch.setattr(r_ui_items, "get_db_session", get_session)
    monkeypatch.setattr(r_ui_characters, "get_db_session", get_session)
    monkeypatch.setattr(r_ui_location_graph, "get_db_session", get_session)
    monkeypatch.setattr(base_route, "get_db_session", get_session)

    app = Flask(__name__)
    app.register_blueprint(r_shops.bp)
    app.register_blueprint(r_location_routes.bp)
    app.register_blueprint(r_locations.bp)
    app.register_blueprint(r_ui_items.bp)
    app.register_blueprint(r_ui_characters.bp)
    app.register_blueprint(r_ui_location_graph.bp)
    return app.test_client(), Session


def _seed_item(Session, item_id="item-1", base_price=100):
    session = Session()
    try:
        currency = session.get(Currency, "gold") or Currency(
                id="gold",
                slug="gold",
                name="Gold",
                type=CurrencyType.Soft,
                code="GOLD",
                symbol="G",
                decimal_precision=0,
                is_premium=False,
            )
        item = Item(
            id=item_id,
            slug=item_id,
            name="Iron Test Blade",
            type=ItemType.Weapon,
            rarity=Rarity.Common,
            base_price=base_price,
            base_currency_id="gold",
            tags=["weapon"],
        )
        session.add_all([currency, item])
        session.commit()
    finally:
        session.close()


def _seed_currency(Session, currency_id, name, code, symbol):
    session = Session()
    try:
        session.add(Currency(
            id=currency_id,
            slug=currency_id,
            name=name,
            type=CurrencyType.Soft,
            code=code,
            symbol=symbol,
            decimal_precision=0,
            is_premium=False,
        ))
        session.commit()
    finally:
        session.close()


def test_shop_inline_inventory_persists_and_serializes_pricing(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_item(Session)

    response = client.post("/api/shops", json={
        "id": "shop-1",
        "slug": "test-shop",
        "name": "Test Shop",
        "price_multiplier": 1.5,
        "price_modifier": 5,
        "inventory": [
            {
                "id": "inv-1",
                "slug": "test-shop-item",
                "item_id": "item-1",
                "stock": 3,
                "price_multiplier": 2,
                "price_modifier": 3,
            }
        ],
    })

    assert response.status_code == 200

    payload = client.get("/api/shops/shop-1").get_json()
    assert payload["inventory"][0]["item_id"] == "item-1"
    assert payload["inventory"][0]["price_preview"]["buy_price"] == 313
    assert payload["inventory"][0]["price_preview"]["sell_price"] == 156.5


def test_shop_inline_inventory_update_replaces_rows(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_item(Session, "item-1")
    _seed_item(Session, "item-2", base_price=50)

    first = {
        "id": "shop-1",
        "slug": "test-shop",
        "name": "Test Shop",
        "inventory": [{"id": "inv-1", "slug": "row-one", "item_id": "item-1"}],
    }
    second = {
        **first,
        "inventory": [{"id": "inv-2", "slug": "row-two", "item_id": "item-2", "stock": 1}],
    }

    assert client.post("/api/shops", json=first).status_code == 200
    assert client.post("/api/shops", json=second).status_code == 200

    session = Session()
    try:
        rows = session.query(ShopInventory).filter_by(shop_id="shop-1").all()
        assert len(rows) == 1
        assert rows[0].id == "inv-2"
        assert rows[0].item_id == "item-2"
    finally:
        session.close()


def test_item_ui_route_returns_shop_sources(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_item(Session)

    assert client.post("/api/shops", json={
        "id": "shop-1",
        "slug": "test-shop",
        "name": "Test Shop",
        "inventory": [{"id": "inv-1", "slug": "row-one", "item_id": "item-1", "stock": 7}],
    }).status_code == 200

    payload = client.get("/api/ui/items/item-1").get_json()
    assert payload["id"] == "item-1"
    assert payload["base_currency"]["code"] == "GOLD"
    assert payload["shop_sources"][0]["shop_id"] == "shop-1"
    assert payload["shop_sources"][0]["stock"] == 7
    assert payload["shop_sources"][0]["pricing"]["buy_price"] == 100


def test_item_ui_route_sorts_shop_sources_and_uses_currency_fallback(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_item(Session)
    _seed_currency(Session, "silver", "Silver", "SILV", "S")
    _seed_currency(Session, "gems", "Gems", "GEM", "*")

    assert client.post("/api/shops", json={
        "id": "shop-b",
        "slug": "beta-shop",
        "name": "Beta Shop",
        "currency_id": "silver",
        "inventory": [{"id": "inv-b", "slug": "z-row", "item_id": "item-1", "stock": 2}],
    }).status_code == 200
    assert client.post("/api/shops", json={
        "id": "shop-a",
        "slug": "alpha-shop",
        "name": "Alpha Shop",
        "currency_id": "silver",
        "inventory": [{"id": "inv-a", "slug": "a-row", "item_id": "item-1", "stock": 1, "currency_id": "gems"}],
    }).status_code == 200

    payload = client.get("/api/ui/items/item-1").get_json()
    assert [source["shop_name"] for source in payload["shop_sources"]] == ["Alpha Shop", "Beta Shop"]
    assert payload["shop_sources"][0]["currency"]["code"] == "GEM"
    assert payload["shop_sources"][1]["currency"]["code"] == "SILV"


def test_item_ui_route_handles_item_without_optional_links(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_item(Session, "solo-item", base_price=12)

    payload = client.get("/api/ui/items/solo-item").get_json()
    assert payload["id"] == "solo-item"
    assert payload["effects"] == []
    assert payload["requirements"] is None
    assert payload["shop_sources"] == []
    assert payload["stat_modifiers"] == []
    assert payload["attribute_modifiers"] == []


def test_item_ui_route_404_for_missing_item(monkeypatch):
    client, _Session = _app_with_session(monkeypatch)
    response = client.get("/api/ui/items/missing")
    assert response.status_code == 404


def test_location_route_ignores_connected_locations(monkeypatch):
    client, Session = _app_with_session(monkeypatch)

    response = client.post("/api/locations", json={
        "id": "loc-1",
        "slug": "test-location",
        "name": "Test Location",
        "biome": "Forest",
        "connected_locations": ["loc-2"],
    })

    assert response.status_code == 200
    session = Session()
    try:
        location = session.get(Location, "loc-1")
        assert location is not None
        assert location.biome == Biome.Forest
        assert not hasattr(location, "connected_locations")
    finally:
        session.close()


def test_location_routes_crud_and_defaults(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    session = Session()
    try:
        session.add_all([
            Location(id="loc-a", slug="loc-a", name="A", biome=Biome.Forest),
            Location(id="loc-b", slug="loc-b", name="B", biome=Biome.City),
        ])
        session.commit()
    finally:
        session.close()

    response = client.post("/api/location_routes", json={
        "id": "route-1",
        "slug": "forest-road",
        "from_location_id": "loc-a",
        "to_location_id": "loc-b",
        "route_type": "Road",
    })

    assert response.status_code == 200
    route = Session().get(LocationRoute, "route-1")
    assert route.bidirectional is True
    assert route.travel_cost == 0
    assert route.travel_time == 0
    assert route.route_type == LocationRouteType.Road


def test_location_routes_validation(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    session = Session()
    try:
        session.add_all([
            Location(id="loc-a", slug="loc-a", name="A", biome=Biome.Forest),
            Location(id="loc-b", slug="loc-b", name="B", biome=Biome.City),
            Requirement(id="req-1", slug="req-1", tags=[]),
        ])
        session.commit()
    finally:
        session.close()

    same = client.post("/api/location_routes", json={
        "id": "route-same",
        "slug": "same",
        "from_location_id": "loc-a",
        "to_location_id": "loc-a",
        "route_type": "Road",
    })
    assert same.status_code == 400

    negative = client.post("/api/location_routes", json={
        "id": "route-negative",
        "slug": "negative",
        "from_location_id": "loc-a",
        "to_location_id": "loc-b",
        "route_type": "Road",
        "travel_cost": -1,
    })
    assert negative.status_code == 400

    missing_location = client.post("/api/location_routes", json={
        "id": "route-missing",
        "slug": "missing",
        "from_location_id": "loc-a",
        "to_location_id": "missing",
        "route_type": "Road",
    })
    assert missing_location.status_code == 400

    bad_enum = client.post("/api/location_routes", json={
        "id": "route-enum",
        "slug": "enum",
        "from_location_id": "loc-a",
        "to_location_id": "loc-b",
        "route_type": "Wormhole",
    })
    assert bad_enum.status_code == 400


def test_location_graph_endpoint_returns_nodes_edges_and_warnings(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    session = Session()
    try:
        session.add_all([
            Location(id="loc-a", slug="loc-a", name="A", biome=Biome.Forest, coordinates={"x": 10, "y": 20}),
            Location(id="loc-b", slug="loc-b", name="B", biome=Biome.City, coordinates={"x": 80, "y": 20}),
            LocationRoute(id="route-1", slug="road", from_location_id="loc-a", to_location_id="loc-b", route_type=LocationRouteType.Road),
            LocationRoute(id="route-broken", slug="broken", from_location_id="loc-a", to_location_id="missing", route_type=LocationRouteType.Trail),
        ])
        session.commit()
    finally:
        session.close()

    response = client.get("/api/ui/location_graph")
    assert response.status_code == 200
    payload = response.get_json()
    assert len(payload["locations"]) == 2
    assert len(payload["routes"]) == 2
    assert payload["locations"][0]["route_count"] >= 1
    assert payload["warnings"][0]["route_id"] == "route-broken"


def test_character_ui_route_returns_profiles_and_context(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    session = Session()
    try:
        char_class = CharacterClass(id="class-1", slug="fighter", name="Fighter", role=ClassRole.Tank, base_stats={})
        faction = Faction(id="faction-1", slug="guild", name="Guild", alignment=Alignment.Friendly)
        location = Location(id="loc-1", slug="haven", name="Haven", biome=Biome.City, region="North")
        character = Character(
            id="char-1",
            slug="test-hero",
            name="Test Hero",
            level=3,
            class_id="class-1",
            faction_id="faction-1",
            home_location_id="loc-1",
            tags=["npc"],
        )
        combat = CombatProfile(
            id="combat-1",
            character_id="char-1",
            enemy_type=EnemyType.Humanoid,
            aggression=Aggression.Neutral,
            custom_stats=[],
            custom_abilities=[],
            loot_table=[],
            currency_rewards=[],
            reputation_rewards=[],
            related_quests=[],
            tags=["duelist"],
        )
        interaction = InteractionProfile(
            id="interaction-1",
            character_id="char-1",
            role=InteractionRole.Merchant,
            available_quests=[],
            inventory=[],
            flags_set_on_interaction=[],
            tags=["merchant"],
        )
        session.add_all([char_class, faction, location, character, combat, interaction])
        session.commit()
    finally:
        session.close()

    payload = client.get("/api/ui/characters/char-1").get_json()

    assert payload["character"]["name"] == "Test Hero"
    assert payload["character"]["class_template"]["name"] == "Fighter"
    assert payload["character"]["faction"]["name"] == "Guild"
    assert payload["character"]["home_location"]["name"] == "Haven"
    assert payload["combat_profile"]["enemy_type"] == "humanoid"
    assert payload["combat_profile"]["aggression"] == "Neutral"
    assert payload["interaction_profile"]["role"] == "Merchant"


def test_character_ui_route_handles_missing_optional_profiles(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    session = Session()
    try:
        session.add(Character(id="char-2", slug="solo", name="Solo"))
        session.commit()
    finally:
        session.close()

    payload = client.get("/api/ui/characters/char-2").get_json()

    assert payload["character"]["id"] == "char-2"
    assert payload["combat_profile"] is None
    assert payload["interaction_profile"] is None


def test_character_ui_route_404_for_missing_character(monkeypatch):
    client, _Session = _app_with_session(monkeypatch)
    response = client.get("/api/ui/characters/missing")
    assert response.status_code == 404
