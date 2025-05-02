from sqlalchemy import create_engine, inspect, text
from backend.app.config import SQLALCHEMY_DATABASE_URI
from backend.app.models import ALL_MODELS
from backend.app.schemas import load_schemas

TYPE_MAP = {
    "string": "TEXT",
    "integer": "INTEGER",
    "number": "REAL",
    "boolean": "BOOLEAN"
}

def infer_sql_type(schema_type):
    return TYPE_MAP.get(schema_type, "TEXT")

def sync_schema():
    engine = create_engine(SQLALCHEMY_DATABASE_URI)
    inspector = inspect(engine)
    schemas = load_schemas()

    with engine.connect() as conn:
        for model in ALL_MODELS:
            table_name = model.__tablename__
            schema = schemas.get(table_name)
            if not schema:
                print(f"⚠️ No schema for table '{table_name}'")
                continue

            # Get existing columns
            existing_columns = {col["name"] for col in inspector.get_columns(table_name)}

            # Get schema-defined fields
            properties = schema.get("properties", {})
            for field_name, field_def in properties.items():
                if field_name not in existing_columns:
                    sql_type = infer_sql_type(field_def.get("type"))
                    alter_stmt = text(f'ALTER TABLE {table_name} ADD COLUMN "{field_name}" {sql_type}')
                    print(f"➕ Adding column '{field_name}' to table '{table_name}'")
                    conn.execute(alter_stmt)

