from collections import defaultdict


CHARACTER_TERMINAL_CHANGES = {"dies", "leaves", "captured"}
CHARACTER_RECOVERY_CHANGES = {"returns", "joins", "restored", "introduced", "transformed"}
CHARACTER_INTRODUCTION_CHANGES = {"introduced", "joins"}
CHARACTER_HEAVY_USAGE_THRESHOLD = 3
CHARACTER_USAGE_KINDS = ("dialogue", "encounter", "event", "quest", "character_story_beat")
ITEM_ACQUIRED_CHANGES = {"obtained", "restored"}
ITEM_UNAVAILABLE_CHANGES = {"lost", "stolen", "consumed"}
ITEM_USE_CHANGES = {"lost", "stolen", "consumed", "transformed", "destroyed"}
LOCATION_DISRUPTION_CHANGES = {"destroyed", "unavailable", "changed"}
LOCATION_INTRODUCTION_CHANGES = {"introduced"}
LOCATION_HEAVY_USAGE_THRESHOLD = 3
IMPORTANT_LOCATION_TYPES = {"zone"}
IMPORTANT_LOCATION_KINDS = {"settlement", "dungeon", "landmark"}
IMPORTANT_LOCATION_TAGS = {"story", "critical", "main", "quest"}
QUEST_START_BEAT_TYPES = {"Hook", "Introduction"}
QUEST_RESOLUTION_BEAT_TYPES = {"Recovery", "Payoff"}
IMPORTANT_ITEM_TYPES = {"quest", "setpiece"}
IMPORTANT_ITEM_RARITIES = {"rare", "epic", "legendary"}
IMPORTANT_ITEM_TAGS = {"quest", "key", "story", "legendary"}


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


def _usage_scope(scope_kind, scope_id, *, order=None, adventure_beat_id=None, adventure_beat_label=None,
                 ordering_source=None, via_event_ids=None):
    return {
        "scope_kind": scope_kind,
        "scope_id": scope_id,
        "order": order,
        "adventure_beat_id": adventure_beat_id,
        "adventure_beat_label": adventure_beat_label,
        "ordering_source": ordering_source,
        "via_event_ids": list(via_event_ids or []),
    }


def _occurrence_scopes(occurrences, target_type, target_id):
    return [
        _usage_scope(
            row["scope_kind"],
            row["scope_id"],
            order=row["order"],
            adventure_beat_id=row["beat"].id,
            adventure_beat_label=row["beat"].title,
            ordering_source="adventure_beats.sort_order",
        )
        for row in occurrences
        if row["target_type"] == target_type and row["target_id"] == target_id
    ]


def _prefer_scope_context(existing, candidate):
    if not existing:
        return candidate
    existing_order = existing.get("order")
    candidate_order = candidate.get("order")
    if existing_order is None:
        return candidate if candidate_order is not None else existing
    if candidate_order is None:
        return existing
    return candidate if candidate_order < existing_order else existing


def _event_scope_contexts(occurrences, events):
    contexts = defaultdict(dict)
    for event in events:
        for scope in _occurrence_scopes(occurrences, "event", event.id):
            key = (scope["scope_kind"], scope["scope_id"])
            contexts[event.id][key] = _prefer_scope_context(contexts[event.id].get(key), scope)

    event_by_id = {event.id: event for event in events}
    changed = True
    while changed:
        changed = False
        for event in events:
            if not event.next_event_id or event.next_event_id not in event_by_id:
                continue
            target_contexts = contexts[event.next_event_id]
            for key, scope in contexts[event.id].items():
                candidate = {
                    **scope,
                    "via_event_ids": [*scope.get("via_event_ids", []), event.id],
                }
                preferred = _prefer_scope_context(target_contexts.get(key), candidate)
                if target_contexts.get(key) != preferred:
                    target_contexts[key] = preferred
                    changed = True
    return contexts


def _merge_usage_evidence(evidence):
    merged = {}
    for row in evidence:
        key = (row["kind"], row["entry_id"], row["scope_kind"], row["scope_id"])
        current = merged.get(key)
        if not current:
            merged[key] = {**row, "paths": sorted(set(row.get("paths", [])))}
            continue
        current["paths"] = sorted(set(current.get("paths", [])) | set(row.get("paths", [])))
        preferred = _prefer_scope_context(current, row)
        for field in (
            "order", "adventure_beat_id", "adventure_beat_label", "ordering_source", "via_event_ids",
        ):
            current[field] = preferred.get(field)
    kind_order = {kind: index for index, kind in enumerate(CHARACTER_USAGE_KINDS)}
    return sorted(merged.values(), key=lambda row: (
        row["scope_kind"],
        row["scope_id"],
        kind_order.get(row["kind"], len(kind_order)),
        row["entry_id"],
    ))


