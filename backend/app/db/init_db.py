from pathlib import Path
from threading import RLock
from typing import Tuple

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import scoped_session, sessionmaker

from backend.app.config import DATA_DIR, SQLALCHEMY_DATABASE_URI
from backend.app.models.base import Base

_engine_lock = RLock()


def _set_sqlite_pragma(dbapi_connection, _connection_record):
    """Ensure SQLite enforces foreign keys for relational integrity."""
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        # Non-SQLite engines may not support this pragma.
        pass


def _build_engine(db_uri: str):
    eng = create_engine(db_uri, future=True)
    event.listen(eng, "connect", _set_sqlite_pragma)
    return eng


def _db_name_from_uri(db_uri: str) -> str:
    try:
        parsed = make_url(db_uri)
        db_path = parsed.database
        if db_path:
            return Path(db_path).stem
    except Exception:
        pass
    return "unknown"


engine = _build_engine(SQLALCHEMY_DATABASE_URI)
SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))
_active_db_uri = SQLALCHEMY_DATABASE_URI


def get_engine():
    return engine


def get_active_db_uri() -> str:
    return _active_db_uri


def get_active_db_name() -> str:
    return _db_name_from_uri(_active_db_uri)


def normalize_db_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValueError("Missing database name.")
    if cleaned.lower().endswith(".sqlite"):
        cleaned = cleaned[:-7]
    if any(ch in cleaned for ch in '\\/:*?"<>|'):
        raise ValueError("Database name contains invalid characters.")
    return cleaned


def get_db_path(db_name: str) -> Path:
    safe_name = normalize_db_name(db_name)
    return DATA_DIR / f"{safe_name}.sqlite"


def switch_active_database(db_name: str) -> Tuple[str, str]:
    """Switch the runtime engine/session to another sqlite database file."""
    global engine, SessionLocal, _active_db_uri

    db_path = get_db_path(db_name)
    if not db_path.exists():
        raise FileNotFoundError(f"Database '{db_name}' not found.")
    next_uri = f"sqlite:///{db_path}"

    with _engine_lock:
        SessionLocal.remove()
        previous_engine = engine
        engine = _build_engine(next_uri)
        SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))
        _active_db_uri = next_uri
        previous_engine.dispose()
    return get_active_db_name(), str(db_path)


def init_db():
    active_engine = get_engine()
    Base.metadata.create_all(bind=active_engine)
    _upgrade_sqlite_schema(active_engine)


def _upgrade_sqlite_schema(active_engine) -> None:
    """Apply tiny additive SQLite upgrades for existing local databases."""
    if active_engine.dialect.name != "sqlite":
        return
    try:
        inspector = inspect(active_engine)
        table_names = set(inspector.get_table_names())
        if "locations" in table_names:
            biome_column = next((column for column in inspector.get_columns("locations") if column["name"] == "biome"), None)
            if biome_column and not biome_column.get("nullable", True):
                _rebuild_locations_table_for_nullable_biome(active_engine)
                inspector = inspect(active_engine)
                table_names = set(inspector.get_table_names())
        with active_engine.begin() as connection:
            if "abilities" in table_names:
                ability_columns = {column["name"] for column in inspector.get_columns("abilities")}
                if "requirements_id" not in ability_columns:
                    connection.execute(text("ALTER TABLE abilities ADD COLUMN requirements_id VARCHAR"))

            if "effects" in table_names:
                effect_columns = {column["name"] for column in inspector.get_columns("effects")}
                additive_effect_columns = {
                    "calculation_basis": "VARCHAR",
                    "scaling_multiplier": "FLOAT",
                    "damage_type": "VARCHAR",
                    "tick_interval": "FLOAT",
                }
                for column_name, column_type in additive_effect_columns.items():
                    if column_name not in effect_columns:
                        connection.execute(text(f"ALTER TABLE effects ADD COLUMN {column_name} {column_type}"))

            if "locations" in table_names:
                location_columns = {column["name"] for column in inspector.get_columns("locations")}
                additive_location_columns = {
                    "parent_location_id": "VARCHAR",
                    "location_type": "VARCHAR",
                    "place_kind": "VARCHAR",
                    "environment_tags": "JSON",
                    "biome_inheritance": "VARCHAR",
                    "sort_order": "INTEGER",
                    "is_playable_space": "BOOLEAN",
                    "is_world_map_node": "BOOLEAN",
                }
                for column_name, column_type in additive_location_columns.items():
                    if column_name not in location_columns:
                        connection.execute(text(f"ALTER TABLE locations ADD COLUMN {column_name} {column_type}"))
                connection.execute(text("UPDATE locations SET location_type = 'Zone' WHERE location_type IS NULL"))
                connection.execute(text("UPDATE locations SET sort_order = 0 WHERE sort_order IS NULL"))
                connection.execute(text("UPDATE locations SET is_playable_space = 1 WHERE is_playable_space IS NULL"))
                connection.execute(text("UPDATE locations SET is_world_map_node = 1 WHERE is_world_map_node IS NULL"))

            if "travel_tuning" in table_names:
                tuning_columns = {column["name"] for column in inspector.get_columns("travel_tuning")}
                if "place_kind" not in tuning_columns:
                    connection.execute(text("ALTER TABLE travel_tuning ADD COLUMN place_kind VARCHAR"))
    except Exception:
        # Keep application startup resilient; model metadata handles fresh databases.
        pass


def _rebuild_locations_table_for_nullable_biome(active_engine) -> None:
    """Rebuild legacy SQLite locations table so biome can become nullable."""
    with active_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.execute(text("DROP TABLE IF EXISTS locations_new"))
        connection.execute(text("""
            CREATE TABLE locations_new (
                id VARCHAR NOT NULL PRIMARY KEY,
                slug VARCHAR NOT NULL UNIQUE,
                name VARCHAR NOT NULL,
                description TEXT,
                biome VARCHAR,
                biome_modifier VARCHAR,
                region VARCHAR,
                place_kind VARCHAR,
                environment_tags JSON,
                biome_inheritance VARCHAR,
                parent_location_id VARCHAR REFERENCES locations(id),
                location_type VARCHAR,
                sort_order INTEGER,
                is_playable_space BOOLEAN,
                is_world_map_node BOOLEAN,
                level_range JSON,
                coordinates JSON,
                image_path VARCHAR,
                encounters JSON,
                is_safe_zone BOOLEAN,
                is_fast_travel_point BOOLEAN,
                has_respawn_point BOOLEAN,
                tags JSON
            )
        """))
        source_columns = [
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(locations)").fetchall()
            if row[1] != "id"
        ]
        target_columns = [
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(locations_new)").fetchall()
            if row[1] != "id"
        ]
        common_columns = ["id"] + [column for column in target_columns if column in source_columns]
        column_list = ", ".join(common_columns)
        connection.execute(text(f"INSERT INTO locations_new ({column_list}) SELECT {column_list} FROM locations"))
        connection.execute(text("DROP TABLE locations"))
        connection.execute(text("ALTER TABLE locations_new RENAME TO locations"))
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def get_db_session():
    return SessionLocal()
