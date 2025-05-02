from sqlalchemy import create_engine
from backend.app.models.base import Base  # assuming Base is defined in a central place
from backend.app.config import SQLALCHEMY_DATABASE_URI    # contains DB path/config

def init_db():
    engine = create_engine(SQLALCHEMY_DATABASE_URI)
    Base.metadata.create_all(bind=engine)
