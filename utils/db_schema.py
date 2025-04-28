# utils/db_schema.py
#Reads what columns exist in the SQLite database for a given table.
import sqlite3

def get_existing_columns(db_path, table_name):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name});")
    columns = [row[1] for row in cursor.fetchall()]
    conn.close()
    return columns
