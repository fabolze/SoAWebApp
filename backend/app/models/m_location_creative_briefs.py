from sqlalchemy import Column, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class LocationCreativeBrief(Base):
    __tablename__ = "location_creative_briefs"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    location_id = Column(String, ForeignKey("locations.id"), nullable=False)
    mood = Column(Text)
    visual_ideas = Column(Text)
    concept_refs = Column(JSON)
    ambience_ideas = Column(Text)
    music_state = Column(String)
    vfx_ideas = Column(Text)
    asset_ideas = Column(Text)
    landmarks = Column(JSON)
    story_notes = Column(Text)
    tags = Column(JSON)

    location = relationship("Location", foreign_keys=[location_id])
