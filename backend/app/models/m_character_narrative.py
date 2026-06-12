import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class CharacterBeatType(enum.Enum):
    Entrance = "Entrance"
    Decision = "Decision"
    Revelation = "Revelation"
    Conflict = "Conflict"
    Change = "Change"
    Reaction = "Reaction"
    Exit = "Exit"
    Other = "Other"


class CharacterStoryProfile(Base):
    __tablename__ = "character_story_profiles"

    id = Column(String, primary_key=True, default=generate_ulid)
    character_id = Column(String, ForeignKey("characters.id"), nullable=False, unique=True)
    public_face = Column(Text)
    private_truth = Column(Text)
    want = Column(Text)
    need = Column(Text)
    fear = Column(Text)
    duty = Column(Text)
    contradiction = Column(Text)
    secret = Column(Text)
    voice_notes = Column(Text)
    arc_summary = Column(Text)
    author_notes = Column(Text)
    tags = Column(JSON)

    character = relationship("Character")


class CharacterRelationship(Base):
    __tablename__ = "character_relationships"
    __table_args__ = (
        UniqueConstraint("from_character_id", "to_character_id", name="uq_character_relationship_direction"),
    )

    id = Column(String, primary_key=True, default=generate_ulid)
    from_character_id = Column(String, ForeignKey("characters.id"), nullable=False)
    to_character_id = Column(String, ForeignKey("characters.id"), nullable=False)
    relationship_type = Column(String, nullable=False)
    summary = Column(Text)
    public_stance = Column(Text)
    private_stance = Column(Text)
    trust = Column(Integer, nullable=False, default=0)
    tension = Column(Integer, nullable=False, default=0)
    influence = Column(Integer, nullable=False, default=0)
    is_secret = Column(Boolean, nullable=False, default=False)
    tags = Column(JSON)

    from_character = relationship("Character", foreign_keys=[from_character_id])
    to_character = relationship("Character", foreign_keys=[to_character_id])


class CharacterStoryBeat(Base):
    __tablename__ = "character_story_beats"

    id = Column(String, primary_key=True, default=generate_ulid)
    character_id = Column(String, ForeignKey("characters.id"), nullable=False)
    title = Column(String, nullable=False)
    beat_type = Column(Enum(CharacterBeatType), nullable=False, default=CharacterBeatType.Other)
    sort_order = Column(Integer, nullable=False, default=0)
    quest_id = Column(String, ForeignKey("quests.id"))
    dialogue_id = Column(String, ForeignKey("dialogues.id"))
    encounter_id = Column(String, ForeignKey("encounters.id"))
    event_id = Column(String, ForeignKey("events.id"))
    location_id = Column(String, ForeignKey("locations.id"))
    story_arc_id = Column(String, ForeignKey("story_arcs.id"))
    summary = Column(Text)
    state_before = Column(Text)
    state_after = Column(Text)
    player_impact = Column(Text)
    world_impact = Column(Text)
    required_flags = Column(JSON)
    forbidden_flags = Column(JSON)
    expected_output_flags = Column(JSON)
    relationship_changes = Column(JSON)
    tags = Column(JSON)

    character = relationship("Character")
    quest = relationship("Quest")
    dialogue = relationship("Dialogue")
    encounter = relationship("Encounter")
    event = relationship("Event")
    location = relationship("Location")
    story_arc = relationship("StoryArc")
