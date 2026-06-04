import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class PoiType(enum.Enum):
    Door = "Door"
    Shrine = "Shrine"
    LootNode = "LootNode"
    QuestMarker = "QuestMarker"
    NPCPlacement = "NPCPlacement"
    DiscoveryPoint = "DiscoveryPoint"
    RestPoint = "RestPoint"
    ResourceNode = "ResourceNode"
    Hazard = "Hazard"
    Interactable = "Interactable"
    Other = "Other"


class LocationPoi(Base):
    __tablename__ = "location_pois"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    location_id = Column(String, ForeignKey("locations.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    poi_type = Column(Enum(PoiType), nullable=False)
    requirements_id = Column(String, ForeignKey("requirements.id"))
    event_id = Column(String, ForeignKey("events.id"))
    dialogue_id = Column(String, ForeignKey("dialogues.id"))
    encounter_id = Column(String, ForeignKey("encounters.id"))
    item_id = Column(String, ForeignKey("items.id"))
    coordinates = Column(JSON)
    placement_notes = Column(Text)
    is_discoverable = Column(Boolean, default=True)
    discovery_hint = Column(Text)
    tags = Column(JSON)

    location = relationship("Location", foreign_keys=[location_id])
    requirements = relationship("Requirement")
    event = relationship("Event")
    dialogue = relationship("Dialogue")
    encounter = relationship("Encounter")
    item = relationship("Item")
