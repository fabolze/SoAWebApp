from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_locations import Location, Biome
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class LocationRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Location,
            blueprint_name='locations',
            route_prefix='/api/locations'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["location_id", "name", "biome"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["location_id"]
        
    def process_input_data(self, db_session: Session, location: Location, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "biome": Biome
        })
        
        # Required fields
        location.name = data["name"]
        location.biome = data["biome"]  # Already converted to enum
        
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
        location.connected_locations = data.get("connected_locations", [])
        location.tags = data.get("tags", [])
        
    def serialize_item(self, location: Location) -> Dict[str, Any]:
        return {
            "id": location.id,
            "name": location.name,
            "description": location.description,
            "biome": location.biome.value if location.biome else None,
            "region": location.region,
            "level_range": location.level_range,
            "coordinates": location.coordinates,
            "image_path": location.image_path,
            "encounters": location.encounters,
            "is_safe_zone": location.is_safe_zone,
            "is_fast_travel_point": location.is_fast_travel_point,
            "has_respawn_point": location.has_respawn_point,
            "connected_locations": location.connected_locations,
            "tags": location.tags
        }

# Create the route instance
bp = LocationRoute().bp
