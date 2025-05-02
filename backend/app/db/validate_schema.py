from backend.app.schemas import load_schemas
from backend.app.models import ALL_MODELS

def validate_models():
    schemas = load_schemas()

    for model in ALL_MODELS:
        table_name = model.__tablename__
        schema = schemas.get(table_name)
        assert schema, f"No JSON schema for table '{table_name}'"

        model_fields = {col.name for col in model.__table__.columns}
        schema_fields = set(schema.get("properties", {}).keys())

        missing_in_model = schema_fields - model_fields
        missing_in_schema = model_fields - schema_fields

        if missing_in_model or missing_in_schema:
            print(f"Field mismatch in '{table_name}':")
            if missing_in_model:
                print(f"  Schema has fields not in model: {missing_in_model}")
            if missing_in_schema:
                print(f"  Model has fields not in schema: {missing_in_schema}")
