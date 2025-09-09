# backend/app/models/m_lore_entries.py

from sqlalchemy import Column, String, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid



class LoreEntry(Base):
    __tablename__ = 'lore_entries'

    id = Column(String, primary_key=True, default=generate_ulid)  # lore_id
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    text = Column(Text, nullable=False)

    location_id = Column(String, ForeignKey("locations.id"))
    timeline_id = Column(String, ForeignKey("timelines.id"))

    related_story_arcs = Column(JSON)  # list of story_arc_ids
    tags = Column(JSON)  # List of string tags

    location = relationship("Location")
    timeline = relationship("Timeline")
