# backend/app/models/m_statuses.py

from sqlalchemy import Column, String, Float, Boolean, Enum, Text, JSON, Integer
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum


class StatusCategory(enum.Enum):
    Buff = "Buff"
    Debuff = "Debuff"
    Control = "Control"
    DoT = "DoT"
    Other = "Other"


class StatusPolarity(enum.Enum):
    Beneficial = "Beneficial"
    Harmful = "Harmful"
    Neutral = "Neutral"


class StatusReapplicationPolicy(enum.Enum):
    RefreshDuration = "RefreshDuration"
    Replace = "Replace"
    Ignore = "Ignore"
    AddStackRefresh = "AddStackRefresh"
    AddIndependentStack = "AddIndependentStack"


class StatusStackDecayPolicy(enum.Enum):
    AllAtOnce = "AllAtOnce"
    OnePerDuration = "OnePerDuration"
    Independent = "Independent"


class Status(Base):
    __tablename__ = "statuses"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(Enum(StatusCategory))
    polarity = Column(Enum(StatusPolarity), default=StatusPolarity.Neutral)
    description = Column(Text)
    default_duration = Column(Float)
    stackable = Column(Boolean, default=False)
    max_stacks = Column(Integer)
    reapplication_policy = Column(Enum(StatusReapplicationPolicy), default=StatusReapplicationPolicy.RefreshDuration)
    stack_decay_policy = Column(Enum(StatusStackDecayPolicy), default=StatusStackDecayPolicy.AllAtOnce)
    can_cleanse = Column(Boolean, default=True)
    can_dispel = Column(Boolean, default=True)
    icon_path = Column(String)
    tags = Column(JSON)
