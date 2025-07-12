from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_locations import Location, Biome
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
        serialized = self.serialize_model(location)
        serialized['location_id'] = serialized.pop('id', None)  # Ensure location_id is used instead of id
        return serialized
        
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
                            self.model.tags.any(lambda t: t.ilike(f"%{tag}%"))
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = LocationRoute().bp
