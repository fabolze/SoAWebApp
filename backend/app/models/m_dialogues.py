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

    character_id = Column(String, ForeignKey("characters.id"))
    location_id = Column(String, ForeignKey("locations.id"))
    requirements_id = Column(String, ForeignKey("requirements.id"))
    starting_node_id = Column(String, ForeignKey("dialogue_nodes.id", use_alter=True, name="fk_dialogue_starting_node"))

    description = Column(Text)  # Notes or context for writers
    tags = Column(JSON)         # List of string tags

    # Relationships
    character = relationship("Character", foreign_keys=[character_id])
    location = relationship("Location", foreign_keys=[location_id])
    requirements = relationship("Requirement", foreign_keys=[requirements_id])


    nodes = relationship("DialogueNode", backref="dialogue", cascade="all, delete-orphan", foreign_keys="DialogueNode.dialogue_id")
