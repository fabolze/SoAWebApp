# backend/app/models/m_ability_links.py

from sqlalchemy import Column, String, Float, Integer, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum


class AbilityEffectPhase(enum.Enum):
    Cast = "Cast"
    Impact = "Impact"
    Aftermath = "Aftermath"
    WhileActive = "WhileActive"
    Deactivate = "Deactivate"


class AbilityRelationType(enum.Enum):
    Setup = "Setup"
    Payoff = "Payoff"
    Recovery = "Recovery"
    Upgrade = "Upgrade"
    Counter = "Counter"
    Variant = "Variant"


class AbilityEffectLink(Base):
    __tablename__ = 'ability_effect_links'

    id = Column(String, primary_key=True, default=generate_ulid)
    ability_id = Column(String, ForeignKey('abilities.id'), nullable=False)
    effect_id = Column(String, ForeignKey('effects.id'), nullable=False)
    phase = Column(Enum(AbilityEffectPhase), nullable=False, default=AbilityEffectPhase.Impact)
    turn_offset = Column(Float, nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)

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


class AbilityRelation(Base):
    __tablename__ = "ability_relations"
    __table_args__ = (
        UniqueConstraint("from_ability_id", "to_ability_id", "relation_type", name="uq_ability_relation"),
    )

    id = Column(String, primary_key=True, default=generate_ulid)
    from_ability_id = Column(String, ForeignKey("abilities.id"), nullable=False)
    to_ability_id = Column(String, ForeignKey("abilities.id"), nullable=False)
    relation_type = Column(Enum(AbilityRelationType), nullable=False)

    from_ability = relationship("Ability", foreign_keys=[from_ability_id], back_populates="outgoing_relations")
    to_ability = relationship("Ability", foreign_keys=[to_ability_id])
