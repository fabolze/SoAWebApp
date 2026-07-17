"""Canonical validation and migration helpers for dialogue choices and actions."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from backend.app.models.m_characters import Character
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_shops import Shop
from backend.app.utils.id import generate_ulid


ACTION_CONTRACTS = {
    "open_shop": {
        "target_field": "target_shop_id",
        "target_model": Shop,
        "continuation_policies": {"resume_source_dialogue"},
        "blocks_navigation": True,
    },
    "start_encounter": {
        "target_field": "target_encounter_id",
        "target_model": Encounter,
        "continuation_policies": {"end_source_dialogue"},
        "blocks_navigation": True,
    },
    "join_companion": {
        "target_field": "target_character_id",
        "target_model": Character,
        "continuation_policies": {"continue_dialogue", "end_source_dialogue"},
        "blocks_navigation": False,
    },
}

LEGACY_ACTION_TARGETS = {
    "open_shop": "shop",
    "start_encounter": "encounter",
    "join_companion": "character",
    "discover_quest": "quest",
    "assign_quest": "quest",
    "reveal_map_marker": "location_poi",
}
LEGACY_ACTION_FIELDS = {
    "action_id", "action_type", "target_ref_type", "target_ref_id", "timing",
    "repeat_policy", "runtime_support", "continuation_policy", "sort_order",
}


def _stable_id(kind: str, owner_id: str, index: int) -> str:
    return f"{kind}-{uuid5(NAMESPACE_URL, f'soa:{kind}:{owner_id}:{index}')}"


def normalize_dialogue_choices(node_id: str, choices: Any) -> list[dict[str, Any]]:
    """Compatibility-normalize capture-era choices while also exposing canonical ids."""
    if not isinstance(choices, list):
        raise ValueError("choices must be an array")
    normalized: list[dict[str, Any]] = []
    for choice_index, raw_choice in enumerate(choices):
        if not isinstance(raw_choice, dict):
            raise ValueError("Choice entries must be objects")
        choice = deepcopy(raw_choice)
        choice_id = str(choice.get("id") or choice.get("choice_id") or "").strip()
        if not choice_id:
            choice_id = _stable_id("choice", node_id, choice_index)
        choice["id"] = choice_id
        choice["choice_id"] = choice_id
        actions = choice.get("actions") or []
        if not isinstance(actions, list):
            raise ValueError("Choice actions must be an array")
        next_actions = []
        for action_index, raw_action in enumerate(actions):
            if not isinstance(raw_action, dict):
                raise ValueError("Choice action entries must be objects")
            action = deepcopy(raw_action)
            if "action_id" in action or "target_ref_type" in action or "target_ref_id" in action:
                action_id = str(action.get("action_id") or "").strip() or _stable_id("action", choice_id, action_index)
                action["action_id"] = action_id
            else:
                action_id = str(action.get("id") or "").strip() or generate_ulid()
                action["id"] = action_id
                action.setdefault("sort_order", action_index)
                action.setdefault("runtime_support", "runtime_unverified")
            next_actions.append(action)
        choice["actions"] = next_actions
        normalized.append(choice)
    return normalized


def _legacy_target_models():
    from backend.app.models.m_location_pois import LocationPoi
    from backend.app.models.m_quests import Quest

    return {
        "character": Character,
        "encounter": Encounter,
        "location_poi": LocationPoi,
        "quest": Quest,
        "shop": Shop,
    }


def validate_dialogue_action(db_session, action, path="action"):
    """Validate the capture-era generic target envelope without mutating it."""
    if not isinstance(action, dict):
        raise ValueError(f"{path} must be an object")
    unknown = set(action) - LEGACY_ACTION_FIELDS
    if unknown:
        raise ValueError(f"{path} contains unsupported fields: {', '.join(sorted(unknown))}")
    action_id = action.get("action_id")
    if not isinstance(action_id, str) or not action_id.strip():
        raise ValueError(f"{path}.action_id must be a non-empty stable id")
    action_type = action.get("action_type")
    if action_type not in LEGACY_ACTION_TARGETS:
        raise ValueError(f"{path}.action_type is unsupported: {action_type}")
    expected_target_type = LEGACY_ACTION_TARGETS[action_type]
    if action.get("target_ref_type") != expected_target_type:
        raise ValueError(f"{path}.target_ref_type must be {expected_target_type} for {action_type}")
    target_id = action.get("target_ref_id")
    if not isinstance(target_id, str) or not target_id.strip():
        raise ValueError(f"{path}.target_ref_id must be a non-empty canonical id")
    if not db_session.get(_legacy_target_models()[expected_target_type], target_id):
        raise ValueError(f"{path}.target_ref_id does not reference an existing {expected_target_type}: {target_id}")
    if action.get("timing") not in {"immediate", "after_completion", "on_turn_in"}:
        raise ValueError(f"{path}.timing must be explicit")
    if action.get("repeat_policy") not in {"inherit_owner", "one_shot", "repeatable"}:
        raise ValueError(f"{path}.repeat_policy must be explicit")
    if action.get("runtime_support") not in {"runtime_unverified", "runtime_verified"}:
        raise ValueError(f"{path}.runtime_support must declare runtime verification")
    continuation = action.get("continuation_policy")
    if continuation not in {"advance_to_next_node", "resume_source_dialogue", "end_source_dialogue", "return_to_origin"}:
        raise ValueError(f"{path}.continuation_policy must be explicit")
    if action_type == "open_shop" and continuation != "resume_source_dialogue":
        raise ValueError(f"{path}.continuation_policy must be resume_source_dialogue for open_shop")
    sort_order = action.get("sort_order")
    if isinstance(sort_order, bool) or not isinstance(sort_order, int) or sort_order < 0:
        raise ValueError(f"{path}.sort_order must be a non-negative integer")


def validate_dialogue_choice_actions(db_session, choice, path="choice"):
    actions = choice.get("actions") or []
    ids = []
    orders = []
    for index, action in enumerate(actions):
        validate_dialogue_action(db_session, action, f"{path}.actions[{index}]")
        ids.append(action["action_id"])
        orders.append(action["sort_order"])
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path}.actions contains duplicate action_id values")
    if len(orders) != len(set(orders)):
        raise ValueError(f"{path}.actions contains duplicate sort_order values")


def normalize_choice_contracts(choices: Any, node_id: str = "legacy") -> list[dict[str, Any]]:
    """Return a copied choice list with persistent identities and deterministic action order."""
    if not isinstance(choices, list):
        raise ValueError("choices must be an array")
    normalized: list[dict[str, Any]] = []
    choice_ids: set[str] = set()
    for choice in choices:
        if not isinstance(choice, dict):
            raise ValueError("Choice entries must be objects")
        row = deepcopy(choice)
        choice_id = str(row.get("id") or row.get("choice_id") or "").strip() or _stable_id("choice", node_id, len(normalized))
        if choice_id in choice_ids:
            raise ValueError(f"Duplicate dialogue choice id: {choice_id}")
        choice_ids.add(choice_id)
        row["id"] = choice_id
        row["choice_id"] = choice_id

        actions = row.get("actions", [])
        if actions is None:
            actions = []
        if not isinstance(actions, list):
            raise ValueError("Choice actions must be an array")
        action_ids: set[str] = set()
        normalized_actions: list[dict[str, Any]] = []
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                raise ValueError("Choice action entries must be objects")
            action_row = deepcopy(action)
            legacy_action = "action_id" in action_row or "target_ref_type" in action_row or "target_ref_id" in action_row
            action_id = str(action_row.get("id") or action_row.get("action_id") or "").strip() or _stable_id("action", choice_id, index)
            if action_id in action_ids:
                raise ValueError(f"Duplicate dialogue choice action id: {action_id}")
            action_ids.add(action_id)
            if legacy_action:
                action_row["action_id"] = action_id
            else:
                action_row["id"] = action_id
            if isinstance(action_row.get("sort_order"), bool) or not isinstance(action_row.get("sort_order"), int):
                action_row["sort_order"] = index
            action_row.setdefault("runtime_support", "runtime_unverified")
            normalized_actions.append(action_row)
        normalized_actions.sort(key=lambda item: (item["sort_order"], item.get("id") or item.get("action_id")))
        row["actions"] = normalized_actions
        normalized.append(row)
    return normalized


def validate_choice_contracts(db_session, node, choices: Any, *, validate_targets: bool = True) -> list[dict[str, Any]]:
    """Normalize and validate choice identity, navigation, and typed action references."""
    normalized = normalize_choice_contracts(choices, str(getattr(node, "id", "legacy") or "legacy"))
    for choice in normalized:
        choice_id = choice["id"]
        next_node_id = str(choice.get("next_node_id") or "").strip()
        actions = choice["actions"]
        if not next_node_id and not actions:
            raise ValueError(f"Choice '{choice_id}' needs a next node or at least one typed action")
        if "choice_text" in choice and not isinstance(choice["choice_text"], str):
            raise ValueError("Choice choice_text must be a string")
        if "requirements_id" in choice and choice["requirements_id"] is not None and not isinstance(choice["requirements_id"], str):
            raise ValueError("Choice requirements_id must be an id")

        seen_orders: set[int] = set()
        blocking_actions = []
        for action in actions:
            if "action_id" in action or "target_ref_type" in action or "target_ref_id" in action:
                validate_dialogue_action(db_session, action, f"Choice '{choice_id}' action")
                continue
            action_type = str(action.get("action_type") or "").strip()
            contract = ACTION_CONTRACTS.get(action_type)
            if not contract:
                raise ValueError(f"Unsupported dialogue choice action_type: {action_type or '(missing)'}")
            sort_order = action["sort_order"]
            if sort_order < 0 or sort_order in seen_orders:
                raise ValueError(f"Choice '{choice_id}' action sort_order values must be unique non-negative integers")
            seen_orders.add(sort_order)
            target_field = contract["target_field"]
            target_id = str(action.get(target_field) or "").strip()
            if not target_id:
                raise ValueError(f"Choice action '{action['id']}' requires {target_field}")
            if validate_targets and not db_session.get(contract["target_model"], target_id):
                raise ValueError(f"Choice action '{action['id']}' has invalid {target_field}: {target_id}")
            continuation = str(action.get("continuation_policy") or "").strip()
            if continuation not in contract["continuation_policies"]:
                allowed = ", ".join(sorted(contract["continuation_policies"]))
                raise ValueError(f"Choice action '{action['id']}' continuation_policy must be one of: {allowed}")
            if action.get("runtime_support") not in {"runtime_unverified", "runtime_verified"}:
                raise ValueError(f"Choice action '{action['id']}' has invalid runtime_support")
            if contract["blocks_navigation"]:
                blocking_actions.append(action)

        if len(blocking_actions) > 1:
            raise ValueError(f"Choice '{choice_id}' cannot contain more than one interaction-replacing action")
        if blocking_actions and actions[-1].get("id") != blocking_actions[0].get("id"):
            raise ValueError(f"Choice '{choice_id}' interaction-replacing action must be last")
        if blocking_actions and next_node_id:
            raise ValueError(f"Choice '{choice_id}' cannot combine next_node_id with an interaction-replacing action")
    return normalized


def find_dialogue_choice(db_session, choice_id: str):
    """Locate a canonical JSON choice by immutable id."""
    for node in db_session.query(DialogueNode).order_by(DialogueNode.id).all():
        for index, choice in enumerate(node.choices or []):
            if isinstance(choice, dict) and (choice.get("id") == choice_id or choice.get("choice_id") == choice_id):
                return node, index, choice
    return None
