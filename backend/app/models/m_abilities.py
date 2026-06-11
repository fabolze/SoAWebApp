# backend/app/models/m_abilities.py

from sqlalchemy import Column, String, Float, Integer, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
from backend.app.models.m_items import DamageType
import enum



class AbilityType(enum.Enum):
    Active = "Active"
    Passive = "Passive"
    Toggle = "Toggle"

class Targeting(enum.Enum):
    Single = "Single"
    Area = "Area"
    Self = "Self"
    Allies = "Allies"
    Enemies = "Enemies"

class TriggerCondition(enum.Enum):
    OnUse = "On Use"
    Passive = "Passive"
    OnHit = "On Hit"
    WhenDamaged = "When Damaged"
    OnKill = "On Kill"


class DamageTypeSource(enum.Enum):
    Weapon = "Weapon"
    Fixed = "Fixed"
    None_ = "None"

class Ability(Base):
    __tablename__ = 'abilities'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(AbilityType), nullable=False)

    icon_path = Column(String)
    description = Column(Text)

    resource_cost = Column(Float)
    cooldown = Column(Float)
    cast_time = Column(Float, default=0)
    recovery_time = Column(Float, default=0)
    upkeep_cost = Column(Float, default=0)
    max_targets = Column(Integer)
    targeting = Column(Enum(Targeting))
    trigger_condition = Column(Enum(TriggerCondition))
    damage_type_source = Column(Enum(DamageTypeSource), default=DamageTypeSource.None_)
    damage_type = Column(Enum(DamageType))

    legacy_requirements = Column("requirements", JSON)  # Legacy JSON payload kept for existing data.
    requirements_id = Column(String, ForeignKey('requirements.id'))
    design_intent = Column(Text)
    counterplay_notes = Column(Text)
    mastery_notes = Column(Text)
    presentation_notes = Column(Text)
    tags = Column(JSON)  # List of string tags

    # Relationships
    requirements = relationship("Requirement")
    effects = relationship("AbilityEffectLink", back_populates="ability", cascade="all, delete-orphan")
    scaling = relationship("AbilityScalingLink", back_populates="ability", cascade="all, delete-orphan")
    outgoing_relations = relationship(
        "AbilityRelation",
        foreign_keys="AbilityRelation.from_ability_id",
        back_populates="from_ability",
        cascade="all, delete-orphan",
    )
