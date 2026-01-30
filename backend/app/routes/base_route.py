# backend/app/routes/base_route.py
from flask import Blueprint, request, jsonify, abort, make_response
from typing import Any, Dict, List, Optional
from backend.app.db.init_db import get_db_session
from backend.app.models.base import Base
from sqlalchemy.orm import Session
from sqlalchemy.types import JSON, Enum
import os
import json
import enum

# Registry for resolving routes from table names (used by CSV export/import).
ROUTE_REGISTRY = {}

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
        self._register_in_registry(blueprint_name)

    def _register_in_registry(self, blueprint_name: str) -> None:
        """Register this route instance for lookup by table or blueprint name."""
        try:
            table_name = getattr(self.model, "__tablename__", None)
            if table_name:
                ROUTE_REGISTRY[table_name] = self
            ROUTE_REGISTRY[blueprint_name] = self
        except Exception:
            # Avoid breaking route registration on registry issues.
            pass
    
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
                if field in data and data[field] is not None:
                    val = data[field]
                    # Allow case-insensitive enum inputs
                    if isinstance(val, str):
                        try:
                            data[field] = enum_class(val)
                            continue
                        except ValueError:
                            for member in enum_class:
                                if member.value.lower() == val.lower() or member.name.lower() == val.lower():
                                    data[field] = member
                                    break
                            else:
                                raise ValueError(f"{val} is not among the defined enum values")
                    else:
                        data[field] = enum_class(val)
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
            # Normalize common fields (slug/tags) regardless of custom processing
            self._normalize_common_fields(item, data)
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
    
    def serialize_model(self, model_instance: Any, _active: Optional[set] = None) -> Dict[str, Any]:
        """Serialize any model instance dynamically, handling enums, JSON fields, relationships, and computed fields.

        Uses a cycle guard to avoid infinite recursion on bidirectional relationships.
        """
        if model_instance is None:
            return {}
        if _active is None:
            _active = set()

        model_id = getattr(model_instance, "id", None)
        identity = (model_instance.__class__.__name__, model_id if model_id is not None else id(model_instance))
        if identity in _active:
            return {"id": model_id}

        _active.add(identity)
        try:
            serialized = {}
            for column in model_instance.__table__.columns:
                value = getattr(model_instance, column.name, None)
                if isinstance(value, enum.Enum):
                    serialized[column.name] = value.value  # Convert enum to its string value
                elif isinstance(value, list) or isinstance(value, dict):
                    serialized[column.name] = value  # Handle JSON fields
                else:
                    serialized[column.name] = value

            # Handle relationships
            for relationship in model_instance.__mapper__.relationships:
                related_value = getattr(model_instance, relationship.key, None)
                if related_value is not None:
                    if isinstance(related_value, list):
                        serialized[relationship.key] = [self.serialize_model(item, _active) for item in related_value]
                    else:
                        serialized[relationship.key] = self.serialize_model(related_value, _active)

            # Add computed fields if any
            if hasattr(model_instance, "computed_fields"):
                for field_name, compute_func in model_instance.computed_fields.items():
                    serialized[field_name] = compute_func(model_instance)

            # Custom serialization for specific models
            if hasattr(model_instance, "custom_serialization"):
                serialized.update(model_instance.custom_serialization())

            return serialized
        finally:
            _active.remove(identity)

    def process_input_data(self, db_session: Session, model_instance: Any, data: Dict[str, Any]) -> None:
        """Process input data for model instance, handling enums, relationships, and JSON fields."""
        # Validate required fields
        self.validate_required_fields(data, [column.name for column in model_instance.__table__.columns if not column.nullable])

        # Validate enums
        enum_fields = {column.name: column.type.enum_class for column in model_instance.__table__.columns if isinstance(column.type, Enum)}
        self.validate_enums(data, enum_fields)

        # Assign values to model instance
        for column in model_instance.__table__.columns:
            if column.name in data:
                setattr(model_instance, column.name, data[column.name])

        # Handle relationships
        for relationship in model_instance.__mapper__.relationships:
            if relationship.key in data:
                related_data = data[relationship.key]
                if isinstance(related_data, list):
                    related_instances = [db_session.query(relationship.mapper.class_).get(item) for item in related_data]
                    setattr(model_instance, relationship.key, related_instances)
                else:
                    related_instance = db_session.query(relationship.mapper.class_).get(related_data)
                    setattr(model_instance, relationship.key, related_instance)

        # Custom validation for specific models
        if hasattr(model_instance, "custom_validation"):
            model_instance.custom_validation(data)

        # Update other fields
        for key, value in data.items():
            if hasattr(model_instance, key):
                setattr(model_instance, key, value)

    def _normalize_common_fields(self, model_instance: Any, data: Dict[str, Any]) -> None:
        """Normalize slug/tags to lowercase if present on the model."""
        try:
            if hasattr(model_instance, "slug"):
                slug_val = getattr(model_instance, "slug", None)
                if isinstance(slug_val, str):
                    setattr(model_instance, "slug", slug_val.strip().lower())
            if hasattr(model_instance, "tags"):
                tags_val = getattr(model_instance, "tags", None)
                if isinstance(tags_val, list):
                    normalized = [str(t).strip().lower() for t in tags_val if str(t).strip() != ""]
                    setattr(model_instance, "tags", normalized)
                elif isinstance(tags_val, str):
                    setattr(model_instance, "tags", tags_val.strip().lower())
        except Exception:
            # Avoid breaking saves on normalization errors
            pass
    
    def serialize_list(self, items: List[Any]) -> List[Dict[str, Any]]:
        """Convert a list of items to JSON-serializable dicts."""
        return [self.serialize_item(item) for item in items]
