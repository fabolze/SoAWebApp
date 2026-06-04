import enum

from sqlalchemy import Column, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class RouteEventTriggerMode(enum.Enum):
    Always = "Always"
    FirstTime = "FirstTime"
    RandomChance = "RandomChance"
    RequirementMet = "RequirementMet"
    StoryForced = "StoryForced"


class RouteEventBinding(Base):
    __tablename__ = "route_event_bindings"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    route_id = Column(String, ForeignKey("location_routes.id"), nullable=False)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    trigger_mode = Column(Enum(RouteEventTriggerMode), nullable=False)
    chance = Column(Float, default=100)
    requirements_id = Column(String, ForeignKey("requirements.id"))
    priority = Column(Integer, default=0)
    cooldown = Column(Float, default=0)
    description = Column(Text)
    tags = Column(JSON)

    route = relationship("LocationRoute", foreign_keys=[route_id])
    event = relationship("Event")
    requirements = relationship("Requirement")
