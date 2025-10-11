# backend/app/models/m_stats.py

from sqlalchemy import Column, String, Float, Enum, Text, JSON
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum



class StatCategory(enum.Enum):
    Attribute = "Attribute"
    Combat = "Combat"
    Defense = "Defense"
    Magic = "Magic"
    Support = "Support"

class ValueType(enum.Enum):
    Int = "int"
    Float = "float"
    Percentage = "percentage"

class ScalingBehavior(enum.Enum):
    None_ = "None"
    Linear = "Linear"
    Exponential = "Exponential"
    CustomCurve = "Custom Curve"

class Stat(Base):
    __tablename__ = 'stats'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(Enum(StatCategory), nullable=False)
    description = Column(Text)
    value_type = Column(Enum(ValueType), nullable=False)
    default_value = Column(Float)
    min_value = Column(Float)
    max_value = Column(Float)
    scaling_behavior = Column(Enum(ScalingBehavior))
    applies_to = Column(JSON)  # List of strings: ["Item", "Character", ...]
    icon_path = Column(String)
    tags = Column(JSON)  # List of string tags
