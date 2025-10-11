# backend/app/models/m_encounters.py

from sqlalchemy import Column, String, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum



class EncounterType(enum.Enum):
    Combat = "Combat"
    Dialogue = "Dialogue"
    Event = "Event"

class Encounter(Base):
    __tablename__ = 'encounters'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)

    encounter_type = Column(Enum(EncounterType), nullable=False)
    requirements_id = Column(String, ForeignKey('requirements.id'))

    enemy_ids = Column(JSON)     # List of enemy IDs
    npc_ids = Column(JSON)       # List of NPC IDs

    rewards = Column(JSON)       # { xp, items, currencies, reputation, flags_set }
    tags = Column(JSON)  # List of string tags

    requirements = relationship("Requirement")  # optional: add back_populates
