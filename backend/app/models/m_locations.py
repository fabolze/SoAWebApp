# backend/app/models/m_locations.py

from sqlalchemy import Column, String, Boolean, Enum, Text, JSON
from backend.app.models.base import Base
import enum



class Biome(enum.Enum):
    Forest = "Forest"
    Cave = "Cave"
    City = "City"
    Mountain = "Mountain"
    Ruins = "Ruins"
    Desert = "Desert"
    Swamp = "Swamp"
    Snowfield = "Snowfield"

class Location(Base):
    __tablename__ = 'locations'

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)

    biome = Column(Enum(Biome), nullable=False)
    region = Column(String)

    level_range = Column(JSON)        # { "min": 5, "max": 10 }
    coordinates = Column(JSON)        # { "x": 32.0, "y": 14.0 }

    image_path = Column(String)

    encounters = Column(JSON)         # List of encounter IDs
    is_safe_zone = Column(Boolean, default=False)
    is_fast_travel_point = Column(Boolean, default=False)
    has_respawn_point = Column(Boolean, default=False)

    tags = Column(JSON)               # List of strings