def _character_usage_evidence(
    occurrences,
    dialogues,
    dialogue_nodes,
    encounters,
    events,
    quests,
    character_story_beats,
    combat_profiles,
    interaction_profiles,
):
    evidence = []
    quest_by_id = {quest.id: quest for quest in quests}
    event_contexts = _event_scope_contexts(occurrences, events)

    dialogue_characters = defaultdict(lambda: defaultdict(set))
    for dialogue in dialogues:
        if dialogue.character_id:
            dialogue_characters[dialogue.id][dialogue.character_id].add("dialogues.character_id")
    for node in dialogue_nodes:
        if node.speaker_character_id:
            dialogue_characters[node.dialogue_id][node.speaker_character_id].add(
                f"dialogue_nodes.{node.id}.speaker_character_id"
            )

    encounter_characters = defaultdict(lambda: defaultdict(set))
    for encounter in encounters:
        for index, participant in enumerate(encounter.participants or []):
            if isinstance(participant, dict) and participant.get("character_id"):
                encounter_characters[encounter.id][participant["character_id"]].add(
                    f"encounters.{encounter.id}.participants[{index}].character_id"
                )

    referenced_dialogue_ids = {event.dialogue_id for event in events if event.dialogue_id}
    referenced_encounter_ids = {event.encounter_id for event in events if event.encounter_id}

    def append_scoped(kind, entry_id, entry_label, character_id, paths, scopes):
        effective_scopes = scopes or [_usage_scope("unassigned", "unassigned")]
        for scope in effective_scopes:
            evidence.append({
                "kind": kind,
                "entry_id": entry_id,
                "label": entry_label,
                "character_id": character_id,
                "paths": sorted(paths),
                **scope,
            })

    for dialogue in dialogues:
        scopes = _occurrence_scopes(occurrences, "dialogue", dialogue.id)
        for character_id, paths in dialogue_characters[dialogue.id].items():
            if scopes or dialogue.id not in referenced_dialogue_ids:
                append_scoped("dialogue", dialogue.id, _label(dialogue), character_id, paths, scopes)

    for encounter in encounters:
        scopes = _occurrence_scopes(occurrences, "encounter", encounter.id)
        for character_id, paths in encounter_characters[encounter.id].items():
            if scopes or encounter.id not in referenced_encounter_ids:
                append_scoped("encounter", encounter.id, _label(encounter), character_id, paths, scopes)

    for event in events:
        characters = defaultdict(set)
        if event.dialogue_id:
            for character_id, paths in dialogue_characters[event.dialogue_id].items():
                characters[character_id].update(paths)
                characters[character_id].add(f"events.{event.id}.dialogue_id")
        if event.encounter_id:
            for character_id, paths in encounter_characters[event.encounter_id].items():
                characters[character_id].update(paths)
                characters[character_id].add(f"events.{event.id}.encounter_id")
        scopes = list(event_contexts[event.id].values())
        for character_id, paths in characters.items():
            append_scoped("event", event.id, _label(event), character_id, paths, scopes)

    quest_usage = defaultdict(lambda: defaultdict(set))
    for profile in interaction_profiles:
        for quest_id in profile.available_quests or []:
            quest_usage[quest_id][profile.character_id].add(
                f"interaction_profiles.{profile.id}.available_quests"
            )
    for profile in combat_profiles:
        for quest_id in profile.related_quests or []:
            quest_usage[quest_id][profile.character_id].add(
                f"combat_profiles.{profile.id}.related_quests"
            )
    for quest_id, characters in quest_usage.items():
        quest = quest_by_id.get(quest_id)
        scopes = _occurrence_scopes(occurrences, "quest", quest_id)
        if quest and quest.story_arc_id:
            scopes.append(_usage_scope("story_arc", quest.story_arc_id, ordering_source="quests.story_arc_id"))
        for character_id, paths in characters.items():
            append_scoped("quest", quest_id, _label(quest) if quest else quest_id, character_id, paths, scopes)

    for beat in character_story_beats:
        story_arc_id = beat.story_arc_id
        ordering_source = "character_story_beats.story_arc_id"
        if not story_arc_id and beat.quest_id:
            quest = quest_by_id.get(beat.quest_id)
            if quest and quest.story_arc_id:
                story_arc_id = quest.story_arc_id
                ordering_source = "inferred_from_quest.story_arc_id"
        scope = _usage_scope(
            "story_arc" if story_arc_id else "unassigned",
            story_arc_id or "unassigned",
            order=beat.sort_order,
            ordering_source=ordering_source if story_arc_id else "character_story_beats.sort_order",
        )
        append_scoped(
            "character_story_beat",
            beat.id,
            _label(beat),
            beat.character_id,
            [f"character_story_beats.{beat.id}.character_id"],
            [scope],
        )

    return _merge_usage_evidence(evidence)


