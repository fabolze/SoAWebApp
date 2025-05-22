# backend/app/models/m_dialogue_nodes.py

from sqlalchemy import Column, String, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base



class DialogueNode(Base):
    __tablename__ = 'dialogue_nodes'

    id = Column(String, primary_key=True)
    dialogue_id = Column(String, ForeignKey('dialogues.id'), nullable=False)  # FK to dialogue group/flow
    speaker = Column(String, nullable=False)
    text = Column(Text, nullable=False)

    requirements_id = Column(String, ForeignKey('requirements.id'))

    choices = Column(JSON)     # List of { choice_text?, next_node_id, requirements?, set_flags? }
    set_flags = Column(JSON)   # List of flag IDs set by this node
    tags = Column(JSON)  # List of string tags

    # Relationships
    requirements = relationship("Requirement")
    # Optional: add relationship("Dialogue") if you create a dialogues table
