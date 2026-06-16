from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_adventure_narrative import (
    AdventureBeat,
    AdventureChangeType,
    AdventureBeatLink,
    AdventureBeatLinkRole,
    AdventureBeatLinkTargetType,
    AdventureBeatType,
    AdventureImportance,
    AdventureOccurrenceKind,
)
from backend.app.models.m_character_narrative import CharacterBeatType, CharacterStoryBeat
from backend.app.models.m_characters import Character
from backend.app.models.m_content_packs import ContentPack
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_items import Item, ItemType, Rarity
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import ArcType, StoryArc
from backend.app.models.m_timelines import Timeline
from backend.app.routes import r_ui_adventure_timeline
from backend.app.routes import r_export


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_adventure_timeline, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_adventure_timeline.bp)
    return app.test_client(), Session


def _seed(Session):
    session = Session()
    session.add_all([
        ContentPack(id="pack-1", slug="pack", name="Pack", description="Pack"),
        Timeline(id="timeline-1", slug="main-story", name="Main Story", tags=[]),
        Character(id="character-1", slug="guide", name="Guide", level=1, tags=[]),
        Location(id="location-1", slug="first-city", name="First City", tags=[]),
        Item(
            id="item-1",
            slug="city-key",
            name="City Key",
            type=ItemType.Quest,
            rarity=Rarity.Rare,
            base_price=1,
            tags=[],
        ),
        Dialogue(id="dialogue-1", slug="welcome", title="Welcome", location_id="location-1", tags=[]),
        Encounter(
            id="encounter-1",
            slug="ambush",
            name="Ambush",
            encounter_type=EncounterType.Combat,
            participants=[],
            rewards={},
            tags=[],
        ),
        Quest(
            id="quest-1",
            slug="arrival",
            title="Arrival",
            description="Reach the city.",
            objectives=[],
            flags_set_on_completion=[],
            item_rewards=[],
            tags=[],
        ),
        Quest(
            id="quest-2",
            slug="unplaced",
            title="Unplaced Quest",
            description="Not ordered by an arc.",
            objectives=[],
            flags_set_on_completion=[],
            item_rewards=[],
            tags=[],
        ),
        Event(
            id="event-1",
            slug="welcome-event",
            title="Welcome Event",
            type=EventType.Dialogue,
            location_id="location-1",
            dialogue_id="dialogue-1",
            flags_set=[],
            item_rewards=[],
            tags=[],
            next_event_id="event-2",
        ),
        Event(
            id="event-2",
            slug="ambush-event",
            title="Ambush Event",
            type=EventType.Encounter,
            encounter_id="encounter-1",
            flags_set=[],
            item_rewards=[],
            tags=[],
        ),
    ])
    session.flush()
    session.add(StoryArc(
        id="arc-1",
        slug="city-arc",
        title="The First City",
        summary="Reach and defend the first city.",
        type=ArcType.Main,
        content_pack_id="pack-1",
        timeline_id="timeline-1",
        related_quests=["quest-1"],
        branching=[],
        required_flags=[],
        tags=[],
    ))
    session.flush()
    session.get(Quest, "quest-1").story_arc_id = "arc-1"
    session.add_all([
        AdventureBeat(
            id="adventure-beat-1",
            slug="enter-first-city",
            title="Enter The First City",
            summary="Establish the city and its people.",
            beat_type=AdventureBeatType.Introduction,
            timeline_id="timeline-1",
            story_arc_id="arc-1",
            sort_order=0,
            intent="Introduce the first major hub.",
            required_flags=[],
            forbidden_flags=[],
            expected_output_flags=[],
            tags=[],
        ),
        CharacterStoryBeat(
            id="beat-quest",
            character_id="character-1",
            title="Guide Sends The Player",
            beat_type=CharacterBeatType.Entrance,
            sort_order=0,
            quest_id="quest-1",
            required_flags=[],
            forbidden_flags=[],
            expected_output_flags=[],
            relationship_changes=[],
            tags=[],
        ),
        CharacterStoryBeat(
            id="beat-event",
            character_id="character-1",
            title="Guide Welcomes The Player",
            beat_type=CharacterBeatType.Reaction,
            sort_order=1,
            event_id="event-1",
            required_flags=[],
            forbidden_flags=[],
            expected_output_flags=[],
            relationship_changes=[],
            tags=[],
        ),
    ])
    session.flush()
    session.add(AdventureBeatLink(
        id="adventure-link-1",
        adventure_beat_id="adventure-beat-1",
        target_type=AdventureBeatLinkTargetType.Location,
        target_id="location-1",
        role=AdventureBeatLinkRole.Setting,
        occurrence_kind=AdventureOccurrenceKind.Transition,
        change_type=AdventureChangeType.Introduced,
        state_label="Intact hub",
        importance=AdventureImportance.Critical,
        sort_order=0,
        tags=[],
    ))
    session.add_all([
        AdventureBeatLink(
            id="adventure-link-character",
            adventure_beat_id="adventure-beat-1",
            target_type=AdventureBeatLinkTargetType.Character,
            target_id="character-1",
            role=AdventureBeatLinkRole.Cast,
            occurrence_kind=AdventureOccurrenceKind.Transition,
            change_type=AdventureChangeType.Joins,
            state_label="Guide joins",
            importance=AdventureImportance.Major,
            sort_order=1,
            tags=[],
        ),
        AdventureBeatLink(
            id="adventure-link-item",
            adventure_beat_id="adventure-beat-1",
            target_type=AdventureBeatLinkTargetType.Item,
            target_id="item-1",
            role=AdventureBeatLinkRole.Reward,
            occurrence_kind=AdventureOccurrenceKind.Reward,
            change_type=AdventureChangeType.Obtained,
            state_label="Obtained",
            importance=AdventureImportance.Critical,
            sort_order=2,
            tags=[],
        ),
    ])
    session.commit()
    session.close()


