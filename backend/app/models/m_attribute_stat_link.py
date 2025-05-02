# backend/app/models/m_attribute_stat_link.py

from sqlalchemy import Column, Integer, String, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
import enum



class ScaleType(enum.Enum):
    Linear = "Linear"
    Exponential = "Exponential"
    Custom = "Custom"

class AttributeStatLink(Base):
    __tablename__ = 'attribute_stat_links'

    id = Column(Integer, primary_key=True, autoincrement=True)
    attribute_id = Column(String, ForeignKey("attributes.id"), nullable=False)
    stat_id = Column(String, ForeignKey("stats.id"), nullable=False)
    scale = Column(Enum(ScaleType), nullable=False)
    multiplier = Column(Float, nullable=False)

    attribute = relationship("Attribute", back_populates="scaling_links")
    stat = relationship("Stat")
