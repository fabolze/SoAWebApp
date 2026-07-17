# backend/app/models/m_locations.py

from sqlalchemy import Column, String, Boolean, Enum, ForeignKey, Integer, Text, JSON
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


class LocationType(enum.Enum):
    World = "World"
    Continent = "Continent"
    Region = "Region"
    Zone = "Zone"
    Subzone = "Subzone"
    Room = "Room"
    Interior = "Interior"


class PlaceKind(enum.Enum):
    Wilderness = "Wilderness"
    Settlement = "Settlement"
    Dungeon = "Dungeon"
    Interior = "Interior"
    Road = "Road"
    Waterway = "Waterway"
    Landmark = "Landmark"
    AbstractRegion = "AbstractRegion"
    Other = "Other"


class BiomeInheritance(enum.Enum):
    Own = "Own"
    InheritFromParent = "InheritFromParent"
    None_ = "None"
    Mixed = "Mixed"


class Location(Base):
    __tablename__ = 'locations'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)

    biome = Column(Enum(Biome))
    biome_modifier = Column(Enum(BiomeModifier))
    region = Column(String)
    place_kind = Column(Enum(PlaceKind))
    environment_tags = Column(JSON)
    biome_inheritance = Column(Enum(BiomeInheritance))

    parent_location_id = Column(String, ForeignKey("locations.id"))
    location_type = Column(Enum(LocationType), default=LocationType.Zone)
    sort_order = Column(Integer, default=0)
    is_playable_space = Column(Boolean, default=True)
    is_world_map_node = Column(Boolean, default=True)

    level_range = Column(JSON)        # { "min": 5, "max": 10 }
    coordinates = Column(JSON)        # { "x": 32.0, "y": 14.0 }

    image_path = Column(String)

    encounters = Column(JSON)         # List of encounter IDs
    is_safe_zone = Column(Boolean, default=False)
    is_fast_travel_point = Column(Boolean, default=False)
    has_respawn_point = Column(Boolean, default=False)
    variants = Column(JSON)  # Typed presentation/state overrides.

    tags = Column(JSON)               # List of string tags

