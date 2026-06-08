from io import BytesIO

from flask import Flask
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.init_db import _rebuild_locations_table_for_nullable_biome
from backend.app.models.base import Base
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_location_creative_briefs import LocationCreativeBrief
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_location_pois import LocationPoi, PoiType
from backend.app.models.m_location_routes import LocationRoute, LocationRouteType
from backend.app.models.m_locations import Biome, BiomeInheritance, Location, LocationType, PlaceKind
from backend.app.models.m_route_event_bindings import RouteEventBinding
from backend.app.models.m_travel_tuning import TravelTuning
from backend.app.routes import base_route
from backend.app.routes import (
    r_location_creative_briefs,
    r_location_encounter_tables,
    r_location_pois,
    r_location_routes,
    r_locations,
    r_export,
    r_route_event_bindings,
    r_travel_tuning,
    r_ui_world_builder,
)
from backend.app.utils import csv_tools


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

    for module in [
        r_locations,
        r_location_routes,
        r_location_pois,
        r_location_encounter_tables,
        r_route_event_bindings,
        r_travel_tuning,
        r_location_creative_briefs,
        r_ui_world_builder,
        base_route,
    ]:
        monkeypatch.setattr(module, "get_db_session", get_session, raising=False)

    app = Flask(__name__)
    for bp in [
        r_locations.bp,
        r_location_routes.bp,
        r_location_pois.bp,
        r_location_encounter_tables.bp,
        r_route_event_bindings.bp,
        r_travel_tuning.bp,
        r_location_creative_briefs.bp,
        r_ui_world_builder.bp,
    ]:
        app.register_blueprint(bp)
    return app.test_client(), Session


def _seed_world(Session):
    session = Session()
    try:
        session.add_all([
            Location(id="world", slug="world", name="World", biome=Biome.Plains, location_type=LocationType.World, is_safe_zone=True),
            Location(id="zone", slug="zone", name="Zone", biome=Biome.Forest, parent_location_id="world", location_type=LocationType.Zone),
            LocationRoute(id="route-1", slug="route-1", from_location_id="world", to_location_id="zone", route_type=LocationRouteType.Road),
            Encounter(id="enc-1", slug="enc-1", name="Encounter", encounter_type=EncounterType.Combat, participants=[]),
            Event(id="event-1", slug="event-1", title="Event", type=EventType.Encounter, encounter_id="enc-1"),
        ])
        session.commit()
    finally:
        session.close()


