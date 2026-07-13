from pathlib import Path
import json
import os
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


def replace_active_database_file(staging_path: Path, target_db_name: str | None = None) -> Tuple[str, str]:
    """Atomically replace the active SQLite file and reconnect the runtime."""
    global engine, SessionLocal, _active_db_uri

    target_path = get_db_path(target_db_name or get_active_db_name())
    staging_path = Path(staging_path)
    if not staging_path.exists():
        raise FileNotFoundError(f"Staging database not found: {staging_path}")
    with _engine_lock:
        SessionLocal.remove()
        previous_engine = engine
        previous_engine.dispose()
        os.replace(staging_path, target_path)
        next_uri = f"sqlite:///{target_path}"
        engine = _build_engine(next_uri)
        SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))
        _active_db_uri = next_uri
    return get_active_db_name(), str(target_path)


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
                additive_ability_columns = {
                    "cast_time": "FLOAT",
                    "recovery_time": "FLOAT",
                    "upkeep_cost": "FLOAT",
                    "max_targets": "INTEGER",
                    "design_intent": "TEXT",
                    "counterplay_notes": "TEXT",
                    "mastery_notes": "TEXT",
                    "presentation_notes": "TEXT",
                }
                for column_name, column_type in additive_ability_columns.items():
                    if column_name not in ability_columns:
                        connection.execute(text(f"ALTER TABLE abilities ADD COLUMN {column_name} {column_type}"))
                connection.execute(text("UPDATE abilities SET cast_time = 0 WHERE cast_time IS NULL"))
                connection.execute(text("UPDATE abilities SET recovery_time = 0 WHERE recovery_time IS NULL"))
                connection.execute(text("UPDATE abilities SET upkeep_cost = 0 WHERE upkeep_cost IS NULL"))

            if "effects" in table_names:
                effect_columns = {column["name"] for column in inspector.get_columns("effects")}
                additive_effect_columns = {
                    "calculation_basis": "VARCHAR",
                    "scaling_multiplier": "FLOAT",
                    "damage_type": "VARCHAR",
                    "tick_interval": "FLOAT",
                    "status_operation": "VARCHAR",
                    "status_filter": "JSON",
                }
                for column_name, column_type in additive_effect_columns.items():
                    if column_name not in effect_columns:
                        connection.execute(text(f"ALTER TABLE effects ADD COLUMN {column_name} {column_type}"))
                connection.execute(text("UPDATE effects SET status_operation = 'Apply' WHERE status_operation IS NULL"))

            if "statuses" in table_names:
                status_columns = {column["name"] for column in inspector.get_columns("statuses")}
                additive_status_columns = {
                    "polarity": "VARCHAR",
                    "reapplication_policy": "VARCHAR",
                    "stack_decay_policy": "VARCHAR",
                    "can_cleanse": "BOOLEAN",
                    "can_dispel": "BOOLEAN",
                }
                for column_name, column_type in additive_status_columns.items():
                    if column_name not in status_columns:
                        connection.execute(text(f"ALTER TABLE statuses ADD COLUMN {column_name} {column_type}"))
                connection.execute(text("UPDATE statuses SET polarity = 'Neutral' WHERE polarity IS NULL"))
                connection.execute(text("UPDATE statuses SET reapplication_policy = 'RefreshDuration' WHERE reapplication_policy IS NULL"))
                connection.execute(text("UPDATE statuses SET stack_decay_policy = 'AllAtOnce' WHERE stack_decay_policy IS NULL"))
                connection.execute(text("UPDATE statuses SET can_cleanse = 1 WHERE can_cleanse IS NULL"))
                connection.execute(text("UPDATE statuses SET can_dispel = 1 WHERE can_dispel IS NULL"))

            if "combat_profiles" in table_names:
                profile_columns = {column["name"] for column in inspector.get_columns("combat_profiles")}
                if "status_rules" not in profile_columns:
                    connection.execute(text("ALTER TABLE combat_profiles ADD COLUMN status_rules JSON"))

            if "dialogue_nodes" in table_names:
                dialogue_node_columns = {column["name"] for column in inspector.get_columns("dialogue_nodes")}
                if "speaker_character_id" not in dialogue_node_columns:
                    connection.execute(text("ALTER TABLE dialogue_nodes ADD COLUMN speaker_character_id VARCHAR"))
                if "is_terminal" not in dialogue_node_columns:
                    connection.execute(text("ALTER TABLE dialogue_nodes ADD COLUMN is_terminal BOOLEAN DEFAULT 0 NOT NULL"))

            if "dialogues" in table_names:
                dialogue_columns = {column["name"] for column in inspector.get_columns("dialogues")}
                if "starting_node_id" not in dialogue_columns:
                    connection.execute(text("ALTER TABLE dialogues ADD COLUMN starting_node_id VARCHAR"))

            if "dialogues" in table_names and "dialogue_nodes" in table_names:
                # Backfill portable graph meaning for legacy databases. Ambiguous
                # cyclic/multi-root graphs remain unset and are repaired in the UI.
                graph_rows = list(connection.execute(text("SELECT id, dialogue_id, choices FROM dialogue_nodes")).mappings())
                by_dialogue = {}
                for row in graph_rows:
                    raw_choices = row["choices"]
                    try:
                        choices = json.loads(raw_choices) if isinstance(raw_choices, str) else (raw_choices or [])
                    except (TypeError, ValueError):
                        choices = []
                    by_dialogue.setdefault(row["dialogue_id"], []).append((row["id"], choices))
                    if not choices:
                        connection.execute(text("UPDATE dialogue_nodes SET is_terminal = 1 WHERE id = :id"), {"id": row["id"]})
                for dialogue_id, nodes in by_dialogue.items():
                    inbound = {node_id: 0 for node_id, _choices in nodes}
                    for _node_id, choices in nodes:
                        for choice in choices if isinstance(choices, list) else []:
                            target = choice.get("next_node_id") if isinstance(choice, dict) else None
                            if target in inbound:
                                inbound[target] += 1
                    roots = [node_id for node_id, count in inbound.items() if count == 0]
                    if len(roots) == 1:
                        connection.execute(text("UPDATE dialogues SET starting_node_id = :start WHERE id = :dialogue AND starting_node_id IS NULL"), {"start": roots[0], "dialogue": dialogue_id})

            if "character_story_beats" in table_names:
                beat_columns = {column["name"] for column in inspector.get_columns("character_story_beats")}
                for column in ("required_flags", "forbidden_flags", "expected_output_flags"):
                    if column not in beat_columns:
                        connection.execute(text(f"ALTER TABLE character_story_beats ADD COLUMN {column} JSON"))

            if "adventure_beat_links" in table_names:
                adventure_link_columns = {column["name"] for column in inspector.get_columns("adventure_beat_links")}
                additive_adventure_link_columns = {
                    "occurrence_kind": "VARCHAR",
                    "change_type": "VARCHAR",
                    "state_label": "VARCHAR",
                    "starts_at_beat_id": "VARCHAR",
                    "ends_at_beat_id": "VARCHAR",
                    "continuity_group_id": "VARCHAR",
                    "importance": "VARCHAR",
                }
                for column_name, column_type in additive_adventure_link_columns.items():
                    if column_name not in adventure_link_columns:
                        connection.execute(text(f"ALTER TABLE adventure_beat_links ADD COLUMN {column_name} {column_type}"))
                connection.execute(text("UPDATE adventure_beat_links SET occurrence_kind = 'Appearance' WHERE occurrence_kind IS NULL"))
                connection.execute(text("UPDATE adventure_beat_links SET change_type = 'Active' WHERE change_type IS NULL"))
                connection.execute(text("UPDATE adventure_beat_links SET importance = 'Major' WHERE importance IS NULL"))

            if "ability_effect_links" in table_names:
                link_columns = {column["name"] for column in inspector.get_columns("ability_effect_links")}
                additive_link_columns = {
                    "phase": "VARCHAR",
                    "turn_offset": "FLOAT",
                    "sort_order": "INTEGER",
                }
                for column_name, column_type in additive_link_columns.items():
                    if column_name not in link_columns:
                        connection.execute(text(f"ALTER TABLE ability_effect_links ADD COLUMN {column_name} {column_type}"))
                connection.execute(text("UPDATE ability_effect_links SET phase = 'Impact' WHERE phase IS NULL"))
                connection.execute(text("UPDATE ability_effect_links SET turn_offset = 0 WHERE turn_offset IS NULL"))
                connection.execute(text("UPDATE ability_effect_links SET sort_order = 0 WHERE sort_order IS NULL"))

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
