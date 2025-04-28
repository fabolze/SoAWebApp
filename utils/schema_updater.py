# utils/schema_updater.py
#Ensures that when you add fields in schemas/items.json, the database will auto-update columns.
# utils/schema_updater.py
import json
import sqlite3
from utils.db_schema import get_existing_columns

def flatten_schema_properties(properties, parent_key=""):
    fields = {}

    for key, config in properties.items():
        full_key = f"{parent_key}_{key}" if parent_key else key

        if config.get("type") == "object" and "properties" in config:
            nested_fields = flatten_schema_properties(config["properties"], parent_key=full_key)
            fields.update(nested_fields)
        else:
            fields[full_key] = config

    return fields

def update_items_table(db_path, schema_path, table_name="item"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    existing_columns = get_existing_columns(db_path, table_name)

    type_map = {
        "string": "TEXT",
        "text": "TEXT",
        "int": "INTEGER",
        "integer": "INTEGER",
        "float": "REAL",
        "number": "REAL",
        "bool": "BOOLEAN",
        "boolean": "BOOLEAN",
        "array": "TEXT",  # comma-separated
    }

    flat_fields = flatten_schema_properties(schema["properties"])

    for field_name, config in flat_fields.items():
        if field_name in existing_columns:
            continue

        # Check 'type' normally or inside ui
        field_type = config.get("type", "string")
        sqlite_type = type_map.get(field_type, "TEXT")

        alter_stmt = f"ALTER TABLE {table_name} ADD COLUMN {field_name} {sqlite_type};"
        print(f"Updating DB: {alter_stmt}")
        cursor.execute(alter_stmt)

    conn.commit()
    conn.close()
