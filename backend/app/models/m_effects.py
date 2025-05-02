from sqlalchemy import Column, String, Float, Boolean, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
import enum



# Keep real enums like effect type, trigger condition
class EffectType(enum.Enum):
    Status = "Status"
    Damage = "Damage"
    Heal = "Heal"
    Modifier = "Modifier"
    Reflect = "Reflect"
    Summon = "Summon"
    Shield = "Shield"
    Control = "Control"

class EffectTarget(enum.Enum):
    Self = "Self"
    Enemy = "Enemy"
    Ally = "Ally"
    All = "All"
    Area = "Area"

class ValueInterpretation(enum.Enum):
    Flat = "Flat"
    Percentage = "Percentage"
    None_ = "None"

class TriggerCondition(enum.Enum):
    None_ = "None"
    OnHit = "On Hit"
    WhenDamaged = "When Damaged"
    OnKill = "On Kill"
    OnCast = "On Cast"
    Passive = "Passive"

class Effect(Base):
    __tablename__ = 'effects'

    effect_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(Enum(EffectType), nullable=False)
    description = Column(Text)

    target = Column(Enum(EffectTarget), nullable=False)
    duration = Column(Float)

    value_type = Column(Enum(ValueInterpretation))
    value = Column(Float)

    attribute_id = Column(String, ForeignKey('attributes.id'))
    attribute = relationship("Attribute")

    scaling_stat_id = Column(String, ForeignKey('stats.id'))
    scaling_stat = relationship("Stat")

    trigger_condition = Column(Enum(TriggerCondition))

    stackable = Column(Boolean, default=False)
    set_bonus_group = Column(String)

    icon_path = Column(String)
    related_items = Column(JSON)
