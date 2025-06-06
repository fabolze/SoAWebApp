# backend/app/routes/base_route.py
from flask import Blueprint, request, jsonify, abort, make_response
from typing import Any, Dict, List, Optional
from backend.app.db.init_db import get_db_session
from backend.app.models.base import Base
from sqlalchemy.orm import Session
import os
import json

class BaseRoute:
    """Base class for route handlers that implements basic CRUD operations."""
    def __init__(self, model, blueprint_name: str, route_prefix: str):
        """Initialize the route handler.

        Args:
            model: The SQLAlchemy model class
            blueprint_name: Name for the Flask blueprint
            route_prefix: URL prefix for all routes (e.g., "/api/items")
        """
        self.model = model
        self.bp = Blueprint(blueprint_name, __name__)
        self.route_prefix = route_prefix
        self._register_routes()
    
    def _register_routes(self) -> None:
        """Register all CRUD routes."""
        # List all
        self.bp.route(self.route_prefix, methods=["GET"])(self.get_all)
        # Get one by ID
        self.bp.route(f"{self.route_prefix}/<item_id>", methods=["GET"])(self.get_by_id)
        # Create/Update
        self.bp.route(self.route_prefix, methods=["POST"])(self.upsert)
        # Delete
        self.bp.route(f"{self.route_prefix}/<item_id>", methods=["DELETE"])(self.delete)
    
    def get_schema_required_fields(self, schema_name: str = None) -> List[str]:
        """Load the required fields from the JSON schema file for this resource."""
        import glob
        # Try both singular (model name) and plural (blueprint name) schema file names
        schema_names = []
        if schema_name:
            schema_names.append(schema_name)
        # Try to use the blueprint name if available
        if hasattr(self, 'bp') and hasattr(self.bp, 'name'):
            if self.bp.name not in schema_names:
                schema_names.append(self.bp.name)
        # Fallback: try both singular and plural
        if hasattr(self, 'model'):
            model_name = self.model.__name__.replace('Model', '').lower()
            if model_name not in schema_names:
                schema_names.append(model_name)
            plural_name = model_name + 's'
            if plural_name not in schema_names:
                schema_names.append(plural_name)
        schemas_dir = os.path.join(os.path.dirname(__file__), '../schemas')
        for name in schema_names:
            schema_path = os.path.join(schemas_dir, f'{name}.json')
            if os.path.exists(schema_path):
                try:
                    with open(schema_path, 'r', encoding='utf-8') as f:
                        schema = json.load(f)
                    return schema.get('required', [])
                except Exception:
                    continue
        return []

    def validate_required_fields(self, data: Dict[str, Any], required_fields: List[str]) -> None:
        """Validate that all required fields are present in the data."""
        missing = [key for key in required_fields if key not in data or data[key] in (None, "")]
        if missing:
            abort(make_response(jsonify({"error": "Missing required fields", "fields": missing}), 400))
    
    def validate_enums(self, data: Dict[str, Any], enum_fields: Dict[str, Any]) -> None:
        """Validate enum fields in the data."""
        try:
            for field, enum_class in enum_fields.items():
                if field in data and data[field]:
                    data[field] = enum_class(data[field])
        except ValueError as e:
            abort(400, description=f"Invalid enum value: {str(e)}")
    
    def validate_relationships(self, db_session, data: Dict[str, Any], 
                             relationship_fields: Dict[str, Any]) -> None:
        """Validate that referenced entities exist."""
        for field, model in relationship_fields.items():
            if field in data and data[field]:
                if not db_session.get(model, data[field]):
                    abort(400, description=f"Invalid {field}: {data[field]}")
    
    def get_all(self):
        """Get all items."""
        db_session = get_db_session()
        try:
            items = db_session.query(self.model).all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

    def get_by_id(self, item_id: str):
        """Get a single item by ID."""
        db_session = get_db_session()
        try:
            item = db_session.get(self.model, item_id)
            if not item:
                abort(404, description=f"Item {item_id} not found")
            return jsonify(self.serialize_item(item))
        finally:
            db_session.close()

    def upsert(self):
        """Create or update an item."""
        db_session = get_db_session()
        try:
            data = request.json
            # Load required fields from schema
            schema_name = self.model.__name__.replace('Model', '').lower()
            required_fields = self.get_schema_required_fields(schema_name)
            self.validate_required_fields(data, required_fields)
            # Get or create item
            item_id = self.get_id_from_data(data)
            item = db_session.get(self.model, item_id) or self.model(id=item_id)
            # Validate and process the data
            self.process_input_data(db_session, item, data)
            db_session.add(item)
            db_session.commit()
            return jsonify({"status": "ok", "id": item.id})
        except Exception as e:
            db_session.rollback()
            abort(400, description=str(e))
        finally:
            db_session.close()

    def delete(self, item_id: str):
        """Delete an item by ID."""
        db_session = get_db_session()
        try:
            item = db_session.get(self.model, item_id)
            if not item:
                abort(404, description=f"Item {item_id} not found")
            db_session.delete(item)
            db_session.commit()
            return jsonify({"status": "ok"})
        except Exception as e:
            db_session.rollback()
            abort(400, description=f"Error deleting item: {str(e)}")
        finally:
            db_session.close()
    
    # Methods to be overridden by subclasses
    
    def get_required_fields(self) -> List[str]:
        """Return list of required fields for validation."""
        raise NotImplementedError
    
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        """Extract the ID from the input data."""
        raise NotImplementedError
    
    def process_input_data(self, db_session: Session, item: Any, data: Dict[str, Any]) -> None:
        """Process and validate input data and update the item."""
        raise NotImplementedError
    
    def serialize_item(self, item: Any) -> Dict[str, Any]:
        """Convert a single item to a JSON-serializable dict."""
        raise NotImplementedError
    
    def serialize_list(self, items: List[Any]) -> List[Dict[str, Any]]:
        """Convert a list of items to JSON-serializable dicts."""
        return [self.serialize_item(item) for item in items]
