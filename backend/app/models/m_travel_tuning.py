from sqlalchemy import Column, Enum, Float, JSON, String, Text

from backend.app.models.base import Base
from backend.app.models.m_location_routes import LocationRouteType
from backend.app.models.m_locations import Biome, PlaceKind
from backend.app.utils.id import generate_ulid


class TravelTuning(Base):
    __tablename__ = "travel_tuning"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    route_type = Column(Enum(LocationRouteType))
    place_kind = Column(Enum(PlaceKind))
    biome = Column(Enum(Biome))
    encounter_chance = Column(Float, default=0)
    travel_time_multiplier = Column(Float, default=1)
    travel_cost_multiplier = Column(Float, default=1)
    safe_zone_multiplier = Column(Float, default=1)
    fatigue_cost = Column(Float, default=0)
    risk_score = Column(Float, default=0)
    tags = Column(JSON)
