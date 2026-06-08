from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_location_creative_briefs import LocationCreativeBrief
from backend.app.models.m_locations import Location
from backend.app.routes.base_route import BaseRoute


class LocationCreativeBriefRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=LocationCreativeBrief,
            blueprint_name="location_creative_briefs",
            route_prefix="/api/location_creative_briefs",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "location_id"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, brief: LocationCreativeBrief, data: Dict[str, Any]) -> None:
        data = dict(data)
        for field in ["concept_refs", "landmarks", "tags"]:
            _require_list(data.get(field, []), field)

        self.validate_relationships(db_session, data, {"location_id": Location})

        brief.slug = data["slug"]
        brief.location_id = data["location_id"]
        brief.mood = data.get("mood")
        brief.visual_ideas = data.get("visual_ideas")
        brief.concept_refs = data.get("concept_refs", [])
        brief.ambience_ideas = data.get("ambience_ideas")
        brief.music_state = data.get("music_state")
        brief.vfx_ideas = data.get("vfx_ideas")
        brief.asset_ideas = data.get("asset_ideas")
        brief.landmarks = data.get("landmarks", [])
        brief.story_notes = data.get("story_notes")
        brief.tags = data.get("tags", [])

    def serialize_item(self, brief: LocationCreativeBrief) -> Dict[str, Any]:
        return self.serialize_model(brief)


def _require_list(value: Any, field_name: str) -> None:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be an array")


route = LocationCreativeBriefRoute()
bp = route.bp