def _usage_summary(counts):
    labels = {
        "dialogue": "dialogue",
        "encounter": "encounter",
        "event": "event",
        "quest": "quest",
        "character_story_beat": "character story beat",
    }
    parts = []
    for kind in CHARACTER_USAGE_KINDS:
        count = counts.get(kind, 0)
        if count:
            parts.append(f"{count} {labels[kind]}{'s' if count != 1 else ''}")
    return ", ".join(parts)


def _character_introduction_warnings(occurrences, characters_by_id, usage_evidence):
    usage_by_scope = defaultdict(list)
    for row in usage_evidence:
        usage_by_scope[(row["character_id"], row["scope_kind"], row["scope_id"])].append(row)

    introductions_by_scope = defaultdict(list)
    for row in occurrences:
        if row["target_type"] != "character" or row["change_type"] not in CHARACTER_INTRODUCTION_CHANGES:
            continue
        introductions_by_scope[(row["target_id"], row["scope_kind"], row["scope_id"])].append(row)

    warnings = []
    for (character_id, scope_kind, scope_id), evidence in sorted(usage_by_scope.items()):
        if len(evidence) < CHARACTER_HEAVY_USAGE_THRESHOLD:
            continue
        counts = {kind: sum(row["kind"] == kind for row in evidence) for kind in CHARACTER_USAGE_KINDS}
        introductions = sorted(
            introductions_by_scope[(character_id, scope_kind, scope_id)],
            key=lambda row: (row["order"], row["link"].id),
        )
        comparable_usage = [
            row for row in evidence
            if row.get("ordering_source") == "adventure_beats.sort_order" and row.get("order") is not None
        ]
        earliest_usage = min(comparable_usage, key=lambda row: (row["order"], row["entry_id"])) if comparable_usage else None
        earliest_introduction = introductions[0] if introductions else None
        late_introduction = bool(
            earliest_usage
            and earliest_introduction
            and earliest_introduction["order"] > earliest_usage["order"]
        )
        if introductions and not late_introduction:
            continue

        character = characters_by_id.get(character_id)
        usage_summary = _usage_summary(counts)
        scope_label = f"{scope_kind.replace('_', ' ')} {scope_id}"
        metadata = {
            "scope_kind": scope_kind,
            "scope_id": scope_id,
            "usage_count": len(evidence),
            "usage_counts": {kind: count for kind, count in counts.items() if count},
            "usage_evidence": evidence,
            "introduction_entry_ids": [row["link"].id for row in introductions],
            "related_entry_ids": [row["entry_id"] for row in evidence],
        }
        if earliest_usage:
            metadata["earliest_comparable_usage"] = {
                "kind": earliest_usage["kind"],
                "entry_id": earliest_usage["entry_id"],
                "adventure_beat_id": earliest_usage.get("adventure_beat_id"),
                "adventure_beat_label": earliest_usage.get("adventure_beat_label"),
                "order": earliest_usage["order"],
                "ordering_source": earliest_usage["ordering_source"],
            }

        if late_introduction:
            warnings.append(_warning(
                "character_introduction_after_first_use",
                "characters",
                character_id,
                "character",
                character_id,
                (
                    f"Character {_label(character) if character else character_id} has {len(evidence)} scoped uses "
                    f"in {scope_label} ({usage_summary}), but its first canonical introduction at "
                    f"{earliest_introduction['beat'].title} follows comparable usage at "
                    f"{earliest_usage['adventure_beat_label']}."
                ),
                **metadata,
            ))
        else:
            warnings.append(_warning(
                "character_missing_introduction_placement",
                "characters",
                character_id,
                "character",
                character_id,
                (
                    f"Character {_label(character) if character else character_id} has {len(evidence)} scoped uses "
                    f"in {scope_label} ({usage_summary}) but no canonical introduced or joins placement "
                    "in this story lane."
                ),
                **metadata,
            ))
    return warnings


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
    for (item_id, _continuity_group_id, scope_kind, scope_id), rows in _group_occurrences(occurrences, "item").items():
        item = items_by_id.get(item_id)
        available = False
        last_unavailable = None
        for same_beat in _by_order(rows):
            for row in same_beat:
                if row["occurrence_kind"] != "requirement" or row["importance"] == "background" or available:
                    continue
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
        if not item or not _important_item(item):
            continue

        story_rows = [row for row in rows if row["importance"] != "background"]
        for index, row in enumerate(story_rows):
            if row["change_type"] not in ITEM_ACQUIRED_CHANGES:
                continue
            used_later = any(
                later["order"] > row["order"] and _item_usage_row(later)
                for later in story_rows[index + 1:]
            )
            if not used_later:
                warnings.append(_warning(
                    "item_obtained_never_used",
                    "adventure_beat_links",
                    row["link"].id,
                    "item",
                    item_id,
                    (
                        f"Important item {_label(item)} is obtained at {row['beat'].title} "
                        "but has no later requirement, loss, consumption, transformation, or consequence in this story lane."
                    ),
                    scope_kind=scope_kind,
                    scope_id=scope_id,
                    adventure_beat_id=row["beat"].id,
                    related_entry_ids=[],
                ))

        for row in story_rows:
            if row["change_type"] not in {"transformed", "restored"}:
                continue
            link = row["link"]
            has_version_context = (
                bool((link.continuity_group_id or "").strip() and link.continuity_group_id != item_id)
                or bool((link.state_label or "").strip())
                or bool((link.notes or "").strip())
            )
            if has_version_context:
                continue
            warnings.append(_warning(
                "item_continuity_group_missing",
                "adventure_beat_links",
                link.id,
                "item",
                item_id,
                (
                    f"Important item {_label(item)} changes form at {row['beat'].title} "
                    "without a continuity group, state label, or note explaining the version."
                ),
                scope_kind=scope_kind,
                scope_id=scope_id,
                adventure_beat_id=row["beat"].id,
                related_entry_ids=[],
            ))
    return warnings


