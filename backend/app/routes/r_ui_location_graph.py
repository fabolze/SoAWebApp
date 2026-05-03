from flask import Blueprint, jsonify

from backend.app.db.init_db import get_db_session
from backend.app.models.m_location_routes import LocationRoute
from backend.app.models.m_locations import Location


bp = Blueprint("ui_location_graph", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _serialize_location(location: Location, route_count: int):
    return {
        "id": location.id,
        "slug": location.slug,
        "name": location.name,
        "description": location.description,
        "biome": _enum_value(location.biome),
        "biome_modifier": _enum_value(location.biome_modifier),
        "region": location.region,
        "level_range": location.level_range or {},
        "coordinates": location.coordinates or {},
        "image_path": location.image_path,
        "encounters": location.encounters or [],
        "is_safe_zone": bool(location.is_safe_zone),
        "is_fast_travel_point": bool(location.is_fast_travel_point),
        "has_respawn_point": bool(location.has_respawn_point),
        "tags": location.tags or [],
        "route_count": route_count,
    }


def _serialize_route(route: LocationRoute):
    return {
        "id": route.id,
        "slug": route.slug,
        "from_location_id": route.from_location_id,
        "to_location_id": route.to_location_id,
        "bidirectional": bool(route.bidirectional),
        "route_type": _enum_value(route.route_type),
        "travel_cost": route.travel_cost or 0,
        "travel_time": route.travel_time or 0,
        "requirements_id": route.requirements_id,
        "is_hidden": bool(route.is_hidden),
        "is_fast_travel_enabled": bool(route.is_fast_travel_enabled),
        "description": route.description,
        "tags": route.tags or [],
    }


@bp.route("/api/ui/location_graph", methods=["GET"])
def get_location_graph():
    db_session = get_db_session()
    try:
        locations = db_session.query(Location).all()
        routes = db_session.query(LocationRoute).all()
        location_ids = {location.id for location in locations}
        route_counts = {location.id: 0 for location in locations}
        warnings = []
        serialized_routes = []

        for route in routes:
            missing = []
            if route.from_location_id not in location_ids:
                missing.append(f"from_location_id {route.from_location_id}")
            if route.to_location_id not in location_ids:
                missing.append(f"to_location_id {route.to_location_id}")
            if missing:
                warnings.append({
                    "route_id": route.id,
                    "message": f"Route references missing location(s): {', '.join(missing)}",
                })
            else:
                route_counts[route.from_location_id] = route_counts.get(route.from_location_id, 0) + 1
                route_counts[route.to_location_id] = route_counts.get(route.to_location_id, 0) + 1
            serialized_routes.append(_serialize_route(route))

        return jsonify({
            "locations": [_serialize_location(location, route_counts.get(location.id, 0)) for location in locations],
            "routes": serialized_routes,
            "warnings": warnings,
        })
    finally:
        db_session.close()
