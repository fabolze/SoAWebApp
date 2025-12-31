# backend/app/models/m_interaction_profiles.py

from sqlalchemy import Column, String, Enum, JSON, ForeignKey
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum



class InteractionRole(enum.Enum):
    Questgiver = "Questgiver"
    Merchant = "Merchant"
    Trainer = "Trainer"
    Companion = "Companion"
    Story = "Story"
    Background = "Background"

class InteractionProfile(Base):
    __tablename__ = "interaction_profiles"

    id = Column(String, primary_key=True, default=generate_ulid)
    character_id = Column(String, ForeignKey("characters.id"), nullable=False, unique=True)

    dialogue_tree_id = Column(String, ForeignKey("dialogues.id"))
    role = Column(Enum(InteractionRole))

    available_quests = Column(JSON)
    inventory = Column(JSON)
    flags_set_on_interaction = Column(JSON)
    tags = Column(JSON)
