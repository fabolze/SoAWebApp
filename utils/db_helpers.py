# utils/db_helpers.py

from sqlalchemy import Table, MetaData
from models import db

def get_fresh_table(table_name: str):
    """Fetches the latest version of a table after any dynamic schema updates."""
    metadata = MetaData()
    return Table(table_name, metadata, autoload_with=db.engine)
