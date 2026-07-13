from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_content_packs import ContentPack
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_items import Item, ItemType
from backend.app.models.m_location_pois import LocationPoi, PoiType
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import ArcType, StoryArc
from backend.app.models.m_requirements import Requirement, RequirementMinFactionReputation, RequirementRequiredFlag
from backend.app.models.m_shops import Shop
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.routes import r_ui_dependencies, r_ui_item_ecosystem, r_ui_quests


def _client(monkeypatch, module):
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(module, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(module.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        Character(id="char-1", slug="char", name="Guide", level=1),
        ContentPack(id="pack-1", slug="pack", name="Pack", description="Pack"),
        Flag(id="flag-1", slug="flag", name="Flag", description="Flag", flag_type=FlagType.StoryProgress),
        Item(id="item-1", slug="item", name="Item", type=ItemType.Misc, base_price=1, tags=[]),
        Item(id="item-2", slug="other", name="Other", type=ItemType.Misc, base_price=1, tags=[]),
        Location(id="loc-1", slug="loc", name="Location"),
        Shop(id="shop-1", slug="shop", name="Shop", price_multiplier=1.5, price_modifier=2, tags=[]),
        Quest(id="quest-1", slug="quest", title="Quest", description="Quest", objectives=[], item_rewards=[{"item_id": "item-1", "quantity": 1}, {"item_id": "item-2", "quantity": 2}], flags_set_on_completion=["flag-1"], tags=[]),
        Encounter(id="enc-1", slug="enc", name="Encounter", encounter_type=EncounterType.Combat, participants=[], rewards={"items": [{"item_id": "item-2", "quantity": 1}]}, tags=[]),
        Event(id="event-1", slug="event", title="Event", type=EventType.ItemReward, item_rewards=[], flags_set=[], tags=[]),
    ])
    session.flush()
    session.add_all([
        CombatProfile(id="combat-1", character_id="char-1", loot_table=[], tags=[]),
        InteractionProfile(id="interaction-1", character_id="char-1", available_quests=[], inventory=[], flags_set_on_interaction=[], tags=[]),
        StoryArc(id="arc-1", slug="arc", title="Arc", summary="Arc", type=ArcType.Side, content_pack_id="pack-1", related_quests=[], branching=[], required_flags=[], tags=[]),
        LocationPoi(id="poi-1", slug="poi", location_id="loc-1", name="POI", poi_type=PoiType.LootNode, item_id="item-2", coordinates={}, tags=[]),
    ])
    session.commit()
    session.close()


def test_item_ecosystem_preserves_unrelated_rewards_and_blocks_occupied_poi(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_item_ecosystem)
    _seed(Session)
    packet = client.get("/api/ui/items/ecosystem/item-1").get_json()
    packet["sources"]["quest_rewards"] = [{"owner_id": "quest-1", "entry": {"item_id": "item-1", "quantity": 3}}]
    response = client.post("/api/ui/items/ecosystem/bundle", json={"item": packet["item"], "sources": packet["sources"]})
    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(Quest, "quest-1").item_rewards == [{"item_id": "item-2", "quantity": 2}, {"item_id": "item-1", "quantity": 3}]
    session.close()
    packet = response.get_json()
    packet["sources"]["poi_ids"] = ["poi-1"]
    blocked = client.post("/api/ui/items/ecosystem/bundle", json={"item": packet["item"], "sources": packet["sources"]})
    assert blocked.status_code == 400
    assert "occupied" in blocked.get_json()["message"]


def test_item_ecosystem_preserves_repeated_rewards_for_one_owner(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_item_ecosystem)
    _seed(Session)
    packet = client.get("/api/ui/items/ecosystem/item-1").get_json()
    packet["sources"]["quest_rewards"] = [
        {"owner_id": "quest-1", "entry": {"item_id": "item-1", "quantity": 1}},
        {"owner_id": "quest-1", "entry": {"item_id": "item-1", "quantity": 2}},
    ]
    response = client.post("/api/ui/items/ecosystem/bundle", json={"item": packet["item"], "sources": packet["sources"]})
    assert response.status_code == 200, response.get_json()
    session = Session()
    rewards = session.get(Quest, "quest-1").item_rewards
    assert rewards[-2:] == [{"item_id": "item-1", "quantity": 1}, {"item_id": "item-1", "quantity": 2}]
    session.close()


