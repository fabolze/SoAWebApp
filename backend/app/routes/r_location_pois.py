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
from backend.app.services.narrative_contracts import validate_narrative_actions, validate_repeat_policy


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
        _require_list(data.get("tags", []), "tags")
        _require_boolean(data.get("is_discoverable"), "is_discoverable")
        coordinates = data.get("coordinates", {})
        if coordinates is None:
            coordinates = {}
        if not isinstance(coordinates, dict):
            raise ValueError("coordinates must be an object")
        if coordinates:
            if not all(key in coordinates for key in ["x", "y"]):
                raise ValueError("coordinates must include x and y")
            _require_number(coordinates["x"], "coordinates.x")
            _require_number(coordinates["y"], "coordinates.y")

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
        poi.coordinates = coordinates
        poi.placement_notes = data.get("placement_notes")
        poi.is_discoverable = data.get("is_discoverable", True)
        poi.discovery_hint = data.get("discovery_hint")
        poi.interaction_actions = validate_narrative_actions(db_session, data.get("interaction_actions", []), "interaction_actions")
        poi.repeat_policy = validate_repeat_policy(data.get("repeat_policy"), "repeat_policy")
        poi.tags = data.get("tags", [])

    def serialize_item(self, poi: LocationPoi) -> Dict[str, Any]:
        return self.serialize_model(poi)


def _none_if_blank(value: Any) -> Any:
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


def _require_list(value: Any, field_name: str) -> None:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be an array")


def _require_boolean(value: Any, field_name: str) -> None:
    if value is not None and not isinstance(value, bool):
        raise ValueError(f"{field_name} must be a boolean")


def _require_number(value: Any, field_name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a number")


route = LocationPoiRoute()
bp = route.bp
