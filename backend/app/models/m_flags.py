# backend/app/models/m_flags.py

from sqlalchemy import Column, String, Boolean, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
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


class Flag(Base):
    __tablename__ = 'flags'

    id = Column(String, primary_key=True, default=generate_ulid)  # Unique ID
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    flag_type = Column(Enum(FlagType))
    default_value = Column(Boolean, default=False)

    content_pack_id = Column(String, ForeignKey('content_packs.id'))
    tags = Column(JSON)  # Flexible tagging

    content_pack = relationship("ContentPack")

