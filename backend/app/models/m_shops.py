from sqlalchemy import Column, String, Text, JSON, ForeignKey, Float
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid



class Shop(Base):
    __tablename__ = 'shops'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)

    price_modifier = Column(Float, default=0.0)
    price_multiplier = Column(Float, default=1.0)
    price_override = Column(Float)
    currency_id = Column(String, ForeignKey('currencies.id'))

    location_id = Column(String, ForeignKey("locations.id"))
    character_id = Column(String, ForeignKey("characters.id"))
    requirements_id = Column(String, ForeignKey("requirements.id"))

    price_modifiers = Column(JSON)  # Keep as JSON for now (optional structure)
    tags = Column(JSON)  # List of string tags

    # Relationships
    location = relationship("Location")
    character = relationship("Character")
    currency = relationship("Currency")
    requirements = relationship("Requirement")
    inventory = relationship("ShopInventory", back_populates="shop", cascade="all, delete-orphan")
