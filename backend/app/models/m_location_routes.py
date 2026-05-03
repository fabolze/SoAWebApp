# backend/app/models/m_location_routes.py

import enum

from sqlalchemy import Boolean, Column, Enum, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class LocationRouteType(enum.Enum):
    Road = "Road"
    Trail = "Trail"
    CavePassage = "CavePassage"
    Portal = "Portal"
    ShipRoute = "ShipRoute"
    FlightPath = "FlightPath"
    DungeonDoor = "DungeonDoor"
    SecretPath = "SecretPath"


class LocationRoute(Base):
    __tablename__ = "location_routes"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    from_location_id = Column(String, ForeignKey("locations.id"), nullable=False)
    to_location_id = Column(String, ForeignKey("locations.id"), nullable=False)

    bidirectional = Column(Boolean, default=True)
    route_type = Column(Enum(LocationRouteType), nullable=False)
    travel_cost = Column(Float, default=0)
    travel_time = Column(Float, default=0)
    requirements_id = Column(String, ForeignKey("requirements.id"))
    is_hidden = Column(Boolean, default=False)
    is_fast_travel_enabled = Column(Boolean, default=False)
    description = Column(Text)
    tags = Column(JSON)

    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
    requirements = relationship("Requirement")
