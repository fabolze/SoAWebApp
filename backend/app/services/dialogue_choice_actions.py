"""Canonical dialogue-choice identity and typed action validation.

Choices remain embedded in ``dialogue_nodes.choices`` for compatibility, but their
identity and action envelopes are now stable, typed, and exportable with the node.
"""

from copy import deepcopy
from uuid import NAMESPACE_URL, uuid5


ACTION_TARGETS = {
    "open_shop": "shop",
    "start_encounter": "encounter",
    "join_companion": "character",
    "discover_quest": "quest",
    "assign_quest": "quest",
    "reveal_map_marker": "location_poi",
}
ACTION_TIMINGS = {"immediate", "after_completion", "on_turn_in"}
REPEAT_POLICIES = {"inherit_owner", "one_shot", "repeatable"}
RUNTIME_SUPPORT = {"runtime_unverified", "runtime_verified"}
CONTINUATION_POLICIES = {
    "advance_to_next_node",
    "resume_source_dialogue",
    "end_source_dialogue",
    "return_to_origin",
}
ACTION_FIELDS = {
    "action_id", "action_type", "target_ref_type", "target_ref_id", "timing",
    "repeat_policy", "runtime_support", "continuation_policy", "sort_order",
}


def _stable_id(kind, owner_id, index):
    return f"{kind}-{uuid5(NAMESPACE_URL, f'soa:{kind}:{owner_id}:{index}') }"


def normalize_dialogue_choices(node_id, choices):
    """Return a compatibility-normalized copy without mutating the caller payload."""
    normalized = []
    for choice_index, raw_choice in enumerate(choices or []):
        if not isinstance(raw_choice, dict):
            normalized.append(raw_choice)
            continue
        choice = deepcopy(raw_choice)
        choice_id = choice.get("choice_id")
        if not isinstance(choice_id, str) or not choice_id.strip():
            choice_id = _stable_id("choice", node_id, choice_index)
        choice["choice_id"] = choice_id
        actions = choice.get("actions", [])
        if actions is None:
            actions = []
        if isinstance(actions, list):
            next_actions = []
            for action_index, raw_action in enumerate(actions):
                if not isinstance(raw_action, dict):
                    next_actions.append(raw_action)
                    continue
                action = deepcopy(raw_action)
                action_id = action.get("action_id")
                if not isinstance(action_id, str) or not action_id.strip():
                    action["action_id"] = _stable_id("action", choice_id, action_index)
                next_actions.append(action)
            choice["actions"] = next_actions
        normalized.append(choice)
    return normalized


def _target_models():
    from backend.app.models.m_characters import Character
    from backend.app.models.m_encounters import Encounter
    from backend.app.models.m_location_pois import LocationPoi
    from backend.app.models.m_quests import Quest
    from backend.app.models.m_shops import Shop

    return {
        "character": Character,
        "encounter": Encounter,
        "location_poi": LocationPoi,
        "quest": Quest,
        "shop": Shop,
    }


def validate_dialogue_action(db_session, action, path="action"):
    if not isinstance(action, dict):
        raise ValueError(f"{path} must be an object")
    unknown = set(action) - ACTION_FIELDS
    if unknown:
        raise ValueError(f"{path} contains unsupported fields: {', '.join(sorted(unknown))}")
    action_id = action.get("action_id")
    if not isinstance(action_id, str) or not action_id.strip():
        raise ValueError(f"{path}.action_id must be a non-empty stable id")
    action_type = action.get("action_type")
    if action_type not in ACTION_TARGETS:
        raise ValueError(f"{path}.action_type is unsupported: {action_type}")
    expected_target_type = ACTION_TARGETS[action_type]
    if action.get("target_ref_type") != expected_target_type:
        raise ValueError(f"{path}.target_ref_type must be {expected_target_type} for {action_type}")
    target_id = action.get("target_ref_id")
    if not isinstance(target_id, str) or not target_id.strip():
        raise ValueError(f"{path}.target_ref_id must be a non-empty canonical id")
    if not db_session.get(_target_models()[expected_target_type], target_id):
        raise ValueError(f"{path}.target_ref_id does not reference an existing {expected_target_type}: {target_id}")
    if action.get("timing") not in ACTION_TIMINGS:
        raise ValueError(f"{path}.timing must be one of {', '.join(sorted(ACTION_TIMINGS))}")
    if action.get("repeat_policy") not in REPEAT_POLICIES:
        raise ValueError(f"{path}.repeat_policy must be explicit")
    if action.get("runtime_support") not in RUNTIME_SUPPORT:
        raise ValueError(f"{path}.runtime_support must declare runtime verification")
    continuation = action.get("continuation_policy")
    if continuation not in CONTINUATION_POLICIES:
        raise ValueError(f"{path}.continuation_policy must be explicit")
    if action_type == "open_shop" and continuation != "resume_source_dialogue":
        raise ValueError(f"{path}.continuation_policy must be resume_source_dialogue for open_shop")
    sort_order = action.get("sort_order")
    if not isinstance(sort_order, int) or isinstance(sort_order, bool) or sort_order < 0:
        raise ValueError(f"{path}.sort_order must be a non-negative integer")


def validate_dialogue_choice_actions(db_session, choice, path="choice"):
    choice_id = choice.get("choice_id")
    if not isinstance(choice_id, str) or not choice_id.strip():
        raise ValueError(f"{path}.choice_id must be a non-empty stable id")
    actions = choice.get("actions", [])
    if not isinstance(actions, list):
        raise ValueError(f"{path}.actions must be an array")
    action_ids = []
    orders = []
    for index, action in enumerate(actions):
        validate_dialogue_action(db_session, action, f"{path}.actions[{index}]")
        action_ids.append(action["action_id"])
        orders.append(action["sort_order"])
    if len(action_ids) != len(set(action_ids)):
        raise ValueError(f"{path}.actions contains duplicate action_id values")
    if len(orders) != len(set(orders)):
        raise ValueError(f"{path}.actions contains duplicate sort_order values")