def test_adventure_timeline_aggregates_scoped_order_runtime_and_unplaced_content(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    response = client.get("/api/ui/adventure-timeline")
    assert response.status_code == 200
    payload = response.get_json()

    assert payload["meta"]["read_only"] is True
    assert payload["meta"]["canonical_global_sequence"] is False
    assert "story arcs within a timeline" in payload["meta"]["unsupported_global_order"]
    assert payload["timelines"][0]["story_arc_ids"] == ["arc-1"]
    assert payload["story_arcs"][0]["ordered_quest_ids"] == ["quest-1"]
    assert payload["story_arcs"][0]["adventure_beat_ids"] == ["adventure-beat-1"]

    quest_placement = next(row for row in payload["placements"] if row["id"] == "arc-quest:arc-1:quest-1")
    assert quest_placement["order"] == 0
    assert quest_placement["ordering_source"] == "story_arcs.related_quests"
    assert quest_placement["placement_basis"] == "explicit"

    beat_placement = next(row for row in payload["placements"] if row["id"] == "character-story-beat:beat-quest")
    assert beat_placement["story_arc_id"] == "arc-1"
    assert beat_placement["placement_basis"] == "inferred_from_quest.story_arc_id"
    assert beat_placement["lane_id"] == "character:character-1"

    adventure_placement = next(row for row in payload["placements"] if row["id"] == "adventure-beat:adventure-beat-1")
    assert adventure_placement["ordering_source"] == "adventure_beats.sort_order"
    assert adventure_placement["attachments"][0]["target_id"] == "location-1"
    assert adventure_placement["attachments"][0]["change_type"] == "introduced"
    assert adventure_placement["attachments"][0]["state_label"] == "Intact hub"
    assert any(edge["relation"] == "setting" for edge in payload["relationships"])

    location_track = payload["entity_tracks"]["locations"][0]
    assert location_track["entity_id"] == "location-1"
    assert location_track["change_type"] == "introduced"
    assert location_track["importance"] == "critical"
    assert payload["entity_tracks"]["characters"][0]["change_type"] == "joins"
    assert payload["entity_tracks"]["items"][0]["change_type"] == "obtained"

    event_chain = next(row for row in payload["event_chains"] if row["event_id"] == "event-1")
    assert event_chain["next_event_id"] == "event-2"
    assert event_chain["referenced_by_story_beat_ids"] == ["beat-event"]
    assert event_chain["attachments"]["location_id"] == "location-1"
    assert event_chain["attachments"]["dialogue_id"] == "dialogue-1"

    assert payload["unplaced"]["quest_ids"] == ["quest-2"]
    assert payload["unplaced"]["event_ids"] == ["event-2"]
    assert payload["unplaced"]["character_story_beat_ids"] == ["beat-event"]
    assert any(edge["relation"] == "next" for edge in payload["dependency_index"]["edges"])
    assert any(edge["relation"] == "runs_dialogue" for edge in payload["relationships"])


def test_adventure_timeline_reports_arc_order_conflicts_without_writing(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.get(Quest, "quest-2").story_arc_id = "arc-1"
    session.commit()
    session.close()

    payload = client.get("/api/ui/adventure-timeline").get_json()
    warning_codes = {warning["code"] for warning in payload["health"]["warnings"]}
    assert "quest_missing_from_arc_order" in warning_codes

    response = client.post("/api/ui/adventure-timeline", json={})
    assert response.status_code == 405
    session = Session()
    assert session.get(Quest, "quest-2").story_arc_id == "arc-1"
    session.close()


def test_adventure_timeline_warns_when_entity_reappears_after_terminal_change(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        AdventureBeat(
            id="adventure-beat-destroyed",
            slug="first-city-destroyed",
            title="First City Falls",
            beat_type=AdventureBeatType.Reversal,
            timeline_id="timeline-1",
            story_arc_id="arc-1",
            sort_order=1,
            required_flags=[],
            forbidden_flags=[],
            expected_output_flags=[],
            tags=[],
        ),
        AdventureBeat(
            id="adventure-beat-reappears",
            slug="first-city-reappears",
            title="Return To First City",
            beat_type=AdventureBeatType.Payoff,
            timeline_id="timeline-1",
            story_arc_id="arc-1",
            sort_order=2,
            required_flags=[],
            forbidden_flags=[],
            expected_output_flags=[],
            tags=[],
        ),
        AdventureBeatLink(
            id="adventure-link-destroyed",
            adventure_beat_id="adventure-beat-destroyed",
            target_type=AdventureBeatLinkTargetType.Location,
            target_id="location-1",
            role=AdventureBeatLinkRole.State,
            occurrence_kind=AdventureOccurrenceKind.Consequence,
            change_type=AdventureChangeType.Destroyed,
            state_label="Destroyed",
            importance=AdventureImportance.Critical,
            sort_order=0,
            tags=[],
        ),
        AdventureBeatLink(
            id="adventure-link-reappears",
            adventure_beat_id="adventure-beat-reappears",
            target_type=AdventureBeatLinkTargetType.Location,
            target_id="location-1",
            role=AdventureBeatLinkRole.Setting,
            occurrence_kind=AdventureOccurrenceKind.Appearance,
            change_type=AdventureChangeType.Active,
            importance=AdventureImportance.Major,
            sort_order=0,
            tags=[],
        ),
    ])
    session.commit()
    session.close()

    payload = client.get("/api/ui/adventure-timeline").get_json()
    warnings = payload["health"]["warnings"]
    assert any(warning["code"] == "entity_reappears_after_terminal_change" for warning in warnings)
    assert payload["entity_tracks"]["locations"][-1]["link_id"] == "adventure-link-reappears"


def test_adventure_timeline_empty_project_has_stable_shape(monkeypatch):
    client, _ = _client(monkeypatch)

    payload = client.get("/api/ui/adventure-timeline").get_json()

    assert payload["timelines"] == []
    assert payload["story_arcs"] == []
    assert payload["placements"] == []
    assert payload["event_chains"] == []
    assert payload["relationships"] == []
    assert payload["entity_tracks"] == {
        "locations": [],
        "characters": [],
        "items": [],
        "quests": [],
        "factions": [],
    }
    assert payload["unplaced"] == {
        "story_arc_ids": [],
        "quest_ids": [],
        "event_ids": [],
        "character_story_beat_ids": [],
        "adventure_beat_ids": [],
    }


def test_adventure_timeline_preview_rolls_back_and_bundle_commits_atomically(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    payload = {
        "adventure_beats": [{
            "id": "adventure-beat-new",
            "slug": "defend-first-city",
            "title": "Defend The First City",
            "summary": "Turn the city into a contested home.",
            "beat_type": "Conflict",
            "timeline_id": "timeline-1",
            "story_arc_id": "arc-1",
            "sort_order": 1,
            "intent": "Make the player care about the city.",
            "required_flags": [],
            "forbidden_flags": [],
            "expected_output_flags": [],
            "tags": [],
        }],
        "adventure_beat_links": [{
            "id": "adventure-link-new",
            "adventure_beat_id": "adventure-beat-new",
            "target_type": "event",
            "target_id": "event-2",
            "role": "runtime",
            "occurrence_kind": None,
            "change_type": "",
            "importance": None,
            "sort_order": 0,
            "notes": "",
            "tags": [],
        }],
        "deletions": {"adventure_beats": [], "adventure_beat_links": []},
    }

    preview = client.post("/api/ui/adventure-timeline/preview", json=payload)
    assert preview.status_code == 200
    assert preview.get_json()["review"]["created"] == [
        {"id": "adventure-beat-new", "table": "adventure_beats"},
        {"id": "adventure-link-new", "table": "adventure_beat_links"},
    ]
    session = Session()
    assert session.get(AdventureBeat, "adventure-beat-new") is None
    session.close()

    commit = client.post("/api/ui/adventure-timeline/bundle", json=payload)
    assert commit.status_code == 200
    packet = commit.get_json()["packet"]
    assert any(row["id"] == "adventure-beat:adventure-beat-new" for row in packet["placements"])
    session = Session()
    assert session.get(AdventureBeat, "adventure-beat-new") is not None
    saved_link = session.get(AdventureBeatLink, "adventure-link-new")
    assert saved_link is not None
    assert saved_link.occurrence_kind == AdventureOccurrenceKind.Appearance
    assert saved_link.change_type == AdventureChangeType.Active
    assert saved_link.importance == AdventureImportance.Major
    session.close()


def test_adventure_timeline_bundle_rejects_missing_polymorphic_target(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    response = client.post("/api/ui/adventure-timeline/bundle", json={
        "adventure_beats": [],
        "adventure_beat_links": [{
            "id": "bad-link",
            "adventure_beat_id": "adventure-beat-1",
            "target_type": "location",
            "target_id": "missing-location",
            "role": "setting",
            "sort_order": 0,
            "tags": [],
        }],
    })
    assert response.status_code == 400
    assert response.get_json()["path"] == "adventure_beat_links[0].target_id"
    session = Session()
    assert session.get(AdventureBeatLink, "bad-link") is None
    session.close()


def test_adventure_narrative_tables_export_to_source_but_not_ue(monkeypatch):
    _, Session = _client(monkeypatch)
    monkeypatch.setattr(r_export, "get_db_session", lambda: Session())
    app = Flask(__name__)
    app.register_blueprint(r_export.bp)
    client = app.test_client()

    beat_source = client.get("/api/source/export/csv/adventure_beats")
    assert beat_source.status_code == 200
    assert "beat_type" in beat_source.get_data(as_text=True)
    link_source = client.get("/api/source/export/csv/adventure_beat_links")
    assert link_source.status_code == 200
    assert "target_type" in link_source.get_data(as_text=True)
    assert client.get("/api/export/ue/csv/adventure_beats").status_code == 400
    assert client.get("/api/export/ue/csv/adventure_beat_links").status_code == 400
