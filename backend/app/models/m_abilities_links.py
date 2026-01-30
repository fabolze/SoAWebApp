# backend/app/models/m_ability_links.py

from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class AbilityEffectLink(Base):
    __tablename__ = 'ability_effect_links'

    id = Column(String, primary_key=True, default=generate_ulid)
    ability_id = Column(String, ForeignKey('abilities.id'), nullable=False)
    effect_id = Column(String, ForeignKey('effects.id'), nullable=False)

    ability = relationship("Ability", back_populates="effects")
    effect = relationship("Effect")

class AbilityScalingLink(Base):
    __tablename__ = 'ability_scaling_links'

    id = Column(String, primary_key=True, default=generate_ulid)
    ability_id = Column(String, ForeignKey('abilities.id'), nullable=False)
    stat_id = Column(String, ForeignKey('stats.id'), nullable=False)
    multiplier = Column(Float, nullable=False)

    ability = relationship("Ability", back_populates="scaling")
    stat = relationship("Stat")
