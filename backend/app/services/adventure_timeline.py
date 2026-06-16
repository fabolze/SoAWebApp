from collections import defaultdict

from backend.app.models.m_adventure_narrative import AdventureBeat, AdventureBeatLink
from backend.app.models.m_character_narrative import CharacterStoryBeat
from backend.app.models.m_characters import Character
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_items import Item
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import StoryArc
from backend.app.models.m_timelines import Timeline
from backend.app.services.dependency_index import build_dependency_index


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    return {
        column.name: _enum_value(getattr(model, column.name))
        for column in model.__table__.columns
    }


def _label(model):
    return (
        getattr(model, "name", None)
        or getattr(model, "title", None)
        or getattr(model, "slug", None)
        or model.id
    )


def _reference(kind, entry_id, label=None):
    return {"kind": kind, "entry_id": entry_id, "label": label or entry_id}


def _relationship(source, target, relation, explicit=True, path="", metadata=None):
    return {
        "id": f"{source}>{relation}>{target}>{path}",
        "source": source,
        "target": target,
        "relation": relation,
        "explicit": explicit,
        "path": path,
        "metadata": metadata or {},
    }


TRACK_TARGET_TYPES = {"location", "character", "item", "quest", "faction"}
TERMINAL_CHANGES = {"destroyed", "dies", "lost", "consumed", "unavailable", "leaves"}
REVIVAL_CHANGES = {"restored", "returns", "obtained", "transformed", "introduced", "joins"}


