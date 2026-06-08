from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_location_routes import LocationRoute, LocationRouteType
from backend.app.models.m_locations import Location
from backend.app.models.m_requirements import Requirement
from backend.app.db.init_db import get_db_session
from backend.app.routes.base_route import BaseRoute


class LocationRouteRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=LocationRoute,
            blueprint_name="location_routes",
            route_prefix="/api/location_routes",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "from_location_id", "to_location_id", "route_type"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, route: LocationRoute, data: Dict[str, Any]) -> None:
        data = dict(data)
        data["requirements_id"] = _none_if_blank(data.get("requirements_id"))
        _require_list(data.get("tags", []), "tags")
        for field in ["bidirectional", "is_hidden", "is_fast_travel_enabled"]:
            _require_boolean(data.get(field), field)
        self.validate_enums(data, {"route_type": LocationRouteType})
        self.validate_relationships(db_session, data, {
            "from_location_id": Location,
            "to_location_id": Location,
            "requirements_id": Requirement,
        })

        from_location_id = data["from_location_id"]
        to_location_id = data["to_location_id"]
        if from_location_id == to_location_id:
            raise ValueError("from_location_id and to_location_id must be different")

        travel_cost = _non_negative_number(data.get("travel_cost", 0), "travel_cost")
        travel_time = _non_negative_number(data.get("travel_time", 0), "travel_time")

        route.slug = data["slug"]
        route.from_location_id = from_location_id
        route.to_location_id = to_location_id
        route.route_type = data["route_type"]
        route.bidirectional = data.get("bidirectional", True)
        route.travel_cost = travel_cost
        route.travel_time = travel_time
        route.requirements_id = data.get("requirements_id")
        route.is_hidden = data.get("is_hidden", False)
        route.is_fast_travel_enabled = data.get("is_fast_travel_enabled", False)
        route.description = data.get("description")
        route.tags = data.get("tags", [])

    def serialize_item(self, route: LocationRoute) -> Dict[str, Any]:
        return self.serialize_model(route)


def _non_negative_number(value: Any, field_name: str) -> float:
    if value in (None, ""):
        return 0
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a number")
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc
    if numeric < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return numeric


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


route = LocationRouteRoute()
bp = route.bp
