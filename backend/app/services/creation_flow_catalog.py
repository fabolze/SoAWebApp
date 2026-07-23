from backend.app.models.m_adventure_narrative import AdventureBeat
from backend.app.models.m_characters import Character
from backend.app.models.m_currencies import Currency
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_effects import Effect
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_items import Item
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_locations import Location
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shops import Shop
from backend.app.models.m_stats import Stat
from backend.app.models.m_statuses import Status
from backend.app.models.m_story_arcs import StoryArc
from backend.app.models.m_timelines import Timeline
from backend.app.services.bundle_operations import compact_snapshot


CREATION_FLOW_FORMAT = "SOA-CREATION-FLOW/1"
COMPILER_VERSION = "creation-flow/4.0"

REFERENCE_MODELS = {
    "dialogue": ("dialogues", Dialogue),
    "dialogue_node": ("dialogue_nodes", DialogueNode),
    "encounter": ("encounters", Encounter),
    "quest": ("quests", Quest),
    "requirement": ("requirements", Requirement),
    "event": ("events", Event),
    "shop": ("shops", Shop),
    "location": ("locations", Location),
    "location_poi": ("location_pois", LocationPoi),
    "location_route": ("location_routes", LocationRoute),
    "timeline": ("timelines", Timeline),
    "story_arc": ("story_arcs", StoryArc),
    "story_beat": ("adventure_beats", AdventureBeat),
    "item": ("items", Item),
    "character": ("characters", Character),
    "faction": ("factions", Faction),
    "lore_entry": ("lore_entries", LoreEntry),
    "effect": ("effects", Effect),
    "status": ("statuses", Status),
    "currency": ("currencies", Currency),
    "stat": ("stats", Stat),
}

COMPILABLE_STEP_KINDS = [
    "dialogue", "encounter", "item_reward", "numeric_reward", "lore_reveal",
    "teleport", "scripted_moment", "make_available", "persistent_fact", "world_state",
    "open_shop", "join_companion",
    "quest_assignment", "quest_turn_in", "inventory_objective",
    "activate_location_variant", "activate_character_variant", "activate_item_variant", "gameplay_effect",
]
STORY_ONLY_STEP_KINDS = ["story_placement", "note"]
BLOCKED_STEP_KINDS = [
    "unshaped", "custom",
]


def _entry(item):
    data = compact_snapshot(item) or {}
    data["label"] = (
        data.get("name") or data.get("title") or data.get("slug") or data.get("id") or ""
    )
    return data


def creation_flow_catalog(db_session):
    references = {
        kind: {
            "schema_name": schema_name,
            "entries": [_entry(item) for item in db_session.query(model).order_by(model.id).all()],
        }
        for kind, (schema_name, model) in REFERENCE_MODELS.items()
    }
    dialogue_choices = []
    for node in db_session.query(DialogueNode).order_by(DialogueNode.id).all():
        for index, choice in enumerate(node.choices or []):
            if not isinstance(choice, dict):
                continue
            dialogue_choices.append({
                "id": choice.get("id") or f"legacy-unidentified:{node.id}:{index}",
                "node_id": node.id,
                "dialogue_id": node.dialogue_id,
                "index": index,
                "label": choice.get("choice_text") or choice.get("text") or f"Choice {index + 1}",
                "next_node_id": choice.get("next_node_id"),
                "actions": choice.get("actions") or [],
            })
    references["dialogue_choice"] = {
        "schema_name": "dialogue_nodes.choices",
        "entries": dialogue_choices,
    }
    return {
        "format": CREATION_FLOW_FORMAT,
        "compiler_version": COMPILER_VERSION,
        "references": references,
        "capabilities": {
            "compilable_step_kinds": COMPILABLE_STEP_KINDS,
            "story_only_step_kinds": STORY_ONLY_STEP_KINDS,
            "blocked_step_kinds": BLOCKED_STEP_KINDS,
            "transition_triggers": {
                "compilable": ["complete", "dialogue_choice", "victory", "interaction_closed", "condition", "fallback"],
                "blocked": [],
            },
            "runtime_unverified_step_kinds": [
                "open_shop", "join_companion", "quest_assignment", "quest_turn_in",
                "inventory_objective", "activate_location_variant", "activate_character_variant",
                "activate_item_variant", "gameplay_effect",
            ],
            "dialogue_choice_actions": ["open_shop", "start_encounter", "join_companion"],
            "requirement_attachment_targets": [
                "ability", "dialogue_node", "dialogue", "encounter", "event", "item",
                "location_poi", "location_route", "quest", "shop",
            ],
            "guarantees": [
                "backend_authoritative_validation",
                "deterministic_artifact_ids",
                "transactional_preview_rollback",
                "atomic_bundle_commit",
                "stale_preview_rejection",
                "recoverable_provenance_manifest",
            ],
        },
    }
