# backend/app/models/m_story_arcs.py

from sqlalchemy import Column, String, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
import enum



class ArcType(enum.Enum):
    Main = "Main Story"
    Side = "Side Arc"
    Faction = "Faction Arc"
    DLC = "DLC Arc"

class ContentPack(enum.Enum):
    Base = "Base"
    DLC1 = "DLC1"
    DLC2 = "DLC2"
    Expansion = "Expansion"

class StoryArc(Base):
    __tablename__ = 'story_arcs'

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    type = Column(Enum(ArcType), nullable=False)
    content_pack = Column(Enum(ContentPack), nullable=False)

    timeline_id = Column(String, ForeignKey("timelines.id"))

    related_quests = Column(JSON)      # List of quest IDs
    branching = Column(JSON)           # List of { quest_id, branches: [{ flag, next_quest_id }] }
    required_flags = Column(JSON)      # List of flag IDs
    tags = Column(JSON)  # List of string tags

    timeline = relationship("Timeline")
