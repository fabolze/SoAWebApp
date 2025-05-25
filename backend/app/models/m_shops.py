from sqlalchemy import Column, String, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base



class Shop(Base):
    __tablename__ = 'shops'

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)

    location_id = Column(String, ForeignKey("locations.id"))
    npc_id = Column(String, ForeignKey("npcs.id"))
    requirements_id = Column(String, ForeignKey("requirements.id"))

    price_modifiers = Column(JSON)  # Keep as JSON for now (optional structure)
    tags = Column(JSON)  # List of string tags

    # Relationships
    location = relationship("Location")
    npc = relationship("NPC")
    requirements = relationship("Requirement")
    inventory = relationship("ShopInventory", back_populates="shop", cascade="all, delete-orphan")
