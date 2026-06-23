from collections import defaultdict


CHARACTER_TERMINAL_CHANGES = {"dies", "leaves", "captured"}
CHARACTER_RECOVERY_CHANGES = {"returns", "joins", "restored", "introduced", "transformed"}
ITEM_ACQUIRED_CHANGES = {"obtained", "restored"}
ITEM_UNAVAILABLE_CHANGES = {"lost", "stolen", "consumed"}
LOCATION_DISRUPTION_CHANGES = {"destroyed", "unavailable", "changed"}
QUEST_START_BEAT_TYPES = {"Hook", "Introduction"}
QUEST_RESOLUTION_BEAT_TYPES = {"Recovery", "Payoff"}
IMPORTANT_ITEM_TYPES = {"quest", "setpiece"}
IMPORTANT_ITEM_RARITIES = {"epic", "legendary"}


def _enum_value(value):
    return getattr(value, "value", value)


def _label(model):
    return (
        getattr(model, "name", None)
        or getattr(model, "title", None)
        or getattr(model, "slug", None)
        or model.id
    )


def _scope(beat):
    if beat.story_arc_id:
        return "story_arc", beat.story_arc_id
    if beat.timeline_id:
        return "timeline", beat.timeline_id
    return "unassigned", "unassigned"


def _warning(code, schema_name, entry_id, target_type, target_id, message, **metadata):
    return {
        "code": code,
        "severity": "warning",
        "schema_name": schema_name,
        "entry_id": entry_id,
        "target_type": target_type,
        "target_id": target_id,
        "message": message,
        **metadata,
    }


def _canonical_occurrences(adventure_beats, adventure_beat_links):
    beat_by_id = {beat.id: beat for beat in adventure_beats}
    result = []
    for link in adventure_beat_links:
        beat = beat_by_id.get(link.adventure_beat_id)
        if not beat:
            continue
        scope_kind, scope_id = _scope(beat)
        result.append({
            "link": link,
            "beat": beat,
            "target_type": _enum_value(link.target_type),
            "target_id": link.target_id,
            "continuity_group_id": link.continuity_group_id or link.target_id,
            "scope_kind": scope_kind,
            "scope_id": scope_id,
            "order": beat.sort_order,
            "occurrence_kind": _enum_value(link.occurrence_kind),
            "change_type": _enum_value(link.change_type),
            "importance": _enum_value(link.importance),
        })
    return result


def _group_occurrences(occurrences, target_type):
    grouped = defaultdict(list)
    for occurrence in occurrences:
        if occurrence["target_type"] != target_type:
            continue
        key = (
            occurrence["target_id"],
            occurrence["continuity_group_id"],
            occurrence["scope_kind"],
            occurrence["scope_id"],
        )
        grouped[key].append(occurrence)
    for rows in grouped.values():
        rows.sort(key=lambda row: (row["order"], row["link"].id))
    return grouped


def _by_order(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["order"]].append(row)
    return [grouped[order] for order in sorted(grouped)]


def _character_warnings(occurrences, characters_by_id):
    warnings = []
    for (character_id, _, scope_kind, scope_id), rows in _group_occurrences(occurrences, "character").items():
        terminal = None
        for same_beat in _by_order(rows):
            recoveries = [row for row in same_beat if row["change_type"] in CHARACTER_RECOVERY_CHANGES]
            if recoveries:
                terminal = None
            if terminal:
                for row in same_beat:
                    if (
                        row["change_type"] in CHARACTER_TERMINAL_CHANGES
                        or row["change_type"] in CHARACTER_RECOVERY_CHANGES
                        or row["occurrence_kind"] == "reference"
                    ):
                        continue
                    character = characters_by_id.get(character_id)
                    warnings.append(_warning(
                        "character_reappears_after_terminal_change",
                        "adventure_beat_links",
                        row["link"].id,
                        "character",
                        character_id,
                        (
                            f"Character {_label(character) if character else character_id} appears at "
                            f"{row['beat'].title} after {terminal['change_type']} at "
                            f"{terminal['beat'].title} without an explicit return or recovery."
                        ),
                        scope_kind=scope_kind,
                        scope_id=scope_id,
                        adventure_beat_id=row["beat"].id,
                        related_entry_ids=[terminal["link"].id],
                    ))
            new_terminals = [row for row in same_beat if row["change_type"] in CHARACTER_TERMINAL_CHANGES]
            if new_terminals:
                terminal = new_terminals[-1]
    return warnings


