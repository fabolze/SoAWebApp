# backend/app/models/m_npcs.py

from sqlalchemy import Column, String, Text, Enum, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.models.m_dialogues import Dialogue
import enum



class NPCRole(enum.Enum):
    Questgiver = "Questgiver"
    Merchant = "Merchant"
    Trainer = "Trainer"
    Companion = "Companion"
    Story = "Story"
    Background = "Background"

class NPC(Base):
    __tablename__ = 'npcs'

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    title = Column(String)
    description = Column(Text)

    location_id = Column(String, ForeignKey("locations.id"))
    faction_id = Column(String, ForeignKey("factions.id"))
    dialogue_tree_id = Column(String, ForeignKey("dialogues.id"))

    image_path = Column(String)
    role = Column(Enum(NPCRole))

    available_quests = Column(JSON)         # List of quest IDs
    inventory = Column(JSON)                # List of { item_id, price }
    flags_set_on_interaction = Column(JSON) # List of flag IDs

    companion_config = Column(JSON)         # Full companion object (class_id, level, etc.)
    tags = Column(JSON)

    location = relationship("Location")
    faction = relationship("Faction")
    dialogues = relationship("Dialogue", foreign_keys=[Dialogue.npc_id], back_populates="npc")
    dialogue = relationship("Dialogue", foreign_keys=[dialogue_tree_id])