def test_location_hierarchy_fields_persist(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    response = client.post("/api/locations", json={
        "id": "room-1",
        "slug": "room-1",
        "name": "Room",
        "biome": "Ruins",
        "parent_location_id": "zone",
        "location_type": "Room",
        "sort_order": 2,
        "is_playable_space": True,
        "is_world_map_node": False,
    })

    assert response.status_code == 200
    location = Session().get(Location, "room-1")
    assert location.parent_location_id == "zone"
    assert location.location_type == LocationType.Room
    assert location.sort_order == 2
    assert location.is_world_map_node is False


def test_location_place_kind_and_optional_biome(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    response = client.post("/api/locations", json={
        "id": "village-1",
        "slug": "village-1",
        "name": "Village",
        "location_type": "Zone",
        "place_kind": "Settlement",
        "environment_tags": ["village", "market"],
        "biome_inheritance": "None",
    })

    assert response.status_code == 200
    location = Session().get(Location, "village-1")
    assert location.biome is None
    assert location.place_kind == PlaceKind.Settlement
    assert location.environment_tags == ["village", "market"]
    assert location.biome_inheritance == BiomeInheritance.None_


def test_optional_world_references_clear_to_none(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    location_response = client.post("/api/locations", json={
        "id": "room-blank-parent",
        "slug": "room-blank-parent",
        "name": "Room Blank Parent",
        "biome": "Ruins",
        "parent_location_id": "",
        "location_type": "",
    })
    assert location_response.status_code == 200
    location = Session().get(Location, "room-blank-parent")
    assert location.parent_location_id is None
    assert location.location_type == LocationType.Zone

    poi_response = client.post("/api/location_pois", json={
        "id": "poi-blank-links",
        "slug": "poi-blank-links",
        "location_id": "zone",
        "name": "Blank Links",
        "poi_type": "DiscoveryPoint",
        "requirements_id": "",
        "event_id": "",
        "dialogue_id": "",
        "encounter_id": "",
        "item_id": "",
    })
    assert poi_response.status_code == 200
    poi = Session().get(LocationPoi, "poi-blank-links")
    assert poi.requirements_id is None
    assert poi.event_id is None
    assert poi.dialogue_id is None
    assert poi.encounter_id is None
    assert poi.item_id is None

    binding_response = client.post("/api/route_event_bindings", json={
        "id": "binding-blank-req",
        "slug": "binding-blank-req",
        "route_id": "route-1",
        "event_id": "event-1",
        "trigger_mode": "Always",
        "requirements_id": "",
    })
    assert binding_response.status_code == 200
    assert Session().get(RouteEventBinding, "binding-blank-req").requirements_id is None

    tuning_response = client.post("/api/travel_tuning", json={
        "id": "tuning-blank-enums",
        "slug": "tuning-blank-enums",
        "name": "Blank Enum Tuning",
        "route_type": "",
        "biome": "",
    })
    assert tuning_response.status_code == 200
    tuning = Session().get(TravelTuning, "tuning-blank-enums")
    assert tuning.route_type is None
    assert tuning.place_kind is None
    assert tuning.biome is None


def test_location_poi_crud_and_validation(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    good = client.post("/api/location_pois", json={
        "id": "poi-1",
        "slug": "ancient-door",
        "location_id": "zone",
        "name": "Ancient Door",
        "poi_type": "Door",
        "event_id": "event-1",
    })
    assert good.status_code == 200
    assert Session().get(LocationPoi, "poi-1").poi_type == PoiType.Door

    bad = client.post("/api/location_pois", json={
        "id": "poi-2",
        "slug": "missing",
        "location_id": "missing",
        "name": "Missing",
        "poi_type": "Door",
    })
    assert bad.status_code == 400


def test_location_encounter_table_validates_entries(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    good = client.post("/api/location_encounter_tables", json={
        "id": "table-1",
        "slug": "forest-night",
        "location_id": "zone",
        "name": "Forest Night",
        "encounter_entries": [{"encounter_id": "enc-1", "weight": 3, "spawn_group": "night", "min_count": 1, "max_count": 2}],
    })
    assert good.status_code == 200
    table = Session().get(LocationEncounterTable, "table-1")
    assert table.encounter_entries[0]["weight"] == 3.0

    bad = client.post("/api/location_encounter_tables", json={
        "id": "table-2",
        "slug": "bad",
        "location_id": "zone",
        "name": "Bad",
        "encounter_entries": [{"encounter_id": "missing", "weight": 1}],
    })
    assert bad.status_code == 400


def test_route_events_travel_tuning_and_creative_brief(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    assert client.post("/api/route_event_bindings", json={
        "id": "binding-1",
        "slug": "road-ambush",
        "route_id": "route-1",
        "event_id": "event-1",
        "trigger_mode": "RandomChance",
        "chance": 25,
    }).status_code == 200
    assert Session().get(RouteEventBinding, "binding-1").chance == 25

    invalid_chance = client.post("/api/route_event_bindings", json={
        "id": "binding-2",
        "slug": "bad",
        "route_id": "route-1",
        "event_id": "event-1",
        "trigger_mode": "RandomChance",
        "chance": 120,
    })
    assert invalid_chance.status_code == 400

    assert client.post("/api/travel_tuning", json={
        "id": "tuning-1",
        "slug": "forest-road",
        "name": "Forest Road",
        "route_type": "Road",
        "place_kind": "Wilderness",
        "biome": "Forest",
        "encounter_chance": 10,
        "travel_time_multiplier": 1.2,
    }).status_code == 200
    tuning = Session().get(TravelTuning, "tuning-1")
    assert tuning.place_kind == PlaceKind.Wilderness
    assert tuning.risk_score == 0

    assert client.post("/api/location_creative_briefs", json={
        "id": "brief-1",
        "slug": "zone-brief",
        "location_id": "zone",
        "mood": "quiet dread",
        "concept_refs": ["misty pine road"],
    }).status_code == 200
    assert Session().get(LocationCreativeBrief, "brief-1").mood == "quiet dread"


def test_world_builder_endpoint_returns_world_packets(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)
    client.post("/api/location_pois", json={"id": "poi-1", "slug": "shrine", "location_id": "zone", "name": "Shrine", "poi_type": "Shrine"})

    payload = client.get("/api/ui/world_builder").get_json()

    assert len(payload["locations"]) == 2
    assert len(payload["routes"]) == 1
    assert "events" in payload
    assert "encounters" in payload
    assert "quests" in payload
    assert "story_arcs" in payload
    assert payload["locations"][1]["effective_biome"] == "Forest"
    assert payload["pois"][0]["poi_type"] == "Shrine"


def test_world_builder_bundle_saves_linked_world_records_atomically(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    response = client.post("/api/ui/world_builder/bundle", json={
        "locations": [{
            "id": "subzone",
            "slug": "subzone",
            "name": "Subzone",
            "parent_location_id": "zone",
            "location_type": "Subzone",
            "place_kind": "Wilderness",
            "environment_tags": ["mist"],
            "level_range": {"min": 2, "max": 5},
            "coordinates": {"x": 20, "y": 30},
            "encounters": ["enc-1"],
            "tags": ["World"],
        }],
        "routes": [{
            "id": "route-2",
            "slug": "route-2",
            "from_location_id": "zone",
            "to_location_id": "subzone",
            "route_type": "Trail",
            "travel_cost": 1,
            "travel_time": 2,
            "tags": ["Trail"],
        }],
        "pois": [{
            "id": "poi-1",
            "slug": "poi-1",
            "location_id": "subzone",
            "name": "Marker",
            "poi_type": "DiscoveryPoint",
            "coordinates": {"x": 1, "y": 2},
            "tags": [],
        }],
        "encounter_tables": [{
            "id": "table-1",
            "slug": "table-1",
            "location_id": "subzone",
            "name": "Table",
            "environmental_modifiers": ["mist"],
            "encounter_entries": [{"encounter_id": "enc-1", "weight": 2, "min_count": 1, "max_count": 2}],
            "tags": [],
        }],
        "route_event_bindings": [{
            "id": "binding-1",
            "slug": "binding-1",
            "route_id": "route-2",
            "event_id": "event-1",
            "trigger_mode": "RandomChance",
            "chance": 25,
            "priority": 1,
            "cooldown": 0,
            "tags": [],
        }],
        "travel_tuning": [{
            "id": "tuning-1",
            "slug": "tuning-1",
            "name": "Tuning",
            "route_type": "Trail",
            "encounter_chance": 10,
            "travel_time_multiplier": 1.2,
            "travel_cost_multiplier": 1,
            "safe_zone_multiplier": 1,
            "fatigue_cost": 1,
            "risk_score": 2,
            "tags": [],
        }],
        "creative_briefs": [{
            "id": "brief-1",
            "slug": "brief-1",
            "location_id": "subzone",
            "concept_refs": ["fog"],
            "landmarks": ["tower"],
            "tags": ["Mood"],
        }],
    })

    assert response.status_code == 200
    body = response.get_json()
    assert any(location["id"] == "subzone" for location in body["locations"])
    assert Session().get(Location, "subzone").tags == ["world"]
    assert Session().get(LocationRoute, "route-2")
    assert Session().get(LocationPoi, "poi-1")
    assert Session().get(LocationEncounterTable, "table-1")
    assert Session().get(RouteEventBinding, "binding-1")
    assert Session().get(TravelTuning, "tuning-1")
    assert Session().get(LocationCreativeBrief, "brief-1")


def test_world_builder_bundle_rolls_back_and_locks_linked_record_ownership(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)
    session = Session()
    session.add(LocationPoi(id="poi-owned", slug="poi-owned", location_id="zone", name="Owned", poi_type=PoiType.Other))
    session.commit()
    session.close()

    response = client.post("/api/ui/world_builder/bundle", json={
        "locations": [{"id": "new-location", "slug": "new-location", "name": "New Location", "tags": []}],
        "encounter_tables": [{
            "id": "bad-table",
            "slug": "bad-table",
            "location_id": "zone",
            "name": "Bad",
            "encounter_entries": [{"encounter_id": "missing", "weight": 1}],
            "tags": [],
        }],
    })
    assert response.status_code == 400
    assert Session().get(Location, "new-location") is None

    response = client.post("/api/ui/world_builder/bundle", json={
        "pois": [{
            "id": "poi-owned",
            "slug": "poi-owned",
            "location_id": "world",
            "name": "Moved",
            "poi_type": "Other",
            "tags": [],
        }],
    })
    assert response.status_code == 400
    assert Session().get(LocationPoi, "poi-owned").location_id == "zone"


def test_world_builder_bundle_rejects_hierarchy_cycles_and_invalid_shapes(monkeypatch):
    client, Session = _app_with_session(monkeypatch)
    _seed_world(Session)

    cycle = client.post("/api/ui/world_builder/bundle", json={
        "locations": [
            {"id": "world", "slug": "world", "name": "World", "parent_location_id": "zone", "tags": []},
            {"id": "zone", "slug": "zone", "name": "Zone", "parent_location_id": "world", "tags": []},
        ],
    })
    assert cycle.status_code == 400

    bad_tags = client.post("/api/ui/world_builder/bundle", json={
        "locations": [{"id": "bad-tags", "slug": "bad-tags", "name": "Bad Tags", "tags": {"bad": True}}],
    })
    assert bad_tags.status_code == 400

    bad_encounter = client.post("/api/ui/world_builder/bundle", json={
        "locations": [{"id": "bad-encounter", "slug": "bad-encounter", "name": "Bad Encounter", "encounters": ["missing"], "tags": []}],
    })
    assert bad_encounter.status_code == 400

    bad_coordinate = client.post("/api/ui/world_builder/bundle", json={
        "pois": [{
            "id": "bad-poi",
            "slug": "bad-poi",
            "location_id": "zone",
            "name": "Bad POI",
            "poi_type": "Other",
            "coordinates": {"x": "1", "y": 2},
            "tags": [],
        }],
    })
    assert bad_coordinate.status_code == 400


def test_legacy_locations_table_rebuild_makes_biome_nullable(tmp_path):
    db_path = tmp_path / "legacy.sqlite"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE locations (
                id VARCHAR NOT NULL PRIMARY KEY,
                slug VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                biome VARCHAR NOT NULL,
                tags JSON
            )
        """))
        connection.execute(text("INSERT INTO locations (id, slug, name, biome, tags) VALUES ('loc-1', 'loc-1', 'Loc 1', 'Forest', '[]')"))

    _rebuild_locations_table_for_nullable_biome(engine)

    columns = {column["name"]: column for column in inspect(engine).get_columns("locations")}
    assert columns["biome"]["nullable"] is True
    assert "place_kind" in columns
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO locations (id, slug, name, biome) VALUES ('loc-2', 'loc-2', 'Loc 2', NULL)"))


def test_source_import_flushes_same_file_location_hierarchy(monkeypatch):
    client, Session = _app_with_session(monkeypatch)

    def get_session():
        return Session()

    monkeypatch.setattr(r_export, "get_db_session", get_session)
    app = Flask(__name__)
    app.register_blueprint(r_locations.bp)
    app.register_blueprint(r_export.bp)

    csv_content = (
        "id,slug,name,parent_location_id,location_type\n"
        "world,world,World,,World\n"
        "room,room,Room,world,Room\n"
    )
    response = app.test_client().post(
        "/api/source/import/csv/locations",
        data={"file": (BytesIO(csv_content.encode("utf-8")), "locations_seed.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert Session().get(Location, "room").parent_location_id == "world"


def test_world_building_tables_export_required_columns():
    required_by_table = {
        "locations": (Location, {"id", "slug", "name", "biome", "place_kind", "environment_tags", "biome_inheritance"}),
        "location_pois": (LocationPoi, {"id", "slug", "location_id", "name", "poi_type", "event_id", "coordinates"}),
        "location_encounter_tables": (LocationEncounterTable, {"id", "slug", "location_id", "name", "encounter_entries", "spawn_rules"}),
        "route_event_bindings": (RouteEventBinding, {"id", "slug", "route_id", "event_id", "trigger_mode", "chance"}),
        "travel_tuning": (TravelTuning, {"id", "slug", "name", "route_type", "place_kind", "biome", "encounter_chance"}),
        "location_creative_briefs": (LocationCreativeBrief, {"id", "slug", "location_id", "mood", "concept_refs", "music_state"}),
    }

    for table_name, (model_class, required_columns) in required_by_table.items():
        columns, _ = csv_tools.build_csv_rows(table_name, model_class, [], mode="ue")
        assert columns[0] == csv_tools.UE_ROW_KEY_HEADER
        assert required_columns <= set(columns)
