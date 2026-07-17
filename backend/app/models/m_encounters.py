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

    participants = Column(JSON)  # [{ character_id, contexts, combat_side }]

    rewards = Column(JSON)       # { xp, items, currencies, reputation, flags_set }
    outcome_transitions = Column(JSON)  # Victory/completion transitions; defeat uses defeat_policy.
    pre_fight_policy = Column(JSON)     # Automatic save/checkpoint behavior.
    defeat_policy = Column(JSON)        # Retry/load/respawn behavior and overrides.
    repeat_policy = Column(String, default="inherit_owner")
    tags = Column(JSON)  # List of string tags

    requirements = relationship("Requirement")  # optional: add back_populates