def _quest_required_flags(quest, requirements_by_id):
    flags = set()
    requirement = requirements_by_id.get(quest.requirements_id)
    if requirement:
        flags.update(row.flag_id for row in requirement.required_flags)
    for objective in quest.objectives or []:
        if not isinstance(objective, dict):
            continue
        requirement_id = objective.get("requirements_id") or objective.get("requirements")
        requirement = requirements_by_id.get(requirement_id)
        if requirement:
            flags.update(row.flag_id for row in requirement.required_flags)
    return flags


def _quest_produced_flags(quest):
    flags = set(quest.flags_set_on_completion or [])
    for objective in quest.objectives or []:
        if isinstance(objective, dict):
            flags.update(objective.get("flags_set", []) or [])
    return flags


def _quest_reward_item_ids(quest):
    result = set()
    for reward in quest.item_rewards or []:
        if isinstance(reward, dict) and reward.get("item_id"):
            result.add(reward["item_id"])
    return result


def _quest_story_window(rows):
    starts = [
        row for row in rows
        if _enum_value(row["beat"].beat_type) in QUEST_START_BEAT_TYPES
        or row["change_type"] == "introduced"
    ]
    resolutions = [
        row for row in rows
        if _enum_value(row["beat"].beat_type) in QUEST_RESOLUTION_BEAT_TYPES
        or row["occurrence_kind"] == "consequence"
    ]
    start = min(starts, key=lambda row: (row["order"], row["link"].id)) if starts else None
    resolution = max(resolutions, key=lambda row: (row["order"], row["link"].id)) if resolutions else None
    return start, resolution