def build_adventure_timeline(db_session):
    timelines = sorted(
        db_session.query(Timeline).all(),
        key=lambda item: (item.start_year is None, item.start_year or 0, item.id),
    )
    arcs = sorted(db_session.query(StoryArc).all(), key=lambda item: item.id)
    quests = sorted(db_session.query(Quest).all(), key=lambda item: item.id)
    events = sorted(db_session.query(Event).all(), key=lambda item: item.id)
    beats = sorted(db_session.query(CharacterStoryBeat).all(), key=lambda item: item.id)
    adventure_beats = sorted(
        db_session.query(AdventureBeat).all(),
        key=lambda item: (item.timeline_id or "", item.story_arc_id or "", item.sort_order, item.id),
    )
    adventure_beat_links = sorted(
        db_session.query(AdventureBeatLink).all(),
        key=lambda item: (item.adventure_beat_id, item.sort_order, item.id),
    )
    characters = sorted(db_session.query(Character).all(), key=lambda item: item.id)
    locations = sorted(db_session.query(Location).all(), key=lambda item: item.id)
    dialogues = sorted(db_session.query(Dialogue).all(), key=lambda item: item.id)
    encounters = sorted(db_session.query(Encounter).all(), key=lambda item: item.id)
    lore_entries = sorted(db_session.query(LoreEntry).all(), key=lambda item: item.id)
    items = sorted(db_session.query(Item).all(), key=lambda item: item.id)
    factions = sorted(db_session.query(Faction).all(), key=lambda item: item.id)
    flags = sorted(db_session.query(Flag).all(), key=lambda item: item.id)

    timeline_by_id = {item.id: item for item in timelines}
    arc_by_id = {item.id: item for item in arcs}
    quest_by_id = {item.id: item for item in quests}
    event_by_id = {item.id: item for item in events}
    character_by_id = {item.id: item for item in characters}
    location_by_id = {item.id: item for item in locations}
    dialogue_by_id = {item.id: item for item in dialogues}
    encounter_by_id = {item.id: item for item in encounters}
    lore_by_id = {item.id: item for item in lore_entries}
    item_by_id = {item.id: item for item in items}
    faction_by_id = {item.id: item for item in factions}
    flag_by_id = {item.id: item for item in flags}
    adventure_beat_by_id = {item.id: item for item in adventure_beats}

    relationships = []
    placements = []
    warnings = []
    arc_ids_by_timeline = defaultdict(list)
    arcs_by_quest = defaultdict(list)
    beat_ids_by_event = defaultdict(list)
    adventure_beat_ids_by_arc = defaultdict(list)
    adventure_links_by_beat = defaultdict(list)
    entity_occurrences_by_kind = defaultdict(list)

    for arc in arcs:
        if arc.timeline_id:
            if arc.timeline_id in timeline_by_id:
                arc_ids_by_timeline[arc.timeline_id].append(arc.id)
                relationships.append(_relationship(
                    f"timeline:{arc.timeline_id}",
                    f"story_arc:{arc.id}",
                    "contains_arc",
                    path="story_arcs.timeline_id",
                ))
            else:
                warnings.append({
                    "code": "missing_timeline",
                    "schema_name": "story_arcs",
                    "entry_id": arc.id,
                    "message": f"Story arc references missing timeline {arc.timeline_id}.",
                })

        seen_quest_ids = set()
        for order, quest_id in enumerate(arc.related_quests or []):
            if quest_id in seen_quest_ids:
                warnings.append({
                    "code": "duplicate_arc_quest",
                    "schema_name": "story_arcs",
                    "entry_id": arc.id,
                    "message": f"Story arc orders quest {quest_id} more than once.",
                })
                continue
            seen_quest_ids.add(quest_id)
            quest = quest_by_id.get(quest_id)
            if not quest:
                warnings.append({
                    "code": "missing_arc_quest",
                    "schema_name": "story_arcs",
                    "entry_id": arc.id,
                    "message": f"Story arc references missing quest {quest_id}.",
                })
                continue
            arcs_by_quest[quest_id].append(arc.id)
            placements.append({
                "id": f"arc-quest:{arc.id}:{quest_id}",
                "kind": "quest",
                "entry_id": quest_id,
                "label": _label(quest),
                "timeline_id": arc.timeline_id,
                "story_arc_id": arc.id,
                "lane_id": f"story_arc:{arc.id}",
                "order": order,
                "ordering_source": "story_arcs.related_quests",
                "placement_basis": "explicit",
                "canonical_order": True,
            })
            relationships.append(_relationship(
                f"story_arc:{arc.id}",
                f"quest:{quest_id}",
                "orders_quest",
                path=f"related_quests[{order}]",
                metadata={"order": order},
            ))

    for quest in quests:
        ordered_arc_ids = arcs_by_quest.get(quest.id, [])
        if len(ordered_arc_ids) > 1:
            warnings.append({
                "code": "quest_in_multiple_arc_orders",
                "schema_name": "quests",
                "entry_id": quest.id,
                "message": f"Quest is ordered by multiple story arcs: {', '.join(ordered_arc_ids)}.",
            })
        if quest.story_arc_id and quest.story_arc_id not in arc_by_id:
            warnings.append({
                "code": "missing_quest_arc",
                "schema_name": "quests",
                "entry_id": quest.id,
                "message": f"Quest references missing story arc {quest.story_arc_id}.",
            })
        elif quest.story_arc_id and quest.story_arc_id not in ordered_arc_ids:
            warnings.append({
                "code": "quest_missing_from_arc_order",
                "schema_name": "quests",
                "entry_id": quest.id,
                "message": f"Quest belongs to story arc {quest.story_arc_id} but is not in its related_quests order.",
            })
        if ordered_arc_ids and quest.story_arc_id and quest.story_arc_id not in ordered_arc_ids:
            warnings.append({
                "code": "quest_arc_order_conflict",
                "schema_name": "quests",
                "entry_id": quest.id,
                "message": f"Quest story_arc_id {quest.story_arc_id} conflicts with arc order placement.",
            })

    adventure_target_catalogs = {
        "location": location_by_id,
        "character": character_by_id,
        "quest": quest_by_id,
        "event": event_by_id,
        "dialogue": dialogue_by_id,
        "encounter": encounter_by_id,
        "lore_entry": lore_by_id,
        "item": item_by_id,
        "faction": faction_by_id,
        "story_arc": arc_by_id,
    }
    for link in adventure_beat_links:
        target_type = _enum_value(link.target_type)
        target = adventure_target_catalogs.get(target_type, {}).get(link.target_id)
        link_data = {
            **_columns(link),
            "label": _label(target) if target else link.target_id,
        }
        adventure_links_by_beat[link.adventure_beat_id].append(link_data)
        if link.adventure_beat_id not in adventure_beat_by_id:
            warnings.append({
                "code": "missing_adventure_beat",
                "schema_name": "adventure_beat_links",
                "entry_id": link.id,
                "message": f"Adventure beat link references missing adventure beat {link.adventure_beat_id}.",
            })
        if not target:
            warnings.append({
                "code": "missing_adventure_beat_link_target",
                "schema_name": "adventure_beat_links",
                "entry_id": link.id,
                "message": f"Adventure beat link references missing {target_type} {link.target_id}.",
            })
        relationships.append(_relationship(
            f"adventure_beat:{link.adventure_beat_id}",
            f"{target_type}:{link.target_id}",
            _enum_value(link.role),
            path=f"adventure_beat_links.{link.id}",
            metadata={"link_id": link.id, "order": link.sort_order},
        ))
        beat = adventure_beat_by_id.get(link.adventure_beat_id)
        if beat and target_type in TRACK_TARGET_TYPES:
            story_arc = arc_by_id.get(beat.story_arc_id) if beat.story_arc_id else None
            timeline_id = beat.timeline_id or (story_arc.timeline_id if story_arc else None)
            entity_occurrences_by_kind[target_type].append({
                "id": f"adventure-link:{link.id}",
                "entity_kind": target_type,
                "entity_id": link.target_id,
                "label": _label(target) if target else link.target_id,
                "timeline_id": timeline_id,
                "story_arc_id": beat.story_arc_id,
                "adventure_beat_id": beat.id,
                "adventure_beat_label": beat.title,
                "source_kind": "adventure_beat",
                "source_id": beat.id,
                "source_label": beat.title,
                "order": beat.sort_order,
                "link_id": link.id,
                "role": _enum_value(link.role),
                "occurrence_kind": _enum_value(link.occurrence_kind),
                "change_type": _enum_value(link.change_type),
                "state_label": link.state_label,
                "starts_at_beat_id": link.starts_at_beat_id,
                "ends_at_beat_id": link.ends_at_beat_id,
                "continuity_group_id": link.continuity_group_id or link.target_id,
                "importance": _enum_value(link.importance),
                "notes": link.notes,
            })

    for beat in adventure_beats:
        story_arc = arc_by_id.get(beat.story_arc_id) if beat.story_arc_id else None
        timeline_id = beat.timeline_id or (story_arc.timeline_id if story_arc else None)
        if beat.story_arc_id:
            adventure_beat_ids_by_arc[beat.story_arc_id].append(beat.id)
        if beat.story_arc_id and not story_arc:
            warnings.append({
                "code": "missing_adventure_beat_arc",
                "schema_name": "adventure_beats",
                "entry_id": beat.id,
                "message": f"Adventure beat references missing story arc {beat.story_arc_id}.",
            })
        if beat.timeline_id and beat.timeline_id not in timeline_by_id:
            warnings.append({
                "code": "missing_adventure_beat_timeline",
                "schema_name": "adventure_beats",
                "entry_id": beat.id,
                "message": f"Adventure beat references missing timeline {beat.timeline_id}.",
            })
        if story_arc and beat.timeline_id and story_arc.timeline_id != beat.timeline_id:
            warnings.append({
                "code": "adventure_beat_scope_conflict",
                "schema_name": "adventure_beats",
                "entry_id": beat.id,
                "message": "Adventure beat timeline conflicts with its story arc timeline.",
            })
        lane_id = (
            f"story_arc:{beat.story_arc_id}"
            if beat.story_arc_id
            else f"timeline:{timeline_id}"
            if timeline_id
            else "unassigned"
        )
        placements.append({
            "id": f"adventure-beat:{beat.id}",
            "kind": "adventure_beat",
            "entry_id": beat.id,
            "label": beat.title,
            "timeline_id": timeline_id,
            "story_arc_id": beat.story_arc_id,
            "lane_id": lane_id,
            "order": beat.sort_order,
            "ordering_source": "adventure_beats.sort_order",
            "placement_basis": "explicit",
            "canonical_order": True,
            "beat_type": _enum_value(beat.beat_type),
            "attachments": adventure_links_by_beat[beat.id],
        })
        for field, relation, direction in [
            ("required_flags", "required_before", "input"),
            ("forbidden_flags", "forbidden_before", "input"),
            ("expected_output_flags", "expected_after", "output"),
        ]:
            for index, flag_id in enumerate(getattr(beat, field) or []):
                if flag_id not in flag_by_id:
                    warnings.append({
                        "code": "missing_adventure_beat_flag",
                        "schema_name": "adventure_beats",
                        "entry_id": beat.id,
                        "message": f"Adventure beat {field} references missing flag {flag_id}.",
                    })
                source = f"adventure_beat:{beat.id}" if direction == "output" else f"flag:{flag_id}"
                target = f"flag:{flag_id}" if direction == "output" else f"adventure_beat:{beat.id}"
                relationships.append(_relationship(
                    source,
                    target,
                    relation,
                    path=f"{field}[{index}]",
                ))

    source_models = {
        "quest_id": ("quest", quest_by_id),
        "dialogue_id": ("dialogue", dialogue_by_id),
        "encounter_id": ("encounter", encounter_by_id),
        "event_id": ("event", event_by_id),
        "location_id": ("location", location_by_id),
        "story_arc_id": ("story_arc", arc_by_id),
    }
    for beat in sorted(beats, key=lambda item: (item.character_id, item.sort_order, item.id)):
        character = character_by_id.get(beat.character_id)
        source_field = next((field for field in source_models if getattr(beat, field)), None)
        source_kind = None
        source_id = None
        source = None
        if source_field:
            source_kind, source_catalog = source_models[source_field]
            source_id = getattr(beat, source_field)
            source = source_catalog.get(source_id)
            if source:
                relationships.append(_relationship(
                    f"character_story_beat:{beat.id}",
                    f"{source_kind}:{source_id}",
                    "references",
                    path=source_field,
                ))
            else:
                warnings.append({
                    "code": "missing_story_beat_source",
                    "schema_name": "character_story_beats",
                    "entry_id": beat.id,
                    "message": f"Character story beat references missing {source_kind} {source_id}.",
                })
        if beat.event_id:
            beat_ids_by_event[beat.event_id].append(beat.id)

        story_arc_id = beat.story_arc_id
        placement_basis = "story_arc_id" if story_arc_id else None
        if not story_arc_id and beat.quest_id:
            quest = quest_by_id.get(beat.quest_id)
            if quest and quest.story_arc_id:
                story_arc_id = quest.story_arc_id
                placement_basis = "inferred_from_quest.story_arc_id"
        timeline_id = arc_by_id[story_arc_id].timeline_id if story_arc_id in arc_by_id else None
        placements.append({
            "id": f"character-story-beat:{beat.id}",
            "kind": "character_story_beat",
            "entry_id": beat.id,
            "label": beat.title,
            "timeline_id": timeline_id,
            "story_arc_id": story_arc_id,
            "lane_id": f"character:{beat.character_id}",
            "order": beat.sort_order,
            "ordering_source": "character_story_beats.sort_order",
            "placement_basis": placement_basis,
            "canonical_order": True,
            "character": _reference("character", beat.character_id, _label(character)) if character else None,
            "source": _reference(source_kind, source_id, _label(source)) if source else None,
        })
        if not character:
            warnings.append({
                "code": "missing_story_beat_character",
                "schema_name": "character_story_beats",
                "entry_id": beat.id,
                "message": f"Character story beat references missing character {beat.character_id}.",
            })

    event_chains = []
    previous_by_event = defaultdict(list)
    for event in events:
        if event.next_event_id:
            previous_by_event[event.next_event_id].append(event.id)
            relationships.append(_relationship(
                f"event:{event.id}",
                f"event:{event.next_event_id}",
                "next",
                path="next_event_id",
            ))
            if event.next_event_id not in event_by_id:
                warnings.append({
                    "code": "missing_next_event",
                    "schema_name": "events",
                    "entry_id": event.id,
                    "message": f"Event references missing next event {event.next_event_id}.",
                })
        for field, kind, catalog, relation in [
            ("location_id", "location", location_by_id, "occurs_at"),
            ("dialogue_id", "dialogue", dialogue_by_id, "runs_dialogue"),
            ("encounter_id", "encounter", encounter_by_id, "runs_encounter"),
            ("lore_id", "lore_entry", lore_by_id, "reveals_lore"),
        ]:
            target_id = getattr(event, field)
            if target_id and target_id in catalog:
                relationships.append(_relationship(
                    f"event:{event.id}",
                    f"{kind}:{target_id}",
                    relation,
                    path=field,
                ))
    for event in events:
        event_chains.append({
            "event_id": event.id,
            "label": _label(event),
            "previous_event_ids": previous_by_event[event.id],
            "next_event_id": event.next_event_id,
            "referenced_by_story_beat_ids": beat_ids_by_event[event.id],
            "attachments": {
                "location_id": event.location_id,
                "dialogue_id": event.dialogue_id,
                "encounter_id": event.encounter_id,
                "lore_id": event.lore_id,
            },
        })

    dependency_index = build_dependency_index(db_session)
    for kind, occurrences in entity_occurrences_by_kind.items():
        occurrences.sort(key=lambda row: (
            row["timeline_id"] or "",
            row["story_arc_id"] or "",
            row["order"],
            row["label"],
            row["id"],
        ))
        last_terminal_by_group = {}
        for occurrence in occurrences:
            group_id = occurrence["continuity_group_id"] or occurrence["entity_id"]
            change_type = occurrence["change_type"]
            if change_type in REVIVAL_CHANGES:
                last_terminal_by_group.pop(group_id, None)
            elif change_type in TERMINAL_CHANGES:
                last_terminal_by_group[group_id] = occurrence
            elif group_id in last_terminal_by_group:
                terminal = last_terminal_by_group[group_id]
                warnings.append({
                    "code": "entity_reappears_after_terminal_change",
                    "schema_name": "adventure_beat_links",
                    "entry_id": occurrence["link_id"],
                    "message": (
                        f"{kind} {occurrence['label']} appears after "
                        f"{terminal['change_type']} at {terminal['source_label']} without an explicit restoration or return."
                    ),
                })
    timeline_payload = []
    for timeline in timelines:
        data = _columns(timeline)
        data["story_arc_ids"] = arc_ids_by_timeline[timeline.id]
        timeline_payload.append(data)
        if not data["story_arc_ids"]:
            warnings.append({
                "code": "empty_timeline",
                "schema_name": "timelines",
                "entry_id": timeline.id,
                "message": "Timeline has no story arcs.",
            })

    arc_payload = []
    for arc in arcs:
        data = _columns(arc)
        data["ordered_quest_ids"] = [
            placement["entry_id"]
            for placement in placements
            if placement["kind"] == "quest" and placement["story_arc_id"] == arc.id
        ]
        data["character_story_beat_ids"] = [
            placement["entry_id"]
            for placement in placements
            if placement["kind"] == "character_story_beat" and placement["story_arc_id"] == arc.id
        ]
        data["adventure_beat_ids"] = adventure_beat_ids_by_arc[arc.id]
        arc_payload.append(data)
        if not data["ordered_quest_ids"] and not data["character_story_beat_ids"] and not data["adventure_beat_ids"]:
            warnings.append({
                "code": "empty_story_arc",
                "schema_name": "story_arcs",
                "entry_id": arc.id,
                "message": "Story arc has no ordered quests or placed character story beats.",
            })

    unplaced = {
        "story_arc_ids": [arc.id for arc in arcs if not arc.timeline_id],
        "quest_ids": [quest.id for quest in quests if not arcs_by_quest.get(quest.id)],
        "event_ids": [event.id for event in events if not beat_ids_by_event.get(event.id)],
        "character_story_beat_ids": [
            placement["entry_id"]
            for placement in placements
            if placement["kind"] == "character_story_beat" and not placement["story_arc_id"]
        ],
        "adventure_beat_ids": [
            beat.id for beat in adventure_beats if not beat.timeline_id and not beat.story_arc_id
        ],
    }

    return {
        "meta": {
            "read_only": True,
            "canonical_adventure_beats": True,
            "supports_bundle_commit": True,
            "canonical_global_sequence": False,
            "canonical_order_sources": [
                "story_arcs.related_quests",
                "character_story_beats.sort_order",
                "adventure_beats.sort_order",
                "events.next_event_id",
            ],
            "unsupported_global_order": [
                "story arcs within a timeline",
                "placements across different arc and character lanes",
            ],
            "note": "Placements preserve existing scoped order; dependency edges remain causal context, not global story order.",
        },
        "timelines": timeline_payload,
        "story_arcs": arc_payload,
        "placements": placements,
        "entity_tracks": {
            "locations": entity_occurrences_by_kind["location"],
            "characters": entity_occurrences_by_kind["character"],
            "items": entity_occurrences_by_kind["item"],
            "quests": entity_occurrences_by_kind["quest"],
            "factions": entity_occurrences_by_kind["faction"],
        },
        "event_chains": event_chains,
        "relationships": relationships,
        "unplaced": unplaced,
        "catalogs": {
            "quests": [_columns(item) for item in quests],
            "events": [_columns(item) for item in events],
            "character_story_beats": [_columns(item) for item in beats],
            "adventure_beats": [
                {**_columns(item), "attachments": adventure_links_by_beat[item.id]}
                for item in adventure_beats
            ],
            "adventure_beat_links": [_columns(item) for item in adventure_beat_links],
            "characters": [_columns(item) for item in characters],
            "locations": [_columns(item) for item in locations],
            "dialogues": [_columns(item) for item in dialogues],
            "encounters": [_columns(item) for item in encounters],
            "lore_entries": [_columns(item) for item in lore_entries],
            "items": [_columns(item) for item in items],
            "factions": [_columns(item) for item in factions],
            "flags": [_columns(item) for item in flags],
        },
        "dependency_index": dependency_index,
        "health": {
            "warnings": warnings,
            "dependency": dependency_index["health"],
        },
    }