def test_item_ecosystem_packet_includes_analysis_labels_and_pricing(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_item_ecosystem)
    _seed(Session)
    session = Session()
    session.add(Requirement(id="req-1", slug="requires-flag", tags=[]))
    session.flush()
    location = session.get(Location, "loc-1")
    location.sort_order = 3
    location.level_range = {"min": 4, "max": 8}
    shop = session.get(Shop, "shop-1")
    shop.location_id = "loc-1"
    shop.requirements_id = "req-1"
    session.add(ShopInventory(id="inv-1", slug="inv", shop_id="shop-1", item_id="item-1", price_multiplier=2, tags=[]))
    session.commit()
    session.close()
    payload = client.get("/api/ui/items/ecosystem/item-1").get_json()
    assert payload["analysis"]["total_sources"] == 2
    assert payload["analysis"]["source_counts"]["quest_rewards"] == 1
    assert payload["catalogs"]["combat_profiles"][0]["label"]["name"] == "Guide"
    assert payload["catalogs"]["pois"][0]["location"]["name"] == "Location"
    assert payload["catalogs"]["locations"][0]["level_range"] == {"min": 4, "max": 8}
    assert payload["catalogs"]["locations"][0]["sort_order"] == 3
    assert payload["catalogs"]["shops"][0]["location_id"] == "loc-1"
    assert payload["catalogs"]["shops"][0]["requirements_id"] == "req-1"
    assert payload["catalogs"]["characters"][0]["level"] == 1
    assert payload["sources"]["shop_inventory"][0]["pricing"]["buy_price"] == 7
    assert any(row["channel"] == "quest_rewards" and row["owner_id"] == "quest-1" for row in payload["analysis"]["provenance"])
    assert payload["analysis"]["families"][0]["item"]["id"] == "item-2"


def test_item_ecosystem_analysis_reports_acquisition_channels_for_important_items(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_item_ecosystem)
    _seed(Session)
    session = Session()
    item = session.get(Item, "item-1")
    item.type = ItemType.Quest
    session.add(ShopInventory(id="inv-1", slug="inv", shop_id="shop-1", item_id="item-1", tags=[]))
    session.commit()
    session.close()

    payload = client.get("/api/ui/items/ecosystem/item-1").get_json()
    assert payload["analysis"]["acquisition_channel_count"] == 2
    assert {row["key"] for row in payload["analysis"]["acquisition_channels"]} == {
        "shop_inventory",
        "quest_rewards",
    }
    assert any("multiple acquisition channels" in warning for warning in payload["analysis"]["warnings"])


def test_new_item_ecosystem_creates_item_and_sources_atomically(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_item_ecosystem)
    _seed(Session)
    packet = client.get("/api/ui/items/ecosystem-new").get_json()
    item_id = packet["item"]["id"]
    packet["item"].update({"name": "New Blade", "slug": "new-blade", "type": "Weapon", "base_price": 25})
    packet["sources"]["shop_inventory"] = [{
        "id": "inv-new",
        "slug": "inv-new",
        "shop_id": "shop-1",
        "item_id": item_id,
        "price_multiplier": 1,
        "price_modifier": 0,
        "tags": [],
    }]
    response = client.post("/api/ui/items/ecosystem/bundle", json={
        "item": packet["item"],
        "requirement": None,
        "sources": packet["sources"],
    })
    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(Item, item_id).name == "New Blade"
    assert session.get(ShopInventory, "inv-new").item_id == item_id
    session.close()


def test_item_ecosystem_broken_event_reward_rolls_back_item_edit(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_item_ecosystem)
    _seed(Session)
    packet = client.get("/api/ui/items/ecosystem/item-1").get_json()
    packet["item"]["name"] = "Should Roll Back"
    packet["sources"]["event_rewards"] = [{"owner_id": "event-1", "entry": {"item_id": "item-1"}}]
    response = client.post("/api/ui/items/ecosystem/bundle", json={"item": packet["item"], "sources": packet["sources"]})
    assert response.status_code == 400
    session = Session()
    assert session.get(Item, "item-1").name == "Item"
    session.close()


def test_quest_bundle_reconciles_arc_and_giver(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_quests)
    _seed(Session)
    quest = client.get("/api/ui/quests/quest-1").get_json()["quest"]
    response = client.post("/api/ui/quests/bundle", json={
        "quest": quest,
        "requirements": [],
        "arc": {"story_arc_id": "arc-1", "related_quests": ["quest-1"], "branches": []},
        "quest_giver_profile_ids": ["interaction-1"],
    })
    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(StoryArc, "arc-1").related_quests == ["quest-1"]
    assert session.get(InteractionProfile, "interaction-1").available_quests == ["quest-1"]
    session.close()


