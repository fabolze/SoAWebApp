# backend/app/models/m_timelines.py

from sqlalchemy import Boolean, Column, String, Text, Integer, JSON
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid



class Timeline(Base):
    __tablename__ = 'timelines'

    id = Column(String, primary_key=True, default=generate_ulid)  # timeline_id
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)

    start_year = Column(Integer)
    end_year = Column(Integer)
    era_order = Column(Integer, default=0)
    is_current_playable_era = Column(Boolean, default=False)

    tags = Column(JSON)  # List of string tags
