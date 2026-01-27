# backend/app/models/m_characters.py

from sqlalchemy import Column, String, Integer, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid



class Character(Base):
    __tablename__ = "characters"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    title = Column(String)
    description = Column(Text)
    image_path = Column(String)

    level = Column(Integer)
    class_id = Column(String, ForeignKey("characterclasses.id"))
    faction_id = Column(String, ForeignKey("factions.id"))
    home_location_id = Column(String, ForeignKey("locations.id"))

    tags = Column(JSON)

    class_template = relationship("CharacterClass")
    faction = relationship("Faction")
    home_location = relationship("Location")
