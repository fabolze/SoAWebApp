"""Shared, route-backed operations for atomic authoring bundles."""

from flask import abort

from backend.app.models.m_abilities import Ability
from backend.app.models.m_adventure_narrative import AdventureBeatLink
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event, EventType
from backend.app.models.m_factions import Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_items import Item
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_locations import Location
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shops import Shop
from backend.app.models.m_currencies import Currency
from backend.app.routes.bundle_validation import wrap_bundle_error
from backend.app.routes.r_flags import route as flag_route
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.routes.r_adventure_narrative import adventure_beat_link_route
from backend.app.services.dialogue_choice_actions import validate_choice_contracts
from backend.app.services.narrative_contracts import validate_narrative_actions, validate_outcome_transitions, validate_repeat_policy


REQUIREMENT_TARGETS = {
    "abilities": Ability,
    "dialogue_nodes": DialogueNode,
    "dialogues": Dialogue,
    "encounters": Encounter,
    "events": Event,
    "items": Item,
    "location_pois": LocationPoi,
    "location_routes": LocationRoute,
    "quests": Quest,
    "shops": Shop,
}


def enum_value(value):
    return getattr(value, "value", value)


def column_snapshot(item):
    if item is None:
        return None
    return {column.name: enum_value(getattr(item, column.name)) for column in item.__table__.columns}


def compact_snapshot(item):
    data = column_snapshot(item)
    if not data:
        return None
    keys = (
        "id", "slug", "name", "title", "description", "type", "encounter_type",
        "requirements_id", "dialogue_id", "encounter_id", "lore_id", "location_id",
        "next_event_id", "flags_set", "tags",
    )
    return {key: data.get(key) for key in keys if key in data}


