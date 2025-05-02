# backend/app/models/m_events.py

from sqlalchemy import Column, String, Enum, Float, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
import enum



class EventType(enum.Enum):
    Encounter = "Encounter"
    ItemReward = "ItemReward"
    LoreDiscovery = "LoreDiscovery"
    Dialogue = "Dialogue"
    Teleport = "Teleport"
    ScriptedScene = "ScriptedScene"

class Event(Base):
    __tablename__ = 'events'

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    type = Column(Enum(EventType), nullable=False)

    requirements_id = Column(String, ForeignKey("requirements.id"))
    location_id = Column(String, ForeignKey("locations.id"))
    lore_id = Column(String, ForeignKey("lore_entries.id"))
    dialogue_id = Column(String, ForeignKey("dialogues.id"))
    encounter_id = Column(String, ForeignKey("encounters.id"))

    item_rewards = Column(JSON)     # [{ item_id, quantity }]
    xp_reward = Column(Float)
    flags_set = Column(JSON)        # [flag_id, ...]

    next_event_id = Column(String, ForeignKey("events.id"))  # Self-referential FK

    # Relationships
    requirements = relationship("Requirement")
    location = relationship("Location")
    lore = relationship("LoreEntry")
    dialogue = relationship("Dialogue")
    encounter = relationship("Encounter")
    next_event = relationship("Event", remote_side=[id])
