from sqlalchemy import Column, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class LocationEncounterTable(Base):
    __tablename__ = "location_encounter_tables"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    location_id = Column(String, ForeignKey("locations.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    spawn_rules = Column(Text)
    environmental_modifiers = Column(JSON)
    requirements_id = Column(String, ForeignKey("requirements.id"))
    encounter_entries = Column(JSON)
    tags = Column(JSON)

    location = relationship("Location", foreign_keys=[location_id])
    requirements = relationship("Requirement")