def _item_warnings(occurrences, items_by_id):
    warnings = []
    for (item_id, _, scope_kind, scope_id), rows in _group_occurrences(occurrences, "item").items():
        available = False
        last_unavailable = None
        for same_beat in _by_order(rows):
            for row in same_beat:
                if row["occurrence_kind"] != "requirement" or row["importance"] == "background" or available:
                    continue
                item = items_by_id.get(item_id)
                related = [last_unavailable["link"].id] if last_unavailable else []
                warnings.append(_warning(
                    "item_required_before_obtained",
                    "adventure_beat_links",
                    row["link"].id,
                    "item",
                    item_id,
                    (
                        f"Item {_label(item) if item else item_id} is required at {row['beat'].title} "
                        "without an earlier obtain or restoration in this story lane."
                    ),
                    scope_kind=scope_kind,
                    scope_id=scope_id,
                    adventure_beat_id=row["beat"].id,
                    related_entry_ids=related,
                ))
            acquired = any(row["change_type"] in ITEM_ACQUIRED_CHANGES for row in same_beat)
            unavailable = [row for row in same_beat if row["change_type"] in ITEM_UNAVAILABLE_CHANGES]
            if acquired:
                available = True
                last_unavailable = None
            elif unavailable:
                available = False
                last_unavailable = unavailable[-1]
    return warnings


def _quest_warnings(occurrences, quests):
    warnings = []
    links_by_quest = defaultdict(list)
    for occurrence in occurrences:
        if occurrence["target_type"] == "quest":
            links_by_quest[occurrence["target_id"]].append(occurrence)
    for quest in quests:
        if not quest.story_arc_id:
            continue
        rows = [
            row for row in links_by_quest[quest.id]
            if row["scope_kind"] == "story_arc" and row["scope_id"] == quest.story_arc_id
        ]
        has_start = any(
            _enum_value(row["beat"].beat_type) in QUEST_START_BEAT_TYPES
            or row["change_type"] == "introduced"
            for row in rows
        )
        has_resolution = any(
            _enum_value(row["beat"].beat_type) in QUEST_RESOLUTION_BEAT_TYPES
            or row["occurrence_kind"] == "consequence"
            for row in rows
        )
        if not has_start:
            warnings.append(_warning(
                "quest_missing_start_placement",
                "quests",
                quest.id,
                "quest",
                quest.id,
                f"Quest {_label(quest)} belongs to story arc {quest.story_arc_id} but has no clear start placement.",
                scope_kind="story_arc",
                scope_id=quest.story_arc_id,
                related_entry_ids=[],
            ))
        if not has_resolution:
            warnings.append(_warning(
                "quest_missing_resolution_placement",
                "quests",
                quest.id,
                "quest",
                quest.id,
                f"Quest {_label(quest)} belongs to story arc {quest.story_arc_id} but has no clear resolution placement.",
                scope_kind="story_arc",
                scope_id=quest.story_arc_id,
                related_entry_ids=[],
            ))
    return warnings


def _placed_event_ids(occurrences, character_story_beats, events):
    placed = {
        occurrence["target_id"]
        for occurrence in occurrences
        if occurrence["target_type"] == "event"
    }
    placed.update(beat.event_id for beat in character_story_beats if beat.event_id)
    event_by_id = {event.id: event for event in events}
    queue = list(placed)
    while queue:
        event = event_by_id.get(queue.pop())
        if not event or not event.next_event_id or event.next_event_id in placed:
            continue
        placed.add(event.next_event_id)
        queue.append(event.next_event_id)
    return placed


def _dialogue_warnings(occurrences, dialogues_by_id, dialogue_nodes, events, placed_event_ids):
    set_flags_by_dialogue = defaultdict(set)
    for node in dialogue_nodes:
        set_flags_by_dialogue[node.dialogue_id].update(node.set_flags or [])
        for choice in node.choices or []:
            if isinstance(choice, dict):
                set_flags_by_dialogue[node.dialogue_id].update(choice.get("set_flags", []) or [])
    directly_placed = {
        occurrence["target_id"]
        for occurrence in occurrences
        if occurrence["target_type"] == "dialogue"
    }
    events_by_dialogue = defaultdict(list)
    for event in events:
        if event.dialogue_id:
            events_by_dialogue[event.dialogue_id].append(event)
    warnings = []
    for dialogue_id, flag_ids in set_flags_by_dialogue.items():
        referenced_events = events_by_dialogue[dialogue_id]
        if not flag_ids or not referenced_events or dialogue_id in directly_placed:
            continue
        if any(event.id in placed_event_ids for event in referenced_events):
            continue
        dialogue = dialogues_by_id.get(dialogue_id)
        warnings.append(_warning(
            "stateful_dialogue_only_in_unplaced_event",
            "dialogues",
            dialogue_id,
            "dialogue",
            dialogue_id,
            (
                f"Dialogue {_label(dialogue) if dialogue else dialogue_id} sets story state but only appears "
                "through an event with no story placement."
            ),
            related_entry_ids=[event.id for event in referenced_events],
            flag_ids=sorted(flag_ids),
        ))
    return warnings


def _important_item(item):
    return (
        str(_enum_value(item.type)).lower() in IMPORTANT_ITEM_TYPES
        or str(_enum_value(item.rarity)).lower() in IMPORTANT_ITEM_RARITIES
    )


