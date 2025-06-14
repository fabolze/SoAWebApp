# backend/app/models/m_characterclasses.py

from sqlalchemy import Column, String, Enum, Text, JSON
from backend.app.models.base import Base
import enum



class ClassRole(enum.Enum):
    Tank = "Tank"
    Damage = "Damage"
    Healer = "Healer"
    Support = "Support"
    Hybrid = "Hybrid"

class CharacterClass(Base):
    __tablename__ = 'characterclasses'

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    role = Column(Enum(ClassRole), nullable=False)

    base_stats = Column(JSON, nullable=False)
    stat_growth = Column(JSON)

    starting_abilities = Column(JSON)         # List of ability IDs
    preferred_attributes = Column(JSON)       # List of attribute IDs
    starting_equipment = Column(JSON)         # List of item IDs
    tags = Column(JSON)  # List of string tags
