"""Validation helpers for narrative gameplay contracts stored in JSON columns.

The web app owns and exports these contracts.  Runtime support is deliberately
explicit on every executable row so authoring validation cannot be mistaken for
proof that a consuming game runtime executes it.
"""

from __future__ import annotations

from typing import Any

from backend.app.models.m_characters import Character
from backend.app.models.m_currencies import Currency
from backend.app.models.m_effects import Effect
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_items import Item
from backend.app.models.m_locations import Location
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_quests import Quest
from backend.app.models.m_statuses import Status


ACTION_TYPES = {
    "apply_effect", "restore_resource", "apply_status", "remove_status",
    "remove_matching_statuses", "grant_currency", "take_currency",
    "discover_quest", "assign_quest", "reveal_map_marker", "turn_in_quest",
    "track_inventory_objective", "join_companion", "set_party_membership",
    "activate_location_variant", "activate_character_variant", "activate_item_variant",
}
TARGET_SCOPES = {
    "player", "party", "source_character", "target_character",
    "encounter_side", "location", "explicit_entity",
}
TIMINGS = {"immediate", "after_completion", "on_turn_in"}
REPEAT_POLICIES = {"inherit_owner", "one_shot", "repeatable"}
RUNTIME_SUPPORT = {"runtime_unverified", "runtime_verified"}
REMOVAL_MODES = {"cleanse", "dispel", "system"}
TRANSITION_TRIGGERS = {"complete", "dialogue_choice", "victory", "interaction_closed", "condition", "fallback"}


def _require_ref(db_session, model, value: Any, path: str) -> str:
    ref_id = str(value or "").strip()
    if not ref_id or not db_session.get(model, ref_id):
        raise ValueError(f"{path} references a missing record")
    return ref_id


def validate_narrative_actions(db_session, value: Any, path: str = "actions") -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{path} must be an array")
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(value):
        row_path = f"{path}[{index}]"
        if not isinstance(raw, dict):
            raise ValueError(f"{row_path} must be an object")
        row = dict(raw)
        action_id = str(row.get("id") or "").strip()
        if not action_id:
            raise ValueError(f"{row_path}.id is required")
        if action_id in seen_ids:
            raise ValueError(f"{row_path}.id must be unique")
        seen_ids.add(action_id)
        action_type = row.get("action_type")
        if action_type not in ACTION_TYPES:
            raise ValueError(f"{row_path}.action_type is unsupported")
        if row.get("target_scope", "player") not in TARGET_SCOPES:
            raise ValueError(f"{row_path}.target_scope is invalid")
        if row.get("timing", "after_completion") not in TIMINGS:
            raise ValueError(f"{row_path}.timing is invalid")
        if row.get("repeat_policy", "inherit_owner") not in REPEAT_POLICIES:
            raise ValueError(f"{row_path}.repeat_policy is invalid")
        if row.get("runtime_support", "runtime_unverified") not in RUNTIME_SUPPORT:
            raise ValueError(f"{row_path}.runtime_support must declare runtime verification")
        sort_order = row.get("sort_order", index)
        if isinstance(sort_order, bool) or not isinstance(sort_order, int) or sort_order < 0:
            raise ValueError(f"{row_path}.sort_order must be a non-negative integer")

        refs = {
            "effect_id": Effect, "status_id": Status, "currency_id": Currency,
            "quest_id": Quest, "item_id": Item, "character_id": Character,
            "location_id": Location,
            "location_poi_id": LocationPoi,
        }
        required_by_action = {
            "apply_effect": "effect_id", "restore_resource": "effect_id",
            "apply_status": "status_id", "remove_status": "status_id",
            "grant_currency": "currency_id", "take_currency": "currency_id",
            "discover_quest": "quest_id", "assign_quest": "quest_id",
            "turn_in_quest": "quest_id", "track_inventory_objective": "item_id",
            "join_companion": "character_id", "set_party_membership": "character_id",
            "activate_location_variant": "location_id",
            "activate_character_variant": "character_id",
            "activate_item_variant": "item_id",
        }
        required_ref = required_by_action.get(action_type)
        if required_ref:
            _require_ref(db_session, refs[required_ref], row.get(required_ref), f"{row_path}.{required_ref}")
        for key, model in refs.items():
            if row.get(key) and key != required_ref:
                _require_ref(db_session, model, row[key], f"{row_path}.{key}")
        if action_type == "reveal_map_marker" and not row.get("location_id") and not row.get("location_poi_id"):
            raise ValueError(f"{row_path} requires location_id or location_poi_id")
        if action_type in {"grant_currency", "take_currency"}:
            amount = row.get("amount")
            if isinstance(amount, bool) or not isinstance(amount, (int, float)) or amount <= 0:
                raise ValueError(f"{row_path}.amount must be greater than zero")
        if action_type == "apply_status" and row.get("stacks") is not None:
            stacks = row["stacks"]
            if isinstance(stacks, bool) or not isinstance(stacks, int) or stacks < 1:
                raise ValueError(f"{row_path}.stacks must be a positive integer")
        if action_type in {"remove_status", "remove_matching_statuses"} and row.get("removal_mode") not in REMOVAL_MODES:
            raise ValueError(f"{row_path}.removal_mode is invalid")
        if action_type == "remove_matching_statuses":
            filters = row.get("status_filter")
            if not isinstance(filters, dict) or not any(filters.get(key) for key in ("category", "polarity", "tag")):
                raise ValueError(f"{row_path}.status_filter needs category, polarity, or tag")
        if action_type == "track_inventory_objective":
            count = row.get("required_count", 1)
            if isinstance(count, bool) or not isinstance(count, int) or count < 1:
                raise ValueError(f"{row_path}.required_count must be a positive integer")
            policy = row.get("consumption_policy", "keep")
            if policy not in {"keep", "consume_on_turn_in", "consume_on_progress"}:
                raise ValueError(f"{row_path}.consumption_policy is invalid")
            item = db_session.get(Item, row.get("item_id"))
            if item and item.is_protected and policy != "keep":
                raise ValueError(f"{row_path} cannot consume a protected item")
        if action_type.startswith("activate_") and not str(row.get("variant_id") or "").strip():
            raise ValueError(f"{row_path}.variant_id is required")
        if action_type.startswith("activate_"):
            model_by_action = {
                "activate_location_variant": (Location, "location_id"),
                "activate_character_variant": (Character, "character_id"),
                "activate_item_variant": (Item, "item_id"),
            }
            model, ref_field = model_by_action[action_type]
            owner = db_session.get(model, row.get(ref_field))
            variant_ids = {str(variant.get("id")) for variant in (getattr(owner, "variants", None) or []) if isinstance(variant, dict)}
            if row.get("variant_id") not in variant_ids:
                raise ValueError(f"{row_path}.variant_id does not exist on the canonical target")

        row.update({
            "id": action_id,
            "target_scope": row.get("target_scope", "player"),
            "timing": row.get("timing", "after_completion"),
            "repeat_policy": row.get("repeat_policy", "inherit_owner"),
            "sort_order": sort_order,
            "runtime_support": row.get("runtime_support", "runtime_unverified"),
        })
        normalized.append(row)
    return sorted(normalized, key=lambda row: (row["sort_order"], row["id"]))


