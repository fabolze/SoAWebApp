# backend/app/models/m_currencies.py

from sqlalchemy import Column, String, Enum, Text, Integer, Boolean, JSON
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum


class CurrencyType(enum.Enum):
    Soft = "Soft"
    Premium = "Premium"
    Token = "Token"


class Currency(Base):
    __tablename__ = 'currencies'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(CurrencyType), nullable=False, default=CurrencyType.Soft)
    description = Column(Text)

    code = Column(String)  # e.g. GOLD, GEM
    symbol = Column(String)  # e.g. G, GEM
    decimal_precision = Column(Integer, default=0)
    is_premium = Column(Boolean, default=False)

    icon_path = Column(String)
    tags = Column(JSON)  # Optional tagging for filtering

    def custom_serialization(self):
        data = {}
        if isinstance(self.type, CurrencyType):
            data["type"] = self.type.value
        return data
