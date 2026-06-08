from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_encounters import Encounter
from backend.app.models.m_location_encounter_tables import LocationEncounterTable
from backend.app.models.m_locations import Location
from backend.app.models.m_requirements import Requirement
from backend.app.routes.base_route import BaseRoute


class LocationEncounterTableRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=LocationEncounterTable,
            blueprint_name="location_encounter_tables",
            route_prefix="/api/location_encounter_tables",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "location_id", "name"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, table: LocationEncounterTable, data: Dict[str, Any]) -> None:
        data = dict(data)
        data["requirements_id"] = _none_if_blank(data.get("requirements_id"))
        _require_list(data.get("environmental_modifiers", []), "environmental_modifiers")
        _require_list(data.get("tags", []), "tags")

        self.validate_relationships(db_session, data, {
            "location_id": Location,
            "requirements_id": Requirement,
        })

        entries = data.get("encounter_entries", [])
        if entries is None:
            entries = []
        if not isinstance(entries, list):
            raise ValueError("encounter_entries must be a list")
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise ValueError(f"encounter_entries[{index}] must be an object")
            encounter_id = entry.get("encounter_id")
            if not encounter_id:
                raise ValueError(f"encounter_entries[{index}] must include encounter_id")
            if not db_session.get(Encounter, encounter_id):
                raise ValueError(f"Invalid encounter_entries[{index}].encounter_id: {encounter_id}")
            weight = _non_negative_number(entry.get("weight", 1), f"encounter_entries[{index}].weight")
            min_count = _non_negative_int(entry.get("min_count", 1), f"encounter_entries[{index}].min_count")
            max_count = _non_negative_int(entry.get("max_count", min_count), f"encounter_entries[{index}].max_count")
            if max_count < min_count:
                raise ValueError(f"encounter_entries[{index}].max_count cannot be less than min_count")
            entry["weight"] = weight
            entry["min_count"] = min_count
            entry["max_count"] = max_count

        table.slug = data["slug"]
        table.location_id = data["location_id"]
        table.name = data["name"]
        table.description = data.get("description")
        table.spawn_rules = data.get("spawn_rules")
        table.environmental_modifiers = data.get("environmental_modifiers", [])
        table.requirements_id = data.get("requirements_id")
        table.encounter_entries = entries
        table.tags = data.get("tags", [])

    def serialize_item(self, table: LocationEncounterTable) -> Dict[str, Any]:
        return self.serialize_model(table)


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


def _non_negative_int(value: Any, field_name: str) -> int:
    numeric = _non_negative_number(value, field_name)
    if not numeric.is_integer():
        raise ValueError(f"{field_name} must be an integer")
    return int(numeric)


def _none_if_blank(value: Any) -> Any:
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


def _require_list(value: Any, field_name: str) -> None:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be an array")


route = LocationEncounterTableRoute()
bp = route.bp
