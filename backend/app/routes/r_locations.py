from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_locations import Biome, BiomeInheritance, BiomeModifier, Location, LocationType, PlaceKind
from backend.app.models.m_encounters import Encounter
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class LocationRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Location,
            blueprint_name='locations',
            route_prefix='/api/locations'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, location: Location, data: Dict[str, Any]) -> None:
        data = dict(data)
        if data.get("biome") == "":
            data["biome"] = None
        if data.get("biome_modifier") == "":
            data["biome_modifier"] = None
        if data.get("location_type") == "":
            data["location_type"] = LocationType.Zone
        if data.get("place_kind") == "":
            data["place_kind"] = None
        if data.get("biome_inheritance") == "":
            data["biome_inheritance"] = None
        data["parent_location_id"] = _none_if_blank(data.get("parent_location_id"))
        for field in ["environment_tags", "encounters", "tags"]:
            _require_list(data.get(field, []), field)
        for field in ["is_playable_space", "is_world_map_node", "is_safe_zone", "is_fast_travel_point", "has_respawn_point"]:
            _require_boolean(data.get(field), field)

        # Validate enums
        self.validate_enums(data, {
            "biome": Biome,
            "biome_modifier": BiomeModifier,
            "location_type": LocationType,
            "place_kind": PlaceKind,
            "biome_inheritance": BiomeInheritance,
        })
        self.validate_relationships(db_session, data, {"parent_location_id": Location})
        
        # Required fields
        location.slug = data["slug"]
        location.name = data["name"]
        location.biome = data.get("biome")
        location.biome_modifier = data.get("biome_modifier")
        location.place_kind = data.get("place_kind")
        location.environment_tags = data.get("environment_tags", [])
        location.biome_inheritance = data.get("biome_inheritance")
        parent_location_id = data.get("parent_location_id")
        if parent_location_id == location.id:
            raise ValueError("parent_location_id cannot reference the same location")
        ancestor_id = parent_location_id
        visited = {location.id}
        while ancestor_id:
            if ancestor_id in visited:
                raise ValueError("parent_location_id would create a location hierarchy cycle")
            visited.add(ancestor_id)
            ancestor = db_session.get(Location, ancestor_id)
            ancestor_id = ancestor.parent_location_id if ancestor else None
        location.parent_location_id = parent_location_id
        location.location_type = data.get("location_type", LocationType.Zone)
        location.sort_order = _integer_or_default(data.get("sort_order", 0), "sort_order")
        location.is_playable_space = data.get("is_playable_space") if data.get("is_playable_space") is not None else True
        location.is_world_map_node = data.get("is_world_map_node") if data.get("is_world_map_node") is not None else True
        
        # Optional fields
        location.description = data.get("description")
        location.region = data.get("region")
        location.image_path = data.get("image_path")
        
        # Boolean flags
        location.is_safe_zone = data.get("is_safe_zone", False)
        location.is_fast_travel_point = data.get("is_fast_travel_point", False)
        location.has_respawn_point = data.get("has_respawn_point", False)
        
        # Validate level range
        level_range = data.get("level_range", {})
        if level_range is None:
            level_range = {}
        if not isinstance(level_range, dict):
            raise ValueError("level_range must be an object")
        if level_range:
            if not all(k in level_range for k in ["min", "max"]):
                raise ValueError("Invalid level_range: must include min and max")
            _require_number(level_range["min"], "level_range.min")
            _require_number(level_range["max"], "level_range.max")
            if level_range["min"] > level_range["max"]:
                raise ValueError("Invalid level_range: min cannot be greater than max")
        location.level_range = level_range
        
        # Validate coordinates
        coordinates = data.get("coordinates", {})
        if coordinates is None:
            coordinates = {}
        if not isinstance(coordinates, dict):
            raise ValueError("coordinates must be an object")
        if coordinates:
            if not all(k in coordinates for k in ["x", "y"]):
                raise ValueError("Invalid coordinates: must include x and y")
            _require_number(coordinates["x"], "coordinates.x")
            _require_number(coordinates["y"], "coordinates.y")
        location.coordinates = coordinates
        
        # JSON fields
        encounters = data.get("encounters", [])
        for encounter_id in encounters:
            if not db_session.get(Encounter, encounter_id):
                raise ValueError(f"Invalid encounter_id in encounters: {encounter_id}")
        location.encounters = encounters
        location.tags = data.get("tags", [])
        
    def serialize_item(self, location: Location) -> Dict[str, Any]:
        return self.serialize_model(location)
        
    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%")) |
                    (self.model.id.ilike(f"%{search}%"))
                )
            if tags:
                query = query.filter(self.model.tags != None)
                for tag in tags:
                    tag = tag.strip()
                    if tag:
                        query = query.filter(
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
route = LocationRoute()
bp = route.bp


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


def _require_list(value: Any, field_name: str) -> None:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be an array")


def _require_boolean(value: Any, field_name: str) -> None:
    if value is not None and not isinstance(value, bool):
        raise ValueError(f"{field_name} must be a boolean")


def _require_number(value: Any, field_name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a number")


