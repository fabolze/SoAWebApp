# backend/app/models/m_timelines.py

from sqlalchemy import Column, String, Text, Integer, JSON
from backend.app.models.base import Base



class Timeline(Base):
    __tablename__ = 'timelines'

    id = Column(String, primary_key=True)  # timeline_id
    name = Column(String, nullable=False)
    description = Column(Text)

    start_year = Column(Integer)
    end_year = Column(Integer)

    tags = Column(JSON)  # List of string tags
