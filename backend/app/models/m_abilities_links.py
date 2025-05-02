# backend/app/models/m_ability_links.py

from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base


class AbilityEffectLink(Base):
    __tablename__ = 'ability_effect_links'

    id = Column(Integer, primary_key=True, autoincrement=True)
    ability_id = Column(String, ForeignKey('abilities.id'), nullable=False)
    effect_id = Column(String, ForeignKey('effects.id'), nullable=False)

    ability = relationship("Ability", back_populates="effects")
    effect = relationship("Effect")

class AbilityScalingLink(Base):
    __tablename__ = 'ability_scaling_links'

    id = Column(Integer, primary_key=True, autoincrement=True)
    ability_id = Column(String, ForeignKey('abilities.id'), nullable=False)
    attribute_id = Column(String, ForeignKey('attributes.id'), nullable=False)
    multiplier = Column(Float, nullable=False)

    ability = relationship("Ability", back_populates="scaling")
    attribute = relationship("Attribute")
