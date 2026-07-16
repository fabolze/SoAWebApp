"""Canonical validation and migration helpers for dialogue choices and actions."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

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


def normalize_choice_contracts(choices: Any) -> list[dict[str, Any]]:
    """Return a copied choice list with persistent identities and deterministic action order."""
    if not isinstance(choices, list):
        raise ValueError("choices must be an array")
    normalized: list[dict[str, Any]] = []
    choice_ids: set[str] = set()
    for choice in choices:
        if not isinstance(choice, dict):
            raise ValueError("Choice entries must be objects")
        row = deepcopy(choice)
        choice_id = str(row.get("id") or "").strip() or generate_ulid()
        if choice_id in choice_ids:
            raise ValueError(f"Duplicate dialogue choice id: {choice_id}")
        choice_ids.add(choice_id)
        row["id"] = choice_id

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
            action_id = str(action_row.get("id") or "").strip() or generate_ulid()
            if action_id in action_ids:
                raise ValueError(f"Duplicate dialogue choice action id: {action_id}")
            action_ids.add(action_id)
            action_row["id"] = action_id
            if isinstance(action_row.get("sort_order"), bool) or not isinstance(action_row.get("sort_order"), int):
                action_row["sort_order"] = index
            action_row.setdefault("runtime_support", "runtime_unverified")
            normalized_actions.append(action_row)
        normalized_actions.sort(key=lambda item: (item["sort_order"], item["id"]))
        row["actions"] = normalized_actions
        normalized.append(row)
    return normalized


def validate_choice_contracts(db_session, node, choices: Any, *, validate_targets: bool = True) -> list[dict[str, Any]]:
    """Normalize and validate choice identity, navigation, and typed action references."""
    normalized = normalize_choice_contracts(choices)
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
        if blocking_actions and actions[-1]["id"] != blocking_actions[0]["id"]:
            raise ValueError(f"Choice '{choice_id}' interaction-replacing action must be last")
        if blocking_actions and next_node_id:
            raise ValueError(f"Choice '{choice_id}' cannot combine next_node_id with an interaction-replacing action")
    return normalized


def find_dialogue_choice(db_session, choice_id: str):
    """Locate a canonical JSON choice by immutable id."""
    for node in db_session.query(DialogueNode).order_by(DialogueNode.id).all():
        for index, choice in enumerate(node.choices or []):
            if isinstance(choice, dict) and choice.get("id") == choice_id:
                return node, index, choice
    return None
