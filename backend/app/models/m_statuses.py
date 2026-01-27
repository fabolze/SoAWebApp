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


class Status(Base):
    __tablename__ = "statuses"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(Enum(StatusCategory))
    description = Column(Text)
    default_duration = Column(Float)
    stackable = Column(Boolean, default=False)
    max_stacks = Column(Integer)
    icon_path = Column(String)
    tags = Column(JSON)
