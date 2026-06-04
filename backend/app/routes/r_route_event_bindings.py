from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_events import Event
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_route_event_bindings import RouteEventBinding, RouteEventTriggerMode
from backend.app.routes.base_route import BaseRoute


class RouteEventBindingRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=RouteEventBinding,
            blueprint_name="route_event_bindings",
            route_prefix="/api/route_event_bindings",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "route_id", "event_id", "trigger_mode"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, binding: RouteEventBinding, data: Dict[str, Any]) -> None:
        data = dict(data)
        data["requirements_id"] = _none_if_blank(data.get("requirements_id"))

        self.validate_enums(data, {"trigger_mode": RouteEventTriggerMode})
        self.validate_relationships(db_session, data, {
            "route_id": LocationRoute,
            "event_id": Event,
            "requirements_id": Requirement,
        })

        chance = _bounded_number(data.get("chance", 100), "chance", 0, 100)
        cooldown = _non_negative_number(data.get("cooldown", 0), "cooldown")
        priority = _integer_or_default(data.get("priority", 0), "priority")

        binding.slug = data["slug"]
        binding.route_id = data["route_id"]
        binding.event_id = data["event_id"]
        binding.trigger_mode = data["trigger_mode"]
        binding.chance = chance
        binding.requirements_id = data.get("requirements_id")
        binding.priority = priority
        binding.cooldown = cooldown
        binding.description = data.get("description")
        binding.tags = data.get("tags", [])

    def serialize_item(self, binding: RouteEventBinding) -> Dict[str, Any]:
        return self.serialize_model(binding)


def _bounded_number(value: Any, field_name: str, minimum: float, maximum: float) -> float:
    numeric = _non_negative_number(value, field_name)
    if numeric < minimum or numeric > maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return numeric


def _non_negative_number(value: Any, field_name: str) -> float:
    if value in (None, ""):
        return 0
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc
    if numeric < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return numeric


def _integer_or_default(value: Any, field_name: str) -> int:
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc


def _none_if_blank(value: Any) -> Any:
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


bp = RouteEventBindingRoute().bp
