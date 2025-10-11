# backend/app/models/m_locations.py

from sqlalchemy import Column, String, Boolean, Enum, Text, JSON
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum


class Biome(enum.Enum):
    # Core biomes
    Plains = "Plains"
    Forest = "Forest"
    Cave = "Cave"
    Mountain = "Mountain"
    Desert = "Desert"
    Swamp = "Swamp"
    Coast = "Coast"
    Tundra = "Tundra"

    # Urban biomes
    City = "City"
    Ruins = "Ruins"
    Fortress = "Fortress"

    # Air biomes
    SkyIsles = "Sky Isles"
    CloudSea = "Cloud Sea"

    # Underground biomes
    CrystalCaverns = "Crystal Caverns"
    MagmaVeins = "Magma Veins"
    FungalUndergrowth = "Fungal Undergrowth"
    Abyss = "Abyss"


class BiomeModifier(enum.Enum):
    Arcane = "Arcane"
    Corrupted = "Corrupted"
    Divine = "Divine"
    Shadowed = "Shadowed"
    Dreamlike = "Dreamlike"


class Location(Base):
    __tablename__ = 'locations'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)

    biome = Column(Enum(Biome), nullable=False)
    biome_modifier = Column(Enum(BiomeModifier))
    region = Column(String)

    level_range = Column(JSON)        # { "min": 5, "max": 10 }
    coordinates = Column(JSON)        # { "x": 32.0, "y": 14.0 }

    image_path = Column(String)

    encounters = Column(JSON)         # List of encounter IDs
    is_safe_zone = Column(Boolean, default=False)
    is_fast_travel_point = Column(Boolean, default=False)
    has_respawn_point = Column(Boolean, default=False)

    tags = Column(JSON)               # List of string tags

