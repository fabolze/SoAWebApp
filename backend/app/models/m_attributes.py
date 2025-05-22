# backend/app/models/m_attributes.py

from sqlalchemy import Column, String, Float, Enum, Text, JSON
from backend.app.models.base import Base
from sqlalchemy.orm import relationship
import enum



class AttrValueType(enum.Enum):
    Int = "int"
    Float = "float"

class AttrScalingType(enum.Enum):
    None_ = "None"
    Linear = "Linear"
    Exponential = "Exponential"
    Logarithmic = "Logarithmic"

class Attribute(Base):
    __tablename__ = 'attributes'

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    value_type = Column(Enum(AttrValueType), nullable=False)
    default_value = Column(Float)
    min_value = Column(Float)
    max_value = Column(Float)
    scaling = Column(Enum(AttrScalingType))
    used_in = Column(JSON)  # ["Item", "Character", ...]
    icon_path = Column(String)
    tags = Column(JSON)  # List of string tags

    scaling_links = relationship("AttributeStatLink", back_populates="attribute", cascade="all, delete-orphan")
