# backend/app/models/m_dialogues.py

from sqlalchemy import Column, String, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base



class Dialogue(Base):
    __tablename__ = 'dialogues'

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)  # Internal dev-facing label

    npc_id = Column(String, ForeignKey("npcs.id"))
    location_id = Column(String, ForeignKey("locations.id"))
    requirements_id = Column(String, ForeignKey("requirements.id"))

    description = Column(Text)  # Notes or context for writers
    tags = Column(JSON)         # List of string tags

    # Relationships
    npc = relationship("NPC")
    location = relationship("Location")
    requirements = relationship("Requirement")

    nodes = relationship("DialogueNode", backref="dialogue", cascade="all, delete-orphan")
