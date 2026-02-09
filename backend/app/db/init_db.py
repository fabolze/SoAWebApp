from pathlib import Path
from threading import RLock
from typing import Tuple

from sqlalchemy import create_engine, event
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
    Base.metadata.create_all(bind=get_engine())


def get_db_session():
    return SessionLocal()
