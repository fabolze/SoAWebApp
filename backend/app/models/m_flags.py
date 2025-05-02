# backend/app/models/m_flags.py

from sqlalchemy import Column, String, Boolean, Enum, Text, JSON
from backend.app.models.base import Base
import enum



class FlagType(enum.Enum):
    StoryProgress = "Story Progress"
    QuestState = "Quest State"
    LoreDiscovery = "Lore Discovery"
    ItemUnlock = "Item Unlock"
    NPCRelationship = "NPC Relationship"
    CompanionProgress = "Companion Progress"
    SecretDiscovery = "Secret Discovery"
    ShopUnlock = "Shop Unlock"
    EventTrigger = "Event Trigger"
    Other = "Other"

class ContentPack(enum.Enum):
    Base = "Base"
    DLC1 = "DLC1"
    DLC2 = "DLC2"
    Expansion = "Expansion"

class Flag(Base):
    __tablename__ = 'flags'

    id = Column(String, primary_key=True)  # Unique ID
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    flag_type = Column(Enum(FlagType))
    default_value = Column(Boolean, default=False)
    content_pack = Column(Enum(ContentPack))
    tags = Column(JSON)  # Flexible tagging
