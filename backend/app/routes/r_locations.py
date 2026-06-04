from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_locations import Biome, BiomeInheritance, BiomeModifier, Location, LocationType, PlaceKind
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
        if level_range:
            if not all(k in level_range for k in ["min", "max"]):
                raise ValueError("Invalid level_range: must include min and max")
            if level_range["min"] > level_range["max"]:
                raise ValueError("Invalid level_range: min cannot be greater than max")
        location.level_range = level_range
        
        # Validate coordinates
        coordinates = data.get("coordinates", {})
        if coordinates:
            if not all(k in coordinates for k in ["x", "y"]):
                raise ValueError("Invalid coordinates: must include x and y")
        location.coordinates = coordinates
        
        # JSON fields
        location.encounters = data.get("encounters", [])
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
bp = LocationRoute().bp


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


