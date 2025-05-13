from flask import Blueprint, request, jsonify
from backend.app.models.m_locations import Location
from backend.app.db.init_db import get_db_session

bp = Blueprint('locations', __name__)

@bp.route("/api/locations", methods=["POST"])
def upsert_location():
    db_session = get_db_session()
    data = request.json
    location_id = data.get("id")
    
    location = db_session.get(Location, location_id) or Location(id=location_id)
    location.name = data.get("name")
    location.description = data.get("description")
    location.icon_path = data.get("icon_path")
    
    db_session.add(location)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/locations", methods=["GET"])
def list_locations():
    db_session = get_db_session()
    locations = db_session.query(Location).all()
    return jsonify([{"id": l.id, "name": l.name} for l in locations])
