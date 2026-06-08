from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_location_routes import LocationRouteType
from backend.app.models.m_locations import Biome, PlaceKind
from backend.app.models.m_travel_tuning import TravelTuning
from backend.app.routes.base_route import BaseRoute


class TravelTuningRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=TravelTuning,
            blueprint_name="travel_tuning",
            route_prefix="/api/travel_tuning",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, tuning: TravelTuning, data: Dict[str, Any]) -> None:
        data = dict(data)
        for field in ["route_type", "place_kind", "biome"]:
            data[field] = _none_if_blank(data.get(field))
        _require_list(data.get("tags", []), "tags")

        self.validate_enums(data, {"route_type": LocationRouteType, "place_kind": PlaceKind, "biome": Biome})

        tuning.slug = data["slug"]
        tuning.name = data["name"]
        tuning.description = data.get("description")
        tuning.route_type = data.get("route_type")
        tuning.place_kind = data.get("place_kind")
        tuning.biome = data.get("biome")
        tuning.encounter_chance = _bounded_number(data.get("encounter_chance", 0), "encounter_chance", 0, 100)
        tuning.travel_time_multiplier = _non_negative_number(data.get("travel_time_multiplier", 1), "travel_time_multiplier")
        tuning.travel_cost_multiplier = _non_negative_number(data.get("travel_cost_multiplier", 1), "travel_cost_multiplier")
        tuning.safe_zone_multiplier = _non_negative_number(data.get("safe_zone_multiplier", 1), "safe_zone_multiplier")
        tuning.fatigue_cost = _non_negative_number(data.get("fatigue_cost", 0), "fatigue_cost")
        tuning.risk_score = _non_negative_number(data.get("risk_score", 0), "risk_score")
        tuning.tags = data.get("tags", [])

    def serialize_item(self, tuning: TravelTuning) -> Dict[str, Any]:
        return self.serialize_model(tuning)


def _bounded_number(value: Any, field_name: str, minimum: float, maximum: float) -> float:
    numeric = _non_negative_number(value, field_name)
    if numeric < minimum or numeric > maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")
    return numeric


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


route = TravelTuningRoute()
bp = route.bp