def _upsert_with_route(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        item_id = data.get("id")
        if not item_id:
            abort(400, description=f"{path}.id is required")
        item = db_session.get(model, item_id) or model(id=item_id)
        required = route.get_required_fields()
        route.validate_required_fields(data, required)
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _validate_reward_refs(db_session, data, path):
    for index, reward in enumerate(data.get("item_rewards") or []):
        if not isinstance(reward, dict) or not db_session.get(Item, reward.get("item_id")):
            abort(400, description=f"{path}.item_rewards[{index}].item_id is invalid")
    for index, reward in enumerate(data.get("currency_rewards") or []):
        if not isinstance(reward, dict) or not db_session.get(Currency, reward.get("currency_id")):
            abort(400, description=f"{path}.currency_rewards[{index}].currency_id is invalid")
    for index, reward in enumerate(data.get("reputation_rewards") or []):
        if not isinstance(reward, dict) or not db_session.get(Faction, reward.get("faction_id")):
            abort(400, description=f"{path}.reputation_rewards[{index}].faction_id is invalid")


def upsert_event(db_session, data, path, *, defer_next=False):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        missing = [key for key in ("id", "slug", "title", "type") if not data.get(key)]
        if missing:
            abort(400, description=f"{path} missing required fields: {', '.join(missing)}")
        event = db_session.get(Event, data["id"]) or Event(id=data["id"])
        try:
            event.type = EventType(data["type"])
        except ValueError as error:
            raise ValueError(f"{path}.type is invalid: {data['type']}") from error

        refs = {
            "requirements_id": Requirement,
            "encounter_id": Encounter,
            "dialogue_id": Dialogue,
            "lore_id": LoreEntry,
            "location_id": Location,
        }
        for field, model in refs.items():
            if data.get(field) and not db_session.get(model, data[field]):
                abort(400, description=f"{path}.{field} is invalid")
        if data.get("next_event_id") and not defer_next and not db_session.get(Event, data["next_event_id"]):
            abort(400, description=f"{path}.next_event_id is invalid")
        for flag_id in data.get("flags_set") or []:
            if not db_session.get(Flag, flag_id):
                abort(400, description=f"{path}.flags_set references missing flag {flag_id}")
        _validate_reward_refs(db_session, data, path)

        event.slug = str(data["slug"]).strip().lower()
        event.title = str(data["title"]).strip()
        event.requirements_id = data.get("requirements_id") or None
        event.location_id = data.get("location_id") or None
        event.lore_id = data.get("lore_id") if event.type == EventType.LoreDiscovery else None
        event.dialogue_id = data.get("dialogue_id") if event.type == EventType.Dialogue else None
        event.encounter_id = data.get("encounter_id") if event.type == EventType.Encounter else None
        event.item_rewards = data.get("item_rewards") or []
        event.xp_reward = data.get("xp_reward")
        event.currency_rewards = data.get("currency_rewards") or []
        event.reputation_rewards = data.get("reputation_rewards") or []
        event.actions = validate_narrative_actions(db_session, data.get("actions") or [], f"{path}.actions")
        if not defer_next:
            event.outcome_transitions = validate_outcome_transitions(
                db_session, data.get("outcome_transitions") or [], f"{path}.outcome_transitions",
            )
        event.repeat_policy = validate_repeat_policy(data.get("repeat_policy"), f"{path}.repeat_policy")
        runtime_support = data.get("runtime_support", "runtime_unverified")
        if runtime_support not in {"runtime_unverified", "runtime_verified"}:
            abort(400, description=f"{path}.runtime_support is invalid")
        event.runtime_support = runtime_support
        event.flags_set = data.get("flags_set") or []
        event.tags = [str(tag).strip().lower() for tag in data.get("tags") or [] if str(tag).strip()]
        if not defer_next:
            event.next_event_id = data.get("next_event_id") or None
        db_session.add(event)
        db_session.flush()
        return event
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def attach_requirement(db_session, attachment, path):
    try:
        if not isinstance(attachment, dict):
            abort(400, description=f"{path} must be an object")
        schema_name = attachment.get("schema_name")
        model = REQUIREMENT_TARGETS.get(schema_name)
        if not model:
            abort(400, description=f"{path}.schema_name is not supported")
        item = db_session.get(model, attachment.get("entry_id"))
        if not item:
            abort(400, description=f"{path}.entry_id references missing {schema_name}")
        requirement_id = attachment.get("requirements_id")
        if requirement_id and not db_session.get(Requirement, requirement_id):
            abort(400, description=f"{path}.requirements_id references missing requirement")
        item.requirements_id = requirement_id or None
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def apply_dialogue_choice_action(db_session, change, path):
    """Apply one compiler-owned action to a stable JSON choice with stale protection."""
    try:
        if not isinstance(change, dict):
            abort(400, description=f"{path} must be an object")
        node = db_session.get(DialogueNode, change.get("node_id"))
        if not node:
            abort(400, description=f"{path}.node_id references a missing dialogue node")
        choices = [dict(choice) for choice in node.choices or [] if isinstance(choice, dict)]
        index = next((index for index, choice in enumerate(choices) if choice.get("id") == change.get("choice_id")), None)
        if index is None:
            abort(400, description=f"{path}.choice_id references a missing canonical choice")
        if choices[index] != change.get("expected_previous"):
            abort(409, description=f"{path}.expected_previous is stale")
        action = change.get("action")
        if not isinstance(action, dict) or not action.get("id"):
            abort(400, description=f"{path}.action requires an id")
        actions = [dict(row) for row in choices[index].get("actions") or [] if isinstance(row, dict)]
        existing = next((position for position, row in enumerate(actions) if row.get("id") == action["id"]), None)
        if existing is None:
            actions.append(dict(action))
        else:
            actions[existing] = dict(action)
        choices[index] = {**choices[index], "actions": actions}
        node.choices = validate_choice_contracts(db_session, node, choices)
        db_session.add(node)
        db_session.flush()
        return node
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def apply_dialogue_choice_flag(db_session, change, path):
    """Attach a generated output flag to one stable choice with stale protection."""
    try:
        node = db_session.get(DialogueNode, change.get("node_id"))
        if not node:
            abort(400, description=f"{path}.node_id references a missing dialogue node")
        choices = [dict(choice) for choice in node.choices or [] if isinstance(choice, dict)]
        index = next((position for position, choice in enumerate(choices) if choice.get("id") == change.get("choice_id")), None)
        if index is None:
            abort(400, description=f"{path}.choice_id references a missing canonical choice")
        if choices[index] != change.get("expected_previous"):
            abort(409, description=f"{path}.expected_previous is stale")
        flag_id = change.get("flag_id")
        if not db_session.get(Flag, flag_id):
            abort(400, description=f"{path}.flag_id references a missing flag")
        choices[index] = {**choices[index], "set_flags": list(dict.fromkeys([*(choices[index].get("set_flags") or []), flag_id]))}
        node.choices = validate_choice_contracts(db_session, node, choices)
        db_session.add(node)
        db_session.flush()
        return node
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def apply_creation_flow_mutation(db_session, mutation):
    """Apply compiler output in dependency order and return an honest change review."""
    review = {"created": [], "changed": [], "deleted": [], "unlinked": []}

    def record(table, item_id, existed, details=None):
        review["changed" if existed else "created"].append({
            "table": table, "id": item_id, "details": details or {},
        })

    for index, data in enumerate(mutation.get("flags") or []):
        existed = db_session.get(Flag, data.get("id")) is not None
        item = _upsert_with_route(db_session, flag_route, Flag, data, f"mutation.flags[{index}]")
        record("flags", item.id, existed)

    for index, data in enumerate(mutation.get("requirements") or []):
        required = set(data.get("required_flags") or [])
        forbidden = set(data.get("forbidden_flags") or [])
        overlap = sorted(required & forbidden)
        if overlap:
            abort(400, description=f"mutation.requirements[{index}] requires and forbids flag {overlap[0]}")
        existed = db_session.get(Requirement, data.get("id")) is not None
        item = _upsert_with_route(db_session, requirement_route, Requirement, data, f"mutation.requirements[{index}]")
        record("requirements", item.id, existed)

    events = mutation.get("events") or []
    for index, data in enumerate(events):
        existed = db_session.get(Event, data.get("id")) is not None
        item = upsert_event(db_session, data, f"mutation.events[{index}]", defer_next=True)
        record("events", item.id, existed)
    for index, data in enumerate(events):
        upsert_event(db_session, data, f"mutation.events[{index}]")

    for index, data in enumerate(mutation.get("requirement_attachments") or []):
        item = attach_requirement(db_session, data, f"mutation.requirement_attachments[{index}]")
        review["changed"].append({
            "table": data["schema_name"], "id": item.id,
            "details": {"requirements_id": data.get("requirements_id")},
        })

    for index, data in enumerate(mutation.get("adventure_beat_links") or []):
        existed = db_session.get(AdventureBeatLink, data.get("id")) is not None
        item = _upsert_with_route(
            db_session, adventure_beat_link_route, AdventureBeatLink, data,
            f"mutation.adventure_beat_links[{index}]",
        )
        record("adventure_beat_links", item.id, existed)

    for index, data in enumerate(mutation.get("dialogue_choice_actions") or []):
        item = apply_dialogue_choice_action(db_session, data, f"mutation.dialogue_choice_actions[{index}]")
        review["changed"].append({
            "table": "dialogue_nodes", "id": item.id,
            "details": {"choice_id": data.get("choice_id"), "action_id": data.get("action", {}).get("id")},
        })

    for index, data in enumerate(mutation.get("dialogue_choice_flags") or []):
        item = apply_dialogue_choice_flag(db_session, data, f"mutation.dialogue_choice_flags[{index}]")
        review["changed"].append({
            "table": "dialogue_nodes", "id": item.id,
            "details": {"choice_id": data.get("choice_id"), "flag_id": data.get("flag_id")},
        })

    db_session.flush()
    return review
