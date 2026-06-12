from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_character_narrative import (
    CharacterBeatType,
    CharacterRelationship,
    CharacterStoryBeat,
    CharacterStoryProfile,
)
from backend.app.models.m_characters import Character
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_flags import Flag
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_story_arcs import StoryArc
from backend.app.routes.base_route import BaseRoute


def _require_tags(data):
    tags = data.get("tags", [])
    if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
        raise ValueError("tags must be an array of strings")
    return tags


def _require_flags(db_session: Session, data: Dict[str, Any], key: str) -> List[str]:
    values = data.get(key, [])
    if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
        raise ValueError(f"{key} must be an array of flag IDs")
    normalized = list(dict.fromkeys(value.strip() for value in values))
    missing = [flag_id for flag_id in normalized if not db_session.get(Flag, flag_id)]
    if missing:
        raise ValueError(f"{key} references missing flags: {', '.join(missing)}")
    return normalized


class CharacterStoryProfileRoute(BaseRoute):
    def __init__(self):
        super().__init__(CharacterStoryProfile, "character_story_profiles", "/api/character-story-profiles")

    def get_required_fields(self) -> List[str]:
        return ["id", "character_id"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: CharacterStoryProfile, data: Dict[str, Any]) -> None:
        self.validate_relationships(db_session, data, {"character_id": Character})
        existing = db_session.query(CharacterStoryProfile).filter_by(character_id=data["character_id"]).first()
        if existing and existing.id != data["id"]:
            raise ValueError("character already has a story profile")
        item.character_id = data["character_id"]
        for key in [
            "public_face", "private_truth", "want", "need", "fear", "duty", "contradiction",
            "secret", "voice_notes", "arc_summary", "author_notes",
        ]:
            setattr(item, key, data.get(key))
        item.tags = _require_tags(data)


class CharacterRelationshipRoute(BaseRoute):
    def __init__(self):
        super().__init__(CharacterRelationship, "character_relationships", "/api/character-relationships")

    def get_required_fields(self) -> List[str]:
        return ["id", "from_character_id", "to_character_id", "relationship_type"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: CharacterRelationship, data: Dict[str, Any]) -> None:
        self.validate_relationships(db_session, data, {
            "from_character_id": Character, "to_character_id": Character,
        })
        if data["from_character_id"] == data["to_character_id"]:
            raise ValueError("character relationships cannot target the same character")
        existing = db_session.query(CharacterRelationship).filter_by(
            from_character_id=data["from_character_id"], to_character_id=data["to_character_id"]
        ).first()
        if existing and existing.id != data["id"]:
            raise ValueError("directed character relationship already exists")
        for key, minimum, maximum in [("trust", -100, 100), ("tension", 0, 100), ("influence", 0, 100)]:
            value = data.get(key, 0)
            if isinstance(value, bool) or not isinstance(value, int) or value < minimum or value > maximum:
                raise ValueError(f"{key} must be an integer between {minimum} and {maximum}")
            setattr(item, key, value)
        item.from_character_id = data["from_character_id"]
        item.to_character_id = data["to_character_id"]
        item.relationship_type = str(data["relationship_type"]).strip()
        if not item.relationship_type:
            raise ValueError("relationship_type is required")
        item.summary = data.get("summary")
        item.public_stance = data.get("public_stance")
        item.private_stance = data.get("private_stance")
        item.is_secret = bool(data.get("is_secret", False))
        item.tags = _require_tags(data)


class CharacterStoryBeatRoute(BaseRoute):
    SOURCE_MODELS = {
        "quest_id": Quest,
        "dialogue_id": Dialogue,
        "encounter_id": Encounter,
        "event_id": Event,
        "location_id": Location,
        "story_arc_id": StoryArc,
    }

    def __init__(self):
        super().__init__(CharacterStoryBeat, "character_story_beats", "/api/character-story-beats")

    def get_required_fields(self) -> List[str]:
        return ["id", "character_id", "title", "beat_type", "sort_order"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: CharacterStoryBeat, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {"beat_type": CharacterBeatType})
        self.validate_relationships(db_session, data, {"character_id": Character, **self.SOURCE_MODELS})
        populated = [key for key in self.SOURCE_MODELS if data.get(key)]
        if len(populated) > 1:
            raise ValueError("character story beat may reference at most one source")
        changes = data.get("relationship_changes", [])
        if not isinstance(changes, list):
            raise ValueError("relationship_changes must be an array")
        for index, change in enumerate(changes):
            if not isinstance(change, dict) or not change.get("relationship_id"):
                raise ValueError(f"relationship_changes[{index}].relationship_id is required")
            relationship = db_session.get(CharacterRelationship, change["relationship_id"])
            if not relationship or data["character_id"] not in {relationship.from_character_id, relationship.to_character_id}:
                raise ValueError(f"relationship_changes[{index}] must reference a relationship involving the character")
            for key, minimum, maximum in [("trust", -100, 100), ("tension", 0, 100), ("influence", 0, 100)]:
                if key in change and change[key] is not None:
                    value = change[key]
                    if isinstance(value, bool) or not isinstance(value, int) or value < minimum or value > maximum:
                        raise ValueError(f"relationship_changes[{index}].{key} is invalid")
        sort_order = data.get("sort_order", 0)
        if isinstance(sort_order, bool) or not isinstance(sort_order, int):
            raise ValueError("sort_order must be an integer")
        item.character_id = data["character_id"]
        item.title = data["title"]
        item.beat_type = data["beat_type"]
        item.sort_order = sort_order
        for key in self.SOURCE_MODELS:
            setattr(item, key, data.get(key) or None)
        for key in ["summary", "state_before", "state_after", "player_impact", "world_impact"]:
            setattr(item, key, data.get(key))
        item.required_flags = _require_flags(db_session, data, "required_flags")
        item.forbidden_flags = _require_flags(db_session, data, "forbidden_flags")
        item.expected_output_flags = _require_flags(db_session, data, "expected_output_flags")
        overlap = set(item.required_flags) & set(item.forbidden_flags)
        if overlap:
            raise ValueError(f"flags cannot be both required and forbidden: {', '.join(sorted(overlap))}")
        item.relationship_changes = changes
        item.tags = _require_tags(data)


story_profile_route = CharacterStoryProfileRoute()
relationship_route = CharacterRelationshipRoute()
story_beat_route = CharacterStoryBeatRoute()
story_profiles_bp = story_profile_route.bp
relationships_bp = relationship_route.bp
story_beats_bp = story_beat_route.bp
