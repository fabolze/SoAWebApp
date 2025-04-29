# utils/schema_updater.py
import sqlite3

def map_json_type_to_sql(col_type):
    return {
        "string": "TEXT",
        "number": "REAL",
        "integer": "INTEGER",
        "boolean": "INTEGER",  # SQLite has no real BOOLEAN type
    }.get(col_type, "TEXT")

def update_table_from_schema(db, table_name, schema):
    conn = sqlite3.connect(db.engine.url.database)
    cursor = conn.cursor()

    # Load existing columns
    cursor.execute(f"PRAGMA table_info({table_name})")
    existing_columns = {col[1] for col in cursor.fetchall()}

    # Walk schema and add missing columns
    for col_name, config in schema.get("properties", {}).items():
        if col_name in existing_columns:
            continue

        # Simple flat fields only for now (no nested objects/arrays)
        if "type" not in config:
            continue

        col_type = map_json_type_to_sql(config["type"])
        sql = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"
        try:
            cursor.execute(sql)
            print(f"Added column '{col_name}' to '{table_name}'")
        except sqlite3.OperationalError as e:
            print(f"⚠️ Error altering table {table_name}: {e}")

    conn.commit()
    conn.close()