def _quest_arc_order_warnings(story_arcs, quests_by_id, requirements_by_id):
    warnings = []
    for arc in story_arcs:
        ordered_quests = [
            quests_by_id[quest_id]
            for quest_id in arc.related_quests or []
            if quest_id in quests_by_id
        ]
        order_by_quest = {quest.id: index for index, quest in enumerate(ordered_quests)}
        producers_by_flag = defaultdict(list)
        for quest in ordered_quests:
            for flag_id in _quest_produced_flags(quest):
                producers_by_flag[flag_id].append(quest)
        for quest in ordered_quests:
            quest_order = order_by_quest[quest.id]
            for flag_id in sorted(_quest_required_flags(quest, requirements_by_id)):
                producers = producers_by_flag.get(flag_id, [])
                if not producers:
                    continue
                earlier = [producer for producer in producers if order_by_quest[producer.id] < quest_order]
                later = [producer for producer in producers if order_by_quest[producer.id] > quest_order]
                if earlier or not later:
                    continue
                producer = later[0]
                warnings.append(_warning(
                    "quest_requires_later_arc_flag",
                    "quests",
                    quest.id,
                    "quest",
                    quest.id,
                    (
                        f"Quest {_label(quest)} requires flag {flag_id}, but the first quest in arc "
                        f"{arc.id} that produces it is later: {_label(producer)}."
                    ),
                    scope_kind="story_arc",
                    scope_id=arc.id,
                    related_entry_ids=[producer.id],
                    flag_ids=[flag_id],
                ))
    return warnings


def _quest_item_reward_order_warnings(occurrences, story_arcs, quests_by_id, items_by_id):
    warnings = []
    quest_rows_by_beat = defaultdict(list)
    for row in occurrences:
        if row["target_type"] == "quest" and row["scope_kind"] == "story_arc":
            quest_rows_by_beat[(row["scope_id"], row["beat"].id)].append(row)

    requirement_rows_by_arc = defaultdict(list)
    for row in occurrences:
        if (
            row["target_type"] == "item"
            and row["scope_kind"] == "story_arc"
            and row["occurrence_kind"] == "requirement"
            and row["importance"] != "background"
        ):
            requirement_rows_by_arc[row["scope_id"]].append(row)

    for arc in story_arcs:
        ordered_quest_ids = [quest_id for quest_id in arc.related_quests or [] if quest_id in quests_by_id]
        order_by_quest = {quest_id: index for index, quest_id in enumerate(ordered_quest_ids)}
        rewards_by_item = defaultdict(list)
        for quest_id in ordered_quest_ids:
            quest = quests_by_id[quest_id]
            for item_id in _quest_reward_item_ids(quest):
                item = items_by_id.get(item_id)
                if item and _important_item(item):
                    rewards_by_item[item_id].append(quest)
        for requirement_row in requirement_rows_by_arc[arc.id]:
            item_id = requirement_row["target_id"]
            for requiring_quest_row in quest_rows_by_beat[(arc.id, requirement_row["beat"].id)]:
                requiring_quest_id = requiring_quest_row["target_id"]
                requiring_order = order_by_quest.get(requiring_quest_id)
                if requiring_order is None:
                    continue
                later_reward_quests = [
                    quest for quest in rewards_by_item.get(item_id, [])
                    if order_by_quest.get(quest.id, -1) > requiring_order
                ]
                if not later_reward_quests:
                    continue
                reward_quest = later_reward_quests[0]
                item = items_by_id.get(item_id)
                requiring_quest = quests_by_id.get(requiring_quest_id)
                warnings.append(_warning(
                    "quest_item_required_before_rewarded_in_arc",
                    "adventure_beat_links",
                    requirement_row["link"].id,
                    "quest",
                    requiring_quest_id,
                    (
                        f"Quest {_label(requiring_quest) if requiring_quest else requiring_quest_id} requires "
                        f"important item {_label(item) if item else item_id} before arc quest "
                        f"{_label(reward_quest)} rewards it."
                    ),
                    scope_kind="story_arc",
                    scope_id=arc.id,
                    adventure_beat_id=requirement_row["beat"].id,
                    related_entry_ids=[reward_quest.id, requirement_row["link"].id],
                    item_id=item_id,
                ))
    return warnings


def _event_connected_to_quest(event, quest_required_flags, quest_produced_flags, requirements_by_id):
    event_flags = set(event.flags_set or [])
    requirement = requirements_by_id.get(event.requirements_id)
    if requirement:
        event_flags.update(row.flag_id for row in requirement.required_flags)
        event_flags.update(row.flag_id for row in requirement.forbidden_flags)
    return bool(event_flags & (quest_required_flags | quest_produced_flags))


