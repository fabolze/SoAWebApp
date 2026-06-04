from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_items import Item
from backend.app.models.m_location_pois import LocationPoi, PoiType
from backend.app.models.m_locations import Location
from backend.app.models.m_requirements import Requirement
from backend.app.routes.base_route import BaseRoute


class LocationPoiRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=LocationPoi,
            blueprint_name="location_pois",
            route_prefix="/api/location_pois",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "location_id", "name", "poi_type"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, poi: LocationPoi, data: Dict[str, Any]) -> None:
        data = dict(data)
        for field in ["requirements_id", "event_id", "dialogue_id", "encounter_id", "item_id"]:
            data[field] = _none_if_blank(data.get(field))

        self.validate_enums(data, {"poi_type": PoiType})
        self.validate_relationships(db_session, data, {
            "location_id": Location,
            "requirements_id": Requirement,
            "event_id": Event,
            "dialogue_id": Dialogue,
            "encounter_id": Encounter,
            "item_id": Item,
        })

        poi.slug = data["slug"]
        poi.location_id = data["location_id"]
        poi.name = data["name"]
        poi.description = data.get("description")
        poi.poi_type = data["poi_type"]
        poi.requirements_id = data.get("requirements_id")
        poi.event_id = data.get("event_id")
        poi.dialogue_id = data.get("dialogue_id")
        poi.encounter_id = data.get("encounter_id")
        poi.item_id = data.get("item_id")
        poi.coordinates = data.get("coordinates", {})
        poi.placement_notes = data.get("placement_notes")
        poi.is_discoverable = data.get("is_discoverable", True)
        poi.discovery_hint = data.get("discovery_hint")
        poi.tags = data.get("tags", [])

    def serialize_item(self, poi: LocationPoi) -> Dict[str, Any]:
        return self.serialize_model(poi)


def _none_if_blank(value: Any) -> Any:
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


bp = LocationPoiRoute().bp
