# backend/app/models/m_factions.py

from sqlalchemy import Column, String, Text, Enum, JSON
from backend.app.models.base import Base
import enum



class Alignment(enum.Enum):
    Hostile = "Hostile"
    Neutral = "Neutral"
    Friendly = "Friendly"

class Faction(Base):
    __tablename__ = 'factions'

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)

    alignment = Column(Enum(Alignment), nullable=False)

    relationships = Column(JSON)        # { faction_id: "Hostile" | "Neutral" | "Friendly" }
    reputation_config = Column(JSON)    # { min, max, thresholds: { friendly, trusted, ally } }

    tags = Column(JSON)                  # Standardize to 'tags' instead of 'tag'
    icon_path = Column(String)