def _quest_runtime_event_window_warnings(occurrences, quests, events, requirements_by_id):
    warnings = []
    links_by_quest = defaultdict(list)
    event_rows_by_scope = defaultdict(list)
    events_by_id = {event.id: event for event in events}
    for occurrence in occurrences:
        if occurrence["target_type"] == "quest":
            links_by_quest[occurrence["target_id"]].append(occurrence)
        if occurrence["target_type"] == "event" and occurrence["scope_kind"] == "story_arc":
            event_rows_by_scope[occurrence["scope_id"]].append(occurrence)

    for quest in quests:
        if not quest.story_arc_id:
            continue
        quest_rows = [
            row for row in links_by_quest[quest.id]
            if row["scope_kind"] == "story_arc" and row["scope_id"] == quest.story_arc_id
        ]
        start, resolution = _quest_story_window(quest_rows)
        if not start or not resolution:
            continue
        quest_required_flags = _quest_required_flags(quest, requirements_by_id)
        quest_produced_flags = _quest_produced_flags(quest)
        if not quest_required_flags and not quest_produced_flags:
            continue
        for event_row in event_rows_by_scope[quest.story_arc_id]:
            event = events_by_id.get(event_row["target_id"])
            if not event or not _event_connected_to_quest(event, quest_required_flags, quest_produced_flags, requirements_by_id):
                continue
            if event_row["order"] < start["order"]:
                warnings.append(_warning(
                    "quest_runtime_event_before_start",
                    "adventure_beat_links",
                    event_row["link"].id,
                    "quest",
                    quest.id,
                    (
                        f"Runtime event {_label(event)} is placed before quest {_label(quest)} has a clear "
                        "start placement in this story lane."
                    ),
                    scope_kind="story_arc",
                    scope_id=quest.story_arc_id,
                    adventure_beat_id=event_row["beat"].id,
                    related_entry_ids=[event.id, start["link"].id],
                ))
            if event_row["order"] > resolution["order"]:
                warnings.append(_warning(
                    "quest_runtime_event_after_resolution",
                    "adventure_beat_links",
                    event_row["link"].id,
                    "quest",
                    quest.id,
                    (
                        f"Runtime event {_label(event)} is placed after quest {_label(quest)} is resolved "
                        "in this story lane."
                    ),
                    scope_kind="story_arc",
                    scope_id=quest.story_arc_id,
                    adventure_beat_id=event_row["beat"].id,
                    related_entry_ids=[event.id, resolution["link"].id],
                ))
    return warnings


def _quest_warnings(occurrences, quests, story_arcs, requirements, events, items_by_id):
    warnings = []
    quests_by_id = {quest.id: quest for quest in quests}
    requirements_by_id = {requirement.id: requirement for requirement in requirements}
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
        start, resolution = _quest_story_window(rows)
        if not start:
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
        if not resolution:
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
    warnings.extend(_quest_arc_order_warnings(story_arcs, quests_by_id, requirements_by_id))
    warnings.extend(_quest_item_reward_order_warnings(occurrences, story_arcs, quests_by_id, items_by_id))
    warnings.extend(_quest_runtime_event_window_warnings(occurrences, quests, events, requirements_by_id))
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
    tags = getattr(item, "tags", None) or []
    return (
        str(_enum_value(item.type)).lower() in IMPORTANT_ITEM_TYPES
        or str(_enum_value(item.rarity)).lower() in IMPORTANT_ITEM_RARITIES
        or any(str(tag).lower() in IMPORTANT_ITEM_TAGS for tag in tags)
    )


def _important_location(location):
    tags = getattr(location, "tags", None) or []
    environment_tags = getattr(location, "environment_tags", None) or []
    return (
        str(_enum_value(getattr(location, "location_type", ""))).lower() in IMPORTANT_LOCATION_TYPES
        or str(_enum_value(getattr(location, "place_kind", ""))).lower() in IMPORTANT_LOCATION_KINDS
        or any(str(tag).lower() in IMPORTANT_LOCATION_TAGS for tag in [*tags, *environment_tags])
    )


