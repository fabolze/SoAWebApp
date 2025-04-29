# backend/app/models/m_classes.py

from sqlalchemy import Column, String, Enum, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
import enum

Base = declarative_base()

class ClassRole(enum.Enum):
    Tank = "Tank"
    Damage = "Damage"
    Healer = "Healer"
    Support = "Support"
    Hybrid = "Hybrid"

class CharacterClass(Base):
    __tablename__ = 'classes'

    class_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    role = Column(Enum(ClassRole), nullable=False)

    base_stats = Column(JSON)
    stat_growth = Column(JSON)

    starting_abilities = Column(JSON)         # List of ability IDs
    preferred_attributes = Column(JSON)       # List of attribute IDs
    starting_equipment = Column(JSON)         # List of item IDs
    tags = Column(JSON)
