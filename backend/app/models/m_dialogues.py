# backend/app/models/m_dialogues.py

from sqlalchemy import Column, String, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid



class Dialogue(Base):
    __tablename__ = 'dialogues'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)  # Internal dev-facing label

    npc_id = Column(String, ForeignKey("npcs.id"))
    location_id = Column(String, ForeignKey("locations.id"))
    requirements_id = Column(String, ForeignKey("requirements.id"))

    description = Column(Text)  # Notes or context for writers
    tags = Column(JSON)         # List of string tags

    # Relationships
    npc = relationship("NPC", foreign_keys=[npc_id], back_populates="dialogues")
    location = relationship("Location", foreign_keys=[location_id])
    requirements = relationship("Requirement", foreign_keys=[requirements_id])


    nodes = relationship("DialogueNode", backref="dialogue", cascade="all, delete-orphan")