def _item_usage_row(row):
    return (
        row["occurrence_kind"] == "requirement"
        or row["occurrence_kind"] == "consequence"
        or row["change_type"] in ITEM_USE_CHANGES
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


def _location_introduction_warnings(occurrences, events, locations_by_id):
    warnings = []
    usage_by_scope = defaultdict(list)
    event_contexts = _event_scope_contexts(occurrences, events)
    for event in events:
        if not event.location_id:
            continue
        location = locations_by_id.get(event.location_id)
        if not location or not _important_location(location):
            continue
        scopes = list(event_contexts[event.id].values()) or [_usage_scope("unassigned", "unassigned")]
        for scope in scopes:
            usage_by_scope[(event.location_id, scope["scope_kind"], scope["scope_id"])].append({
                "kind": "event",
                "entry_id": event.id,
                "label": _label(event),
                "location_id": event.location_id,
                "paths": [f"events.{event.id}.location_id"],
                **scope,
            })

    introductions_by_scope = defaultdict(list)
    for row in occurrences:
        if row["target_type"] != "location" or row["change_type"] not in LOCATION_INTRODUCTION_CHANGES:
            continue
        introductions_by_scope[(row["target_id"], row["scope_kind"], row["scope_id"])].append(row)

    for (location_id, scope_kind, scope_id), evidence in sorted(usage_by_scope.items()):
        if len(evidence) < LOCATION_HEAVY_USAGE_THRESHOLD:
            continue
        introductions = sorted(
            introductions_by_scope[(location_id, scope_kind, scope_id)],
            key=lambda row: (row["order"], row["link"].id),
        )
        comparable_usage = [
            row for row in evidence
            if row.get("ordering_source") == "adventure_beats.sort_order" and row.get("order") is not None
        ]
        earliest_usage = min(comparable_usage, key=lambda row: (row["order"], row["entry_id"])) if comparable_usage else None
        earliest_introduction = introductions[0] if introductions else None
        late_introduction = bool(
            earliest_usage
            and earliest_introduction
            and earliest_introduction["order"] > earliest_usage["order"]
        )
        if introductions and not late_introduction:
            continue

        location = locations_by_id.get(location_id)
        scope_label = f"{scope_kind.replace('_', ' ')} {scope_id}"
        metadata = {
            "scope_kind": scope_kind,
            "scope_id": scope_id,
            "usage_count": len(evidence),
            "usage_evidence": evidence,
            "introduction_entry_ids": [row["link"].id for row in introductions],
            "related_entry_ids": [row["entry_id"] for row in evidence],
        }
        if earliest_usage:
            metadata["earliest_comparable_usage"] = {
                "kind": earliest_usage["kind"],
                "entry_id": earliest_usage["entry_id"],
                "adventure_beat_id": earliest_usage.get("adventure_beat_id"),
                "adventure_beat_label": earliest_usage.get("adventure_beat_label"),
                "order": earliest_usage["order"],
                "ordering_source": earliest_usage["ordering_source"],
            }

        if late_introduction:
            warnings.append(_warning(
                "location_introduction_after_first_event_use",
                "locations",
                location_id,
                "location",
                location_id,
                (
                    f"Location {_label(location) if location else location_id} has {len(evidence)} scoped event uses "
                    f"in {scope_label}, but its first canonical introduction at "
                    f"{earliest_introduction['beat'].title} follows comparable usage at "
                    f"{earliest_usage['adventure_beat_label']}."
                ),
                **metadata,
            ))
        else:
            warnings.append(_warning(
                "location_missing_introduction_placement",
                "locations",
                location_id,
                "location",
                location_id,
                (
                    f"Location {_label(location) if location else location_id} has {len(evidence)} scoped event uses "
                    f"in {scope_label} but no canonical introduced placement in this story lane."
                ),
                **metadata,
            ))
    return warnings


def build_adventure_timeline_coherence_warnings(
    *,
    adventure_beats,
    adventure_beat_links,
    characters,
    items,
    story_arcs,
    requirements,
    quests,
    dialogues,
    dialogue_nodes,
    events,
    encounters,
    character_story_beats,
    combat_profiles,
    interaction_profiles,
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
    warnings.extend(_character_introduction_warnings(
        occurrences,
        characters_by_id,
        _character_usage_evidence(
            occurrences,
            dialogues,
            dialogue_nodes,
            encounters,
            events,
            quests,
            character_story_beats,
            combat_profiles,
            interaction_profiles,
        ),
    ))
    warnings.extend(_item_warnings(occurrences, items_by_id))
    warnings.extend(_quest_warnings(occurrences, quests, story_arcs, requirements, events, items_by_id))
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
    warnings.extend(_location_introduction_warnings(occurrences, events, locations_by_id))
    return warnings