def test_quest_packet_dependency_context_includes_labeled_nodes(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_quests)
    _seed(Session)
    session = Session()
    session.add(Requirement(id="req-1", slug="requires-flag", tags=[]))
    session.flush()
    session.add(RequirementRequiredFlag(id="req-flag-1", requirement_id="req-1", flag_id="flag-1"))
    session.get(Quest, "quest-1").requirements_id = "req-1"
    session.add(Quest(id="quest-2", slug="next", title="Next Quest", description="Next", requirements_id="req-1", objectives=[], flags_set_on_completion=[], item_rewards=[], tags=[]))
    session.commit()
    session.close()

    packet = client.get("/api/ui/quests/quest-1").get_json()

    node_ids = {node["id"] for node in packet["dependency_context"]["nodes"]}
    assert {"quests:quest-1", "flag:flag-1", "requirement:req-1", "quests:quest-2"} <= node_ids
    labels = {node["id"]: node["label"] for node in packet["dependency_context"]["nodes"]}
    assert labels["quests:quest-2"] == "Next Quest"


def test_quest_packet_round_trip_preserves_originating_branches(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_quests)
    _seed(Session)
    session = Session()
    session.add(Quest(id="quest-2", slug="quest-2", title="Quest 2", description="Quest 2", objectives=[], flags_set_on_completion=[], item_rewards=[], tags=[]))
    session.flush()
    arc = session.get(StoryArc, "arc-1")
    arc.related_quests = ["quest-1", "quest-2"]
    arc.branching = [{"quest_id": "quest-1", "branches": [{"condition_flag": "flag-1", "next_quest_id": "quest-2"}]}]
    session.get(Quest, "quest-1").story_arc_id = "arc-1"
    session.commit()
    session.close()
    packet = client.get("/api/ui/quests/quest-1").get_json()
    assert packet["arc"]["branches"] == [{"condition_flag": "flag-1", "next_quest_id": "quest-2"}]
    response = client.post("/api/ui/quests/bundle", json=packet)
    assert response.status_code == 200, response.get_json()
    session = Session()
    assert session.get(StoryArc, "arc-1").branching == [{"quest_id": "quest-1", "branches": [{"condition_flag": "flag-1", "next_quest_id": "quest-2"}]}]
    session.close()


def test_dependency_index_marks_flag_source(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_dependencies)
    _seed(Session)
    payload = client.get("/api/ui/dependencies").get_json()
    assert any(edge["relation"] == "sets" and edge["source"] == "quests:quest-1" for edge in payload["edges"])


def test_dependency_index_exposes_reputation_rewards_and_gates(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_dependencies)
    _seed(Session)
    session = Session()
    session.add(Faction(id="faction-1", slug="wardens", name="Wardens", alignment=Alignment.Neutral, relationships={}, reputation_config={}, tags=[]))
    session.add(Requirement(id="req-reputation", slug="trusted-by-wardens", tags=[]))
    session.flush()
    session.add(RequirementMinFactionReputation(id="req-reputation-row", requirement_id="req-reputation", faction_id="faction-1", min_value=10))
    quest = session.get(Quest, "quest-1")
    quest.reputation_rewards = [{"faction_id": "faction-1", "amount": 12}]
    session.get(Event, "event-1").requirements_id = "req-reputation"
    session.commit()
    session.close()

    payload = client.get("/api/ui/dependencies").get_json()

    assert any(node["id"] == "faction_reputation:faction-1" for node in payload["nodes"])
    assert any(edge["relation"] == "grants_reputation" and edge["metadata"]["amount"] == 12 for edge in payload["edges"])
    assert any(edge["relation"] == "reputation_required_by" and edge["metadata"]["minimum"] == 10 for edge in payload["edges"])


def test_dependency_index_adds_inferred_unlocks_and_cycles(monkeypatch):
    client, Session = _client(monkeypatch, r_ui_dependencies)
    _seed(Session)
    session = Session()
    session.add(Requirement(id="req-1", slug="req", tags=[]))
    session.flush()
    session.add(RequirementRequiredFlag(id="req-flag-1", requirement_id="req-1", flag_id="flag-1"))
    session.get(Event, "event-1").requirements_id = "req-1"
    session.add(Event(id="event-2", slug="event-2", title="Event 2", type=EventType.ItemReward, next_event_id="event-1", item_rewards=[], flags_set=[], tags=[]))
    session.get(Event, "event-1").next_event_id = "event-2"
    session.commit()
    session.close()
    payload = client.get("/api/ui/dependencies").get_json()
    assert any(edge["relation"] == "unlocks" and edge["explicit"] is False for edge in payload["edges"])
    assert payload["health"]["cycles"]
