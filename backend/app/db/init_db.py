from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from backend.app.models.base import Base
from backend.app.config import SQLALCHEMY_DATABASE_URI

# Engine and session setup
engine = create_engine(SQLALCHEMY_DATABASE_URI, future=True)
SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db_session():
    return SessionLocal()
