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
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_content_packs import ContentPack
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_items import Item, ItemType, Rarity
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement, RequirementRequiredFlag
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
        Faction(
            id="faction-1",
            slug="city-watch",
            name="City Watch",
            alignment=Alignment.Friendly,
            relationships={},
            reputation_config={},
            tags=[],
        ),
        LoreEntry(
            id="lore-1",
            slug="city-charter",
            title="City Charter",
            text="The charter records the city's founding.",
            related_story_arcs=[],
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


def _adventure_beat(beat_id, title, order, beat_type=AdventureBeatType.Other, story_arc_id="arc-1"):
    return AdventureBeat(
        id=beat_id,
        slug=beat_id,
        title=title,
        beat_type=beat_type,
        timeline_id="timeline-1",
        story_arc_id=story_arc_id,
        sort_order=order,
        required_flags=[],
        forbidden_flags=[],
        expected_output_flags=[],
        tags=[],
    )


def _adventure_link(
    link_id,
    beat_id,
    target_type,
    target_id,
    role,
    occurrence_kind=AdventureOccurrenceKind.Appearance,
    change_type=AdventureChangeType.Active,
    importance=AdventureImportance.Major,
):
    return AdventureBeatLink(
        id=link_id,
        adventure_beat_id=beat_id,
        target_type=target_type,
        target_id=target_id,
        role=role,
        occurrence_kind=occurrence_kind,
        change_type=change_type,
        importance=importance,
        sort_order=0,
        tags=[],
    )


def _seed_track_parity_links(Session):
    session = Session()
    session.add_all([
        _adventure_link(
            "adventure-link-quest", "adventure-beat-1", AdventureBeatLinkTargetType.Quest,
            "quest-1", AdventureBeatLinkRole.PlayerJourney,
        ),
        _adventure_link(
            "adventure-link-event", "adventure-beat-1", AdventureBeatLinkTargetType.Event,
            "event-1", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "adventure-link-dialogue", "adventure-beat-1", AdventureBeatLinkTargetType.Dialogue,
            "dialogue-1", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "adventure-link-encounter", "adventure-beat-1", AdventureBeatLinkTargetType.Encounter,
            "encounter-1", AdventureBeatLinkRole.Runtime, AdventureOccurrenceKind.Consequence,
            AdventureChangeType.Changed, AdventureImportance.Critical,
        ),
        _adventure_link(
            "adventure-link-lore", "adventure-beat-1", AdventureBeatLinkTargetType.LoreEntry,
            "lore-1", AdventureBeatLinkRole.Reference, AdventureOccurrenceKind.Reference,
            AdventureChangeType.None_, AdventureImportance.Minor,
        ),
        _adventure_link(
            "adventure-link-faction", "adventure-beat-1", AdventureBeatLinkTargetType.Faction,
            "faction-1", AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Changed,
        ),
        _adventure_link(
            "adventure-link-story-arc", "adventure-beat-1", AdventureBeatLinkTargetType.StoryArc,
            "arc-1", AdventureBeatLinkRole.Reference, AdventureOccurrenceKind.Reference,
        ),
    ])
    session.commit()
    session.close()


def test_adventure_timeline_aggregates_scoped_order_runtime_and_unplaced_content(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    _seed_track_parity_links(Session)

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
    expected_tracks = {
        "locations": ("location", "location-1", "First City"),
        "characters": ("character", "character-1", "Guide"),
        "quests": ("quest", "quest-1", "Arrival"),
        "events": ("event", "event-1", "Welcome Event"),
        "dialogues": ("dialogue", "dialogue-1", "Welcome"),
        "encounters": ("encounter", "encounter-1", "Ambush"),
        "lore_entries": ("lore_entry", "lore-1", "City Charter"),
        "items": ("item", "item-1", "City Key"),
        "factions": ("faction", "faction-1", "City Watch"),
        "story_arcs": ("story_arc", "arc-1", "The First City"),
    }
    assert set(payload["entity_tracks"]) == set(expected_tracks)
    for group_name, (entity_kind, entity_id, label) in expected_tracks.items():
        track = payload["entity_tracks"][group_name][0]
        assert track["entity_kind"] == entity_kind
        assert track["entity_id"] == entity_id
        assert track["label"] == label
        assert track["link_id"].startswith("adventure-link-")
        assert track["source_kind"] == "adventure_beat"
        assert track["source_id"] == "adventure-beat-1"

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


def test_lifecycle_warnings_track_character_terminal_and_recovery_in_one_scope(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        _adventure_beat("character-captured", "Guide Captured", 1),
        _adventure_beat("character-active-too-early", "Guide Appears", 2),
        _adventure_beat("character-returns", "Guide Returns", 3),
        _adventure_beat("character-active-after-return", "Guide Helps", 4),
        _adventure_link(
            "character-link-captured", "character-captured", AdventureBeatLinkTargetType.Character,
            "character-1", AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Captured,
        ),
        _adventure_link(
            "character-link-too-early", "character-active-too-early", AdventureBeatLinkTargetType.Character,
            "character-1", AdventureBeatLinkRole.Cast,
        ),
        _adventure_link(
            "character-link-returns", "character-returns", AdventureBeatLinkTargetType.Character,
            "character-1", AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Returns,
        ),
        _adventure_link(
            "character-link-after-return", "character-active-after-return", AdventureBeatLinkTargetType.Character,
            "character-1", AdventureBeatLinkRole.Cast,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    character_warnings = [row for row in warnings if row["code"] == "character_reappears_after_terminal_change"]
    assert [row["entry_id"] for row in character_warnings] == ["character-link-too-early"]
    assert character_warnings[0]["target_id"] == "character-1"
    assert character_warnings[0]["related_entry_ids"] == ["character-link-captured"]


def test_lifecycle_warnings_do_not_compare_character_occurrences_across_arcs(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(StoryArc(
        id="arc-2", slug="second-arc", title="Second Arc", summary="Parallel scope.",
        type=ArcType.Side, content_pack_id="pack-1", timeline_id="timeline-1",
        related_quests=[], branching=[], required_flags=[], tags=[],
    ))
    session.flush()
    session.add_all([
        _adventure_beat("character-dies-arc-1", "Guide Dies", 1),
        _adventure_beat("character-active-arc-2", "Guide Elsewhere", 2, story_arc_id="arc-2"),
        _adventure_link(
            "character-link-dies", "character-dies-arc-1", AdventureBeatLinkTargetType.Character,
            "character-1", AdventureBeatLinkRole.State, AdventureOccurrenceKind.Consequence,
            AdventureChangeType.Dies,
        ),
        _adventure_link(
            "character-link-other-arc", "character-active-arc-2", AdventureBeatLinkTargetType.Character,
            "character-1", AdventureBeatLinkRole.Cast,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] == "character_reappears_after_terminal_change"
        and row["entry_id"] == "character-link-other-arc"
        for row in warnings
    )


def test_character_introduction_warning_reports_deduplicated_scoped_usage_evidence(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Character(id="character-2", slug="captain", name="Captain", level=3, tags=[]),
        Dialogue(
            id="dialogue-2", slug="captain-orders", title="Captain's Orders",
            character_id="character-2", tags=[],
        ),
        Encounter(
            id="encounter-2", slug="captain-defense", name="Captain's Defense",
            encounter_type=EncounterType.Combat,
            participants=[
                {"character_id": "character-2", "contexts": ["Combat"], "combat_side": "Friendly"},
                {"character_id": "character-2", "contexts": ["Interaction"], "combat_side": "Friendly"},
            ],
            rewards={}, tags=[],
        ),
        InteractionProfile(
            id="interaction-2", character_id="character-2", available_quests=["quest-1"],
            inventory=[], flags_set_on_interaction=[], tags=[],
        ),
        CombatProfile(
            id="combat-2", character_id="character-2", custom_stats=[], custom_abilities=[],
            status_rules=[], loot_table=[], currency_rewards=[], reputation_rewards=[],
            related_quests=["quest-1"], companion_config={}, tags=[],
        ),
    ])
    session.flush()
    session.add_all([
        DialogueNode(
            id="dialogue-node-captain-1", slug="captain-line-1", dialogue_id="dialogue-2",
            speaker="Captain", speaker_character_id="character-2", text="Hold the gate.",
            choices=[], set_flags=[], tags=[],
        ),
        DialogueNode(
            id="dialogue-node-captain-2", slug="captain-line-2", dialogue_id="dialogue-2",
            speaker="Captain", speaker_character_id="character-2", text="Protect the civilians.",
            choices=[], set_flags=[], tags=[],
        ),
        Event(
            id="event-captain", slug="captain-event", title="Captain Rallies The Guard",
            type=EventType.Dialogue, dialogue_id="dialogue-2", flags_set=[], item_rewards=[], tags=[],
        ),
        CharacterStoryBeat(
            id="beat-captain", character_id="character-2", title="Captain Takes Command",
            beat_type=CharacterBeatType.Decision, sort_order=2, story_arc_id="arc-1",
            required_flags=[], forbidden_flags=[], expected_output_flags=[], relationship_changes=[], tags=[],
        ),
        _adventure_link(
            "captain-dialogue-link", "adventure-beat-1", AdventureBeatLinkTargetType.Dialogue,
            "dialogue-2", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "captain-encounter-link", "adventure-beat-1", AdventureBeatLinkTargetType.Encounter,
            "encounter-2", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "captain-event-link", "adventure-beat-1", AdventureBeatLinkTargetType.Event,
            "event-captain", AdventureBeatLinkRole.Runtime,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    warning = next(
        row for row in warnings
        if row["code"] == "character_missing_introduction_placement" and row["target_id"] == "character-2"
    )
    assert warning["schema_name"] == "characters"
    assert warning["scope_kind"] == "story_arc"
    assert warning["scope_id"] == "arc-1"
    assert warning["usage_count"] == 5
    assert warning["usage_counts"] == {
        "dialogue": 1,
        "encounter": 1,
        "event": 1,
        "quest": 1,
        "character_story_beat": 1,
    }
    assert {row["kind"] for row in warning["usage_evidence"]} == {
        "dialogue", "encounter", "event", "quest", "character_story_beat",
    }
    dialogue_evidence = next(row for row in warning["usage_evidence"] if row["kind"] == "dialogue")
    assert dialogue_evidence["entry_id"] == "dialogue-2"
    assert dialogue_evidence["paths"] == [
        "dialogue_nodes.dialogue-node-captain-1.speaker_character_id",
        "dialogue_nodes.dialogue-node-captain-2.speaker_character_id",
        "dialogues.character_id",
    ]
    quest_evidence = next(row for row in warning["usage_evidence"] if row["kind"] == "quest")
    assert quest_evidence["entry_id"] == "quest-1"
    assert quest_evidence["paths"] == [
        "combat_profiles.combat-2.related_quests",
        "interaction_profiles.interaction-2.available_quests",
    ]
    assert warning["earliest_comparable_usage"]["order"] == 0

    introduction_payload = {
        "adventure_beats": [],
        "adventure_beat_links": [{
            "id": "captain-introduction-link",
            "adventure_beat_id": "adventure-beat-1",
            "target_type": "character",
            "target_id": "character-2",
            "role": "cast",
            "occurrence_kind": "transition",
            "change_type": "introduced",
            "importance": "major",
            "sort_order": 4,
            "tags": [],
        }],
        "deletions": {"adventure_beats": [], "adventure_beat_links": []},
    }
    preview = client.post("/api/ui/adventure-timeline/preview", json=introduction_payload)
    assert preview.status_code == 200
    assert not any(
        row["code"] in {"character_missing_introduction_placement", "character_introduction_after_first_use"}
        and row.get("target_id") == "character-2"
        for row in preview.get_json()["warnings"]
    )
    warnings_after_preview = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "character_missing_introduction_placement" and row.get("target_id") == "character-2"
        for row in warnings_after_preview
    )

    commit = client.post("/api/ui/adventure-timeline/bundle", json=introduction_payload)
    assert commit.status_code == 200
    assert not any(
        row["code"] in {"character_missing_introduction_placement", "character_introduction_after_first_use"}
        and row.get("target_id") == "character-2"
        for row in commit.get_json()["packet"]["health"]["warnings"]
    )


def test_character_introduction_warning_respects_threshold_scope_and_introduction_order(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Character(id="character-2", slug="captain", name="Captain", level=3, tags=[]),
        Dialogue(
            id="dialogue-2", slug="captain-orders", title="Captain's Orders",
            character_id="character-2", tags=[],
        ),
        Encounter(
            id="encounter-2", slug="captain-defense", name="Captain's Defense",
            encounter_type=EncounterType.Combat,
            participants=[{"character_id": "character-2", "contexts": ["Combat"], "combat_side": "Friendly"}],
            rewards={}, tags=[],
        ),
        Event(
            id="event-captain", slug="captain-event", title="Captain Rallies The Guard",
            type=EventType.Dialogue, dialogue_id="dialogue-2", flags_set=[], item_rewards=[], tags=[],
        ),
        _adventure_beat("captain-introduction", "Meet The Captain", 2),
    ])
    session.flush()
    session.add_all([
        _adventure_link(
            "captain-dialogue-link", "adventure-beat-1", AdventureBeatLinkTargetType.Dialogue,
            "dialogue-2", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "captain-encounter-link", "adventure-beat-1", AdventureBeatLinkTargetType.Encounter,
            "encounter-2", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "captain-event-link", "adventure-beat-1", AdventureBeatLinkTargetType.Event,
            "event-captain", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "captain-introduction-link", "captain-introduction", AdventureBeatLinkTargetType.Character,
            "character-2", AdventureBeatLinkRole.Cast, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Introduced,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    late = next(
        row for row in warnings
        if row["code"] == "character_introduction_after_first_use" and row["target_id"] == "character-2"
    )
    assert late["introduction_entry_ids"] == ["captain-introduction-link"]
    assert late["earliest_comparable_usage"]["adventure_beat_id"] == "adventure-beat-1"

    session = Session()
    session.get(AdventureBeatLink, "captain-introduction-link").adventure_beat_id = "adventure-beat-1"
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] in {"character_missing_introduction_placement", "character_introduction_after_first_use"}
        and row.get("target_id") == "character-2"
        for row in warnings
    )


def test_character_introduction_warning_does_not_use_other_scope_or_below_threshold(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Character(id="character-2", slug="captain", name="Captain", level=3, tags=[]),
        Character(id="character-3", slug="scout", name="Scout", level=2, tags=[]),
        StoryArc(
            id="arc-2", slug="second-arc", title="Second Arc", summary="Parallel scope.",
            type=ArcType.Side, content_pack_id="pack-1", timeline_id="timeline-1",
            related_quests=[], branching=[], required_flags=[], tags=[],
        ),
    ])
    session.flush()
    session.add_all([
        CharacterStoryBeat(
            id=f"captain-beat-{index}", character_id="character-2", title=f"Captain Beat {index}",
            beat_type=CharacterBeatType.Reaction, sort_order=index, story_arc_id="arc-1",
            required_flags=[], forbidden_flags=[], expected_output_flags=[], relationship_changes=[], tags=[],
        )
        for index in range(3)
    ] + [
        CharacterStoryBeat(
            id=f"scout-beat-{index}", character_id="character-3", title=f"Scout Beat {index}",
            beat_type=CharacterBeatType.Reaction, sort_order=index, story_arc_id="arc-1",
            required_flags=[], forbidden_flags=[], expected_output_flags=[], relationship_changes=[], tags=[],
        )
        for index in range(2)
    ] + [
        _adventure_beat("captain-joins-other-arc", "Captain Joins Elsewhere", 0, story_arc_id="arc-2"),
    ])
    session.flush()
    session.add(_adventure_link(
        "captain-joins-other-arc-link", "captain-joins-other-arc", AdventureBeatLinkTargetType.Character,
        "character-2", AdventureBeatLinkRole.Cast, AdventureOccurrenceKind.Transition,
        AdventureChangeType.Joins,
    ))
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    captain_warning = next(
        row for row in warnings
        if row["code"] == "character_missing_introduction_placement" and row["target_id"] == "character-2"
    )
    assert captain_warning["scope_id"] == "arc-1"
    assert not any(
        row["code"] == "character_missing_introduction_placement" and row.get("target_id") == "character-3"
        for row in warnings
    )

    session = Session()
    session.add(_adventure_link(
        "captain-joins-arc-1-link", "adventure-beat-1", AdventureBeatLinkTargetType.Character,
        "character-2", AdventureBeatLinkRole.Cast, AdventureOccurrenceKind.Transition,
        AdventureChangeType.Joins,
    ))
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] == "character_missing_introduction_placement" and row.get("target_id") == "character-2"
        for row in warnings
    )


def test_lifecycle_warnings_track_item_availability_before_requirement(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        _adventure_beat("item-lost", "Key Lost", 1),
        _adventure_beat("item-required", "Gate Requires Key", 2),
        _adventure_link(
            "item-link-lost", "item-lost", AdventureBeatLinkTargetType.Item, "item-1",
            AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition, AdventureChangeType.Lost,
        ),
        _adventure_link(
            "item-link-required", "item-required", AdventureBeatLinkTargetType.Item, "item-1",
            AdventureBeatLinkRole.Reference, AdventureOccurrenceKind.Requirement,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(row["code"] == "item_required_before_obtained" and row["entry_id"] == "item-link-required" for row in warnings)

    session = Session()
    session.add_all([
        _adventure_beat("item-restored", "Key Recovered", 2),
        _adventure_link(
            "item-link-restored", "item-restored", AdventureBeatLinkTargetType.Item, "item-1",
            AdventureBeatLinkRole.Reward, AdventureOccurrenceKind.Reward, AdventureChangeType.Restored,
        ),
    ])
    session.get(AdventureBeat, "item-required").sort_order = 3
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "item_required_before_obtained" and row["entry_id"] == "item-link-required" for row in warnings)
    assert not any(row["code"] == "item_obtained_never_used" and row["target_id"] == "item-1" for row in warnings)


def test_lifecycle_warnings_find_important_item_obtained_never_used(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "item_obtained_never_used" and row["entry_id"] == "adventure-link-item"
        for row in warnings
    )

    session = Session()
    session.add_all([
        _adventure_beat("item-used", "Gate Uses Key", 2),
        _adventure_link(
            "item-link-used", "item-used", AdventureBeatLinkTargetType.Item, "item-1",
            AdventureBeatLinkRole.Reference, AdventureOccurrenceKind.Requirement,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "item_obtained_never_used" and row["target_id"] == "item-1" for row in warnings)


def test_lifecycle_warnings_require_item_continuity_context_for_transformation(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        _adventure_beat("item-transformed", "Key Awakens", 2),
        _adventure_link(
            "item-link-transformed", "item-transformed", AdventureBeatLinkTargetType.Item, "item-1",
            AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition, AdventureChangeType.Transformed,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "item_continuity_group_missing" and row["entry_id"] == "item-link-transformed"
        for row in warnings
    )

    session = Session()
    session.get(AdventureBeatLink, "item-link-transformed").continuity_group_id = "city-key-awakened"
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] == "item_continuity_group_missing" and row["entry_id"] == "item-link-transformed"
        for row in warnings
    )


def test_lifecycle_warnings_require_quest_start_and_resolution_in_its_arc(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    quest_codes = {row["code"] for row in warnings if row.get("target_id") == "quest-1"}
    assert {"quest_missing_start_placement", "quest_missing_resolution_placement"} <= quest_codes

    session = Session()
    session.add(_adventure_beat("quest-payoff", "Arrival Complete", 3, AdventureBeatType.Payoff))
    session.flush()
    session.add_all([
        _adventure_link(
            "quest-link-start", "adventure-beat-1", AdventureBeatLinkTargetType.Quest, "quest-1",
            AdventureBeatLinkRole.PlayerJourney, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Introduced,
        ),
        _adventure_link(
            "quest-link-resolution", "quest-payoff", AdventureBeatLinkTargetType.Quest, "quest-1",
            AdventureBeatLinkRole.PlayerJourney, AdventureOccurrenceKind.Consequence,
            AdventureChangeType.Changed,
        ),
    ])
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"].startswith("quest_missing_") and row.get("target_id") == "quest-1" for row in warnings)


def test_quest_order_warnings_find_required_flag_from_later_arc_quest(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Requirement(id="req-later-flag", slug="later-flag", tags=[]),
        RequirementRequiredFlag(
            id="req-later-flag-row",
            requirement_id="req-later-flag",
            flag_id="bridge-open",
        ),
    ])
    session.get(Quest, "quest-1").requirements_id = "req-later-flag"
    session.get(Quest, "quest-2").story_arc_id = "arc-1"
    session.get(Quest, "quest-2").flags_set_on_completion = ["bridge-open"]
    session.get(StoryArc, "arc-1").related_quests = ["quest-1", "quest-2"]
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "quest_requires_later_arc_flag"
        and row["target_id"] == "quest-1"
        and row["related_entry_ids"] == ["quest-2"]
        for row in warnings
    )

    session = Session()
    session.get(StoryArc, "arc-1").related_quests = ["quest-2", "quest-1"]
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] == "quest_requires_later_arc_flag" and row["target_id"] == "quest-1"
        for row in warnings
    )


def test_quest_order_warnings_find_important_item_required_before_arc_reward(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Item(
        id="item-2",
        slug="moon-key",
        name="Moon Key",
        type=ItemType.Quest,
        rarity=Rarity.Rare,
        base_price=1,
        tags=[],
    ))
    session.get(Quest, "quest-2").story_arc_id = "arc-1"
    session.get(Quest, "quest-2").item_rewards = [{"item_id": "item-2", "quantity": 1}]
    session.get(StoryArc, "arc-1").related_quests = ["quest-1", "quest-2"]
    session.add_all([
        _adventure_link(
            "quest-link-item-requirement", "adventure-beat-1", AdventureBeatLinkTargetType.Quest,
            "quest-1", AdventureBeatLinkRole.PlayerJourney, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Introduced,
        ),
        _adventure_link(
            "item-link-quest-requirement", "adventure-beat-1", AdventureBeatLinkTargetType.Item,
            "item-2", AdventureBeatLinkRole.Reference, AdventureOccurrenceKind.Requirement,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "quest_item_required_before_rewarded_in_arc"
        and row["target_id"] == "quest-1"
        and row["item_id"] == "item-2"
        for row in warnings
    )

    session = Session()
    session.get(StoryArc, "arc-1").related_quests = ["quest-2", "quest-1"]
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] == "quest_item_required_before_rewarded_in_arc" and row["target_id"] == "quest-1"
        for row in warnings
    )


def test_quest_runtime_event_warnings_find_events_outside_story_window(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.get(Quest, "quest-1").flags_set_on_completion = ["quest-done"]
    session.add_all([
        Requirement(id="req-quest-done", slug="quest-done", tags=[]),
        RequirementRequiredFlag(
            id="req-quest-done-row",
            requirement_id="req-quest-done",
            flag_id="quest-done",
        ),
        Event(
            id="event-before-quest",
            slug="event-before-quest",
            title="Before Quest Event",
            type=EventType.ScriptedScene,
            requirements_id="req-quest-done",
            flags_set=[],
            item_rewards=[],
            tags=[],
        ),
        Event(
            id="event-after-quest",
            slug="event-after-quest",
            title="After Quest Event",
            type=EventType.ScriptedScene,
            requirements_id="req-quest-done",
            flags_set=[],
            item_rewards=[],
            tags=[],
        ),
        _adventure_beat("quest-start", "Arrival Starts", 1, AdventureBeatType.Introduction),
        _adventure_beat("quest-runtime", "Arrival Runtime", 2),
        _adventure_beat("quest-resolution", "Arrival Resolves", 3, AdventureBeatType.Payoff),
        _adventure_beat("event-before-beat", "Too Early Runtime", 0),
        _adventure_beat("event-after-beat", "Too Late Runtime", 4),
    ])
    session.flush()
    session.add_all([
        _adventure_link(
            "quest-link-start-window", "quest-start", AdventureBeatLinkTargetType.Quest,
            "quest-1", AdventureBeatLinkRole.PlayerJourney, AdventureOccurrenceKind.Transition,
            AdventureChangeType.Introduced,
        ),
        _adventure_link(
            "quest-link-resolution-window", "quest-resolution", AdventureBeatLinkTargetType.Quest,
            "quest-1", AdventureBeatLinkRole.PlayerJourney, AdventureOccurrenceKind.Consequence,
            AdventureChangeType.Changed,
        ),
        _adventure_link(
            "event-link-before-window", "event-before-beat", AdventureBeatLinkTargetType.Event,
            "event-before-quest", AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "event-link-after-window", "event-after-beat", AdventureBeatLinkTargetType.Event,
            "event-after-quest", AdventureBeatLinkRole.Runtime,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "quest_runtime_event_before_start"
        and row["target_id"] == "quest-1"
        and row["entry_id"] == "event-link-before-window"
        for row in warnings
    )
    assert any(
        row["code"] == "quest_runtime_event_after_resolution"
        and row["target_id"] == "quest-1"
        and row["entry_id"] == "event-link-after-window"
        for row in warnings
    )

    session = Session()
    session.get(AdventureBeatLink, "event-link-before-window").adventure_beat_id = "quest-runtime"
    session.get(AdventureBeatLink, "event-link-after-window").adventure_beat_id = "quest-runtime"
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "quest_runtime_event_before_start" for row in warnings)
    assert not any(row["code"] == "quest_runtime_event_after_resolution" for row in warnings)


def test_lifecycle_warnings_find_stateful_dialogue_only_in_unplaced_event(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Dialogue(id="dialogue-2", slug="warning", title="Warning", tags=[]),
        Event(
            id="event-3", slug="warning-event", title="Warning Event", type=EventType.Dialogue,
            dialogue_id="dialogue-2", flags_set=[], item_rewards=[], tags=[],
        ),
    ])
    session.flush()
    session.add(DialogueNode(
        id="dialogue-node-2", slug="warning-node", dialogue_id="dialogue-2", speaker="Guide",
        text="The bridge is gone.", choices=[], set_flags=["bridge-gone"], tags=[],
    ))
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(row["code"] == "stateful_dialogue_only_in_unplaced_event" and row["target_id"] == "dialogue-2" for row in warnings)

    session = Session()
    session.get(Event, "event-1").next_event_id = "event-3"
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "stateful_dialogue_only_in_unplaced_event" and row["target_id"] == "dialogue-2" for row in warnings)


def test_lifecycle_warnings_find_consequential_unplaced_encounter(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(Encounter(
        id="encounter-2", slug="boss", name="Bridge Guardian", encounter_type=EncounterType.Combat,
        participants=[], rewards={"flags_set": ["bridge-open"]}, tags=[],
    ))
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(row["code"] == "major_encounter_unplaced" and row["target_id"] == "encounter-2" for row in warnings)

    session = Session()
    session.add(_adventure_link(
        "encounter-link-2", "adventure-beat-1", AdventureBeatLinkTargetType.Encounter, "encounter-2",
        AdventureBeatLinkRole.Runtime,
    ))
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "major_encounter_unplaced" and row["target_id"] == "encounter-2" for row in warnings)


def test_lifecycle_warnings_find_important_encounter_reward_without_item_journey(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        Item(
            id="item-2",
            slug="boss-relic",
            name="Boss Relic",
            type=ItemType.Quest,
            rarity=Rarity.Rare,
            base_price=1,
            tags=[],
        ),
        Encounter(
            id="encounter-2",
            slug="boss",
            name="Bridge Guardian",
            encounter_type=EncounterType.Combat,
            participants=[],
            rewards={"items": [{"item_id": "item-2", "quantity": 1}]},
            tags=[],
        ),
        _adventure_link(
            "encounter-link-2", "adventure-beat-1", AdventureBeatLinkTargetType.Encounter, "encounter-2",
            AdventureBeatLinkRole.Runtime,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(
        row["code"] == "encounter_important_reward_missing_item_journey"
        and row["target_id"] == "encounter-2"
        and row["item_id"] == "item-2"
        for row in warnings
    )

    session = Session()
    session.add(_adventure_link(
        "item-link-encounter-reward", "adventure-beat-1", AdventureBeatLinkTargetType.Item, "item-2",
        AdventureBeatLinkRole.Reward, AdventureOccurrenceKind.Reward, AdventureChangeType.Obtained,
    ))
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(
        row["code"] == "encounter_important_reward_missing_item_journey"
        and row["target_id"] == "encounter-2"
        for row in warnings
    )


def test_lifecycle_warnings_require_prior_location_disruption_before_restore(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add(_adventure_beat("location-restored", "City Restored", 2, AdventureBeatType.Recovery))
    session.flush()
    session.add(_adventure_link(
        "location-link-restored", "location-restored", AdventureBeatLinkTargetType.Location, "location-1",
        AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition, AdventureChangeType.Restored,
    ))
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert any(row["code"] == "location_restored_without_prior_disruption" and row["target_id"] == "location-1" for row in warnings)

    session = Session()
    session.add(_adventure_beat("location-changed", "City Occupied", 1, AdventureBeatType.Reversal))
    session.flush()
    session.add(_adventure_link(
        "location-link-changed", "location-changed", AdventureBeatLinkTargetType.Location, "location-1",
        AdventureBeatLinkRole.State, AdventureOccurrenceKind.Transition, AdventureChangeType.Changed,
    ))
    session.commit()
    session.close()
    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "location_restored_without_prior_disruption" and row["target_id"] == "location-1" for row in warnings)


def test_location_introduction_warning_tracks_scoped_event_usage(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    session = Session()
    session.add_all([
        _adventure_beat("location-event-2", "Second City Visit", 1),
        _adventure_beat("location-event-3", "Third City Visit", 2),
        Event(
            id="event-3",
            slug="city-event-3",
            title="City Event Three",
            type=EventType.ScriptedScene,
            location_id="location-1",
            flags_set=[],
            item_rewards=[],
            tags=[],
        ),
        Event(
            id="event-4",
            slug="city-event-4",
            title="City Event Four",
            type=EventType.ScriptedScene,
            location_id="location-1",
            flags_set=[],
            item_rewards=[],
            tags=[],
        ),
    ])
    session.flush()
    session.add_all([
        _adventure_link(
            "event-link-1", "adventure-beat-1", AdventureBeatLinkTargetType.Event, "event-1",
            AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "event-link-3", "location-event-2", AdventureBeatLinkTargetType.Event, "event-3",
            AdventureBeatLinkRole.Runtime,
        ),
        _adventure_link(
            "event-link-4", "location-event-3", AdventureBeatLinkTargetType.Event, "event-4",
            AdventureBeatLinkRole.Runtime,
        ),
    ])
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    assert not any(row["code"] == "location_missing_introduction_placement" and row["target_id"] == "location-1" for row in warnings)

    session = Session()
    session.delete(session.get(AdventureBeatLink, "adventure-link-1"))
    session.commit()
    session.close()

    warnings = client.get("/api/ui/adventure-timeline").get_json()["health"]["warnings"]
    location_warning = next(row for row in warnings if row["code"] == "location_missing_introduction_placement" and row["target_id"] == "location-1")
    assert location_warning["scope_kind"] == "story_arc"
    assert location_warning["scope_id"] == "arc-1"
    assert location_warning["usage_count"] == 3


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
        "quests": [],
        "events": [],
        "dialogues": [],
        "encounters": [],
        "lore_entries": [],
        "items": [],
        "factions": [],
        "story_arcs": [],
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


def test_adventure_timeline_edits_links_with_stale_record_protection(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    packet = client.get("/api/ui/adventure-timeline").get_json()
    original = next(row for row in packet["catalogs"]["adventure_beat_links"] if row["id"] == "adventure-link-1")
    updated = {
        **original,
        "change_type": "destroyed",
        "state_label": "Ruined",
        "expected_previous": original,
    }
    payload = {
        "adventure_beats": [],
        "adventure_beat_links": [updated],
        "deletions": {"adventure_beats": [], "adventure_beat_links": []},
    }

    preview = client.post("/api/ui/adventure-timeline/preview", json=payload)
    assert preview.status_code == 200
    assert preview.get_json()["review"]["changed"] == [
        {"id": "adventure-link-1", "table": "adventure_beat_links"},
    ]
    session = Session()
    assert session.get(AdventureBeatLink, "adventure-link-1").change_type == AdventureChangeType.Introduced
    session.close()

    commit = client.post("/api/ui/adventure-timeline/bundle", json=payload)
    assert commit.status_code == 200
    session = Session()
    saved = session.get(AdventureBeatLink, "adventure-link-1")
    assert saved.change_type == AdventureChangeType.Destroyed
    assert saved.state_label == "Ruined"
    assert saved.target_id == "location-1"
    session.close()

    stale = {
        **payload,
        "adventure_beat_links": [{**updated, "state_label": "Changed again"}],
    }
    response = client.post("/api/ui/adventure-timeline/bundle", json=stale)
    assert response.status_code == 400
    assert "expected_previous is stale" in response.get_json()["message"]
    session = Session()
    assert session.get(AdventureBeatLink, "adventure-link-1").state_label == "Ruined"
    session.close()


def test_adventure_timeline_deletes_only_the_requested_link(monkeypatch):
    client, Session = _client(monkeypatch)
    _seed(Session)
    payload = {
        "adventure_beats": [],
        "adventure_beat_links": [],
        "deletions": {"adventure_beats": [], "adventure_beat_links": ["adventure-link-1"]},
    }

    preview = client.post("/api/ui/adventure-timeline/preview", json=payload)
    assert preview.status_code == 200
    assert preview.get_json()["review"]["deleted"] == [
        {"id": "adventure-link-1", "table": "adventure_beat_links"},
    ]
    session = Session()
    assert session.get(AdventureBeatLink, "adventure-link-1") is not None
    session.close()

    commit = client.post("/api/ui/adventure-timeline/bundle", json=payload)
    assert commit.status_code == 200
    session = Session()
    assert session.get(AdventureBeatLink, "adventure-link-1") is None
    assert session.get(AdventureBeat, "adventure-beat-1") is not None
    assert session.get(Location, "location-1") is not None
    assert session.get(AdventureBeatLink, "adventure-link-character") is not None
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
