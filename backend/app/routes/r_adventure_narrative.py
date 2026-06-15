from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_adventure_narrative import (
    AdventureBeat,
    AdventureBeatLink,
    AdventureBeatLinkRole,
    AdventureBeatLinkTargetType,
    AdventureBeatType,
)
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
from backend.app.routes.base_route import BaseRoute


def _require_string_array(data: Dict[str, Any], key: str) -> List[str]:
    values = data.get(key, [])
    if values is None:
        return []
    if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
        raise ValueError(f"{key} must be an array of strings")
    return list(dict.fromkeys(value.strip() for value in values))


def _require_flags(db_session: Session, data: Dict[str, Any], key: str) -> List[str]:
    values = _require_string_array(data, key)
    missing = [flag_id for flag_id in values if not db_session.get(Flag, flag_id)]
    if missing:
        raise ValueError(f"{key} references missing flags: {', '.join(missing)}")
    return values


def _require_sort_order(data: Dict[str, Any]) -> int:
    value = data.get("sort_order", 0)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("sort_order must be an integer")
    return value


class AdventureBeatRoute(BaseRoute):
    def __init__(self):
        super().__init__(AdventureBeat, "adventure_beats", "/api/adventure-beats")

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "title", "beat_type", "sort_order"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: AdventureBeat, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {"beat_type": AdventureBeatType})
        self.validate_relationships(db_session, data, {"timeline_id": Timeline, "story_arc_id": StoryArc})
        story_arc = db_session.get(StoryArc, data.get("story_arc_id")) if data.get("story_arc_id") else None
        timeline_id = data.get("timeline_id") or (story_arc.timeline_id if story_arc else None)
        if story_arc and data.get("timeline_id") and story_arc.timeline_id != data["timeline_id"]:
            raise ValueError("timeline_id must match story_arc_id.timeline_id")

        item.slug = str(data["slug"]).strip()
        item.title = str(data["title"]).strip()
        if not item.slug or not item.title:
            raise ValueError("slug and title are required")
        item.summary = data.get("summary")
        item.beat_type = data["beat_type"]
        item.timeline_id = timeline_id
        item.story_arc_id = data.get("story_arc_id") or None
        item.sort_order = _require_sort_order(data)
        item.intent = data.get("intent")
        item.required_flags = _require_flags(db_session, data, "required_flags")
        item.forbidden_flags = _require_flags(db_session, data, "forbidden_flags")
        item.expected_output_flags = _require_flags(db_session, data, "expected_output_flags")
        overlap = set(item.required_flags) & set(item.forbidden_flags)
        if overlap:
            raise ValueError(f"flags cannot be both required and forbidden: {', '.join(sorted(overlap))}")
        item.tags = _require_string_array(data, "tags")


class AdventureBeatLinkRoute(BaseRoute):
    TARGET_MODELS = {
        AdventureBeatLinkTargetType.Location: Location,
        AdventureBeatLinkTargetType.Character: Character,
        AdventureBeatLinkTargetType.Quest: Quest,
        AdventureBeatLinkTargetType.Event: Event,
        AdventureBeatLinkTargetType.Dialogue: Dialogue,
        AdventureBeatLinkTargetType.Encounter: Encounter,
        AdventureBeatLinkTargetType.LoreEntry: LoreEntry,
        AdventureBeatLinkTargetType.Item: Item,
        AdventureBeatLinkTargetType.Faction: Faction,
        AdventureBeatLinkTargetType.StoryArc: StoryArc,
    }

    def __init__(self):
        super().__init__(AdventureBeatLink, "adventure_beat_links", "/api/adventure-beat-links")

    def get_required_fields(self) -> List[str]:
        return ["id", "adventure_beat_id", "target_type", "target_id", "role", "sort_order"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: AdventureBeatLink, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {
            "target_type": AdventureBeatLinkTargetType,
            "role": AdventureBeatLinkRole,
        })
        self.validate_relationships(db_session, data, {"adventure_beat_id": AdventureBeat})
        target_id = str(data["target_id"]).strip()
        target_model = self.TARGET_MODELS[data["target_type"]]
        if not target_id or not db_session.get(target_model, target_id):
            raise ValueError(f"target_id references missing {data['target_type'].value}: {target_id or '<empty>'}")
        duplicate = db_session.query(AdventureBeatLink).filter_by(
            adventure_beat_id=data["adventure_beat_id"],
            target_type=data["target_type"],
            target_id=target_id,
            role=data["role"],
        ).first()
        if duplicate and duplicate.id != data["id"]:
            raise ValueError("adventure beat already has this target and role")

        item.adventure_beat_id = data["adventure_beat_id"]
        item.target_type = data["target_type"]
        item.target_id = target_id
        item.role = data["role"]
        item.sort_order = _require_sort_order(data)
        item.notes = data.get("notes")
        item.tags = _require_string_array(data, "tags")


adventure_beat_route = AdventureBeatRoute()
adventure_beat_link_route = AdventureBeatLinkRoute()
adventure_beats_bp = adventure_beat_route.bp
adventure_beat_links_bp = adventure_beat_link_route.bp