def validate_repeat_policy(value: Any, path: str, *, allow_unspecified: bool = False) -> str:
    allowed = REPEAT_POLICIES | ({"unspecified"} if allow_unspecified else set())
    normalized = str(value or "inherit_owner")
    if normalized not in allowed:
        raise ValueError(f"{path} is invalid")
    return normalized


def validate_outcome_transitions(
    db_session,
    value: Any,
    path: str = "outcome_transitions",
    *,
    allowed_triggers: set[str] | None = None,
) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{path} must be an array")
    allowed = allowed_triggers or TRANSITION_TRIGGERS
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    fallback_count = 0
    for index, raw in enumerate(value):
        row_path = f"{path}[{index}]"
        if not isinstance(raw, dict):
            raise ValueError(f"{row_path} must be an object")
        row = dict(raw)
        transition_id = str(row.get("id") or "").strip()
        if not transition_id or transition_id in seen_ids:
            raise ValueError(f"{row_path}.id must be non-empty and unique")
        seen_ids.add(transition_id)
        trigger = row.get("trigger")
        if trigger not in allowed:
            raise ValueError(f"{row_path}.trigger is invalid")
        target_event_id = _require_ref(db_session, Event, row.get("target_event_id"), f"{row_path}.target_event_id")
        requirement_id = str(row.get("requirement_id") or "").strip()
        source_ref_id = str(row.get("source_ref_id") or "").strip()
        if trigger == "condition" and not requirement_id:
            raise ValueError(f"{row_path}.requirement_id is required for a condition")
        if requirement_id:
            from backend.app.models.m_requirements import Requirement
            _require_ref(db_session, Requirement, requirement_id, f"{row_path}.requirement_id")
        if trigger == "dialogue_choice" and not source_ref_id:
            raise ValueError(f"{row_path}.source_ref_id is required for a dialogue choice")
        if trigger == "fallback":
            fallback_count += 1
            if requirement_id or source_ref_id:
                raise ValueError(f"{row_path} fallback must be unconditional")
        sort_order = row.get("sort_order", index)
        if isinstance(sort_order, bool) or not isinstance(sort_order, int) or sort_order < 0:
            raise ValueError(f"{row_path}.sort_order must be a non-negative integer")
        runtime_support = row.get("runtime_support", "runtime_unverified")
        if runtime_support not in RUNTIME_SUPPORT:
            raise ValueError(f"{row_path}.runtime_support must declare runtime verification")
        normalized.append({
            **row,
            "id": transition_id,
            "trigger": trigger,
            "target_event_id": target_event_id,
            "requirement_id": requirement_id or None,
            "source_ref_id": source_ref_id or None,
            "sort_order": sort_order,
            "runtime_support": runtime_support,
        })
    normalized.sort(key=lambda row: (row["sort_order"], row["id"]))
    if fallback_count > 1:
        raise ValueError(f"{path} may contain only one fallback")
    if normalized and any(row["trigger"] == "fallback" for row in normalized[:-1]):
        raise ValueError(f"{path} fallback must be ordered last")
    return normalized


def validate_reputation_ranks(value: Any, path: str = "reputation_ranks") -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{path} must be an array")
    result: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    previous_minimum: float | None = None
    for index, raw in enumerate(value):
        if not isinstance(raw, dict):
            raise ValueError(f"{path}[{index}] must be an object")
        name = str(raw.get("name") or "").strip()
        minimum = raw.get("minimum")
        if not name or name.lower() in seen_names:
            raise ValueError(f"{path}[{index}].name must be non-empty and unique")
        if isinstance(minimum, bool) or not isinstance(minimum, (int, float)):
            raise ValueError(f"{path}[{index}].minimum must be a number")
        if previous_minimum is not None and minimum <= previous_minimum:
            raise ValueError(f"{path} must be ordered by strictly increasing minimum")
        seen_names.add(name.lower())
        previous_minimum = minimum
        result.append({**raw, "name": name, "minimum": minimum, "sort_order": index})
    return result