def _encounter_is_consequential(encounter, referencing_events, items_by_id):
    rewards = encounter.rewards if isinstance(encounter.rewards, dict) else {}
    if rewards.get("flags_set") or rewards.get("reputation"):
        return True
    for reward in rewards.get("items", []) or []:
        if isinstance(reward, dict) and reward.get("item_id") in items_by_id:
            if _important_item(items_by_id[reward["item_id"]]):
                return True
    return any(event.flags_set for event in referencing_events)


def _encounter_warnings(
    occurrences,
    encounters,
    character_story_beats,
    events,
    placed_event_ids,
    items_by_id,
):
    directly_placed = {
        occurrence["target_id"]
        for occurrence in occurrences
        if occurrence["target_type"] == "encounter"
    }
    directly_placed.update(beat.encounter_id for beat in character_story_beats if beat.encounter_id)
    events_by_encounter = defaultdict(list)
    for event in events:
        if event.encounter_id:
            events_by_encounter[event.encounter_id].append(event)
    warnings = []
    for encounter in encounters:
        referencing_events = events_by_encounter[encounter.id]
        placed_through_event = any(event.id in placed_event_ids for event in referencing_events)
        if (
            encounter.id in directly_placed
            or placed_through_event
            or not _encounter_is_consequential(encounter, referencing_events, items_by_id)
        ):
            continue
        warnings.append(_warning(
            "major_encounter_unplaced",
            "encounters",
            encounter.id,
            "encounter",
            encounter.id,
            f"Consequential encounter {_label(encounter)} has no story placement.",
            related_entry_ids=[event.id for event in referencing_events],
        ))
    return warnings


def _location_warnings(occurrences, locations_by_id):
    warnings = []
    for (location_id, _, scope_kind, scope_id), rows in _group_occurrences(occurrences, "location").items():
        disrupted = None
        unavailable = None
        for same_beat in _by_order(rows):
            restorations = [row for row in same_beat if row["change_type"] == "restored"]
            for row in restorations:
                if disrupted:
                    continue
                location = locations_by_id.get(location_id)
                warnings.append(_warning(
                    "location_restored_without_prior_disruption",
                    "adventure_beat_links",
                    row["link"].id,
                    "location",
                    location_id,
                    (
                        f"Location {_label(location) if location else location_id} is restored at "
                        f"{row['beat'].title} without an earlier destroyed, unavailable, or changed state "
                        "in this story lane."
                    ),
                    scope_kind=scope_kind,
                    scope_id=scope_id,
                    adventure_beat_id=row["beat"].id,
                    related_entry_ids=[],
                ))
            if unavailable and not restorations:
                for row in same_beat:
                    if row["change_type"] not in {"active", "introduced"} or row["occurrence_kind"] == "reference":
                        continue
                    location = locations_by_id.get(location_id)
                    warnings.append(_warning(
                        "entity_reappears_after_terminal_change",
                        "adventure_beat_links",
                        row["link"].id,
                        "location",
                        location_id,
                        (
                            f"Location {_label(location) if location else location_id} appears at "
                            f"{row['beat'].title} after {unavailable['change_type']} at "
                            f"{unavailable['beat'].title} without an explicit restoration."
                        ),
                        scope_kind=scope_kind,
                        scope_id=scope_id,
                        adventure_beat_id=row["beat"].id,
                        related_entry_ids=[unavailable["link"].id],
                    ))
            if restorations:
                disrupted = None
                unavailable = None
            disruptions = [row for row in same_beat if row["change_type"] in LOCATION_DISRUPTION_CHANGES]
            if disruptions:
                disrupted = disruptions[-1]
            unavailable_rows = [row for row in same_beat if row["change_type"] in {"destroyed", "unavailable"}]
            if unavailable_rows:
                unavailable = unavailable_rows[-1]
    return warnings


def build_adventure_timeline_coherence_warnings(
    *,
    adventure_beats,
    adventure_beat_links,
    characters,
    items,
    quests,
    dialogues,
    dialogue_nodes,
    events,
    encounters,
    character_story_beats,
    locations,
):
    occurrences = _canonical_occurrences(adventure_beats, adventure_beat_links)
    characters_by_id = {item.id: item for item in characters}
    items_by_id = {item.id: item for item in items}
    dialogues_by_id = {item.id: item for item in dialogues}
    locations_by_id = {item.id: item for item in locations}
    placed_event_ids = _placed_event_ids(occurrences, character_story_beats, events)
    warnings = []
    warnings.extend(_character_warnings(occurrences, characters_by_id))
    warnings.extend(_item_warnings(occurrences, items_by_id))
    warnings.extend(_quest_warnings(occurrences, quests))
    warnings.extend(_dialogue_warnings(occurrences, dialogues_by_id, dialogue_nodes, events, placed_event_ids))
    warnings.extend(_encounter_warnings(
        occurrences,
        encounters,
        character_story_beats,
        events,
        placed_event_ids,
        items_by_id,
    ))
    warnings.extend(_location_warnings(occurrences, locations_by_id))
    return warnings
