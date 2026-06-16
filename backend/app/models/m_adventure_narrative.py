import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class AdventureBeatType(enum.Enum):
    Hook = "Hook"
    Introduction = "Introduction"
    Discovery = "Discovery"
    Decision = "Decision"
    Conflict = "Conflict"
    Revelation = "Revelation"
    Reversal = "Reversal"
    Climax = "Climax"
    Recovery = "Recovery"
    Payoff = "Payoff"
    Other = "Other"


class AdventureBeatLinkTargetType(enum.Enum):
    Location = "location"
    Character = "character"
    Quest = "quest"
    Event = "event"
    Dialogue = "dialogue"
    Encounter = "encounter"
    LoreEntry = "lore_entry"
    Item = "item"
    Faction = "faction"
    StoryArc = "story_arc"


class AdventureBeatLinkRole(enum.Enum):
    Setting = "setting"
    Cast = "cast"
    PlayerJourney = "player_journey"
    Runtime = "runtime"
    State = "state"
    Reward = "reward"
    Reference = "reference"


class AdventureOccurrenceKind(enum.Enum):
    Appearance = "appearance"
    Transition = "transition"
    Reward = "reward"
    Requirement = "requirement"
    Consequence = "consequence"
    Reference = "reference"


class AdventureChangeType(enum.Enum):
    Introduced = "introduced"
    Active = "active"
    Changed = "changed"
    Unavailable = "unavailable"
    Restored = "restored"
    Destroyed = "destroyed"
    Obtained = "obtained"
    Lost = "lost"
    Stolen = "stolen"
    Consumed = "consumed"
    Joins = "joins"
    Leaves = "leaves"
    Captured = "captured"
    Injured = "injured"
    Dies = "dies"
    Returns = "returns"
    Transformed = "transformed"
    None_ = "none"


class AdventureImportance(enum.Enum):
    Critical = "critical"
    Major = "major"
    Minor = "minor"
    Background = "background"


class AdventureBeat(Base):
    __tablename__ = "adventure_beats"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    summary = Column(Text)
    beat_type = Column(Enum(AdventureBeatType), nullable=False, default=AdventureBeatType.Other)
    timeline_id = Column(String, ForeignKey("timelines.id"))
    story_arc_id = Column(String, ForeignKey("story_arcs.id"))
    sort_order = Column(Integer, nullable=False, default=0)
    intent = Column(Text)
    required_flags = Column(JSON)
    forbidden_flags = Column(JSON)
    expected_output_flags = Column(JSON)
    tags = Column(JSON)

    timeline = relationship("Timeline")
    story_arc = relationship("StoryArc")
    links = relationship(
        "AdventureBeatLink",
        back_populates="adventure_beat",
        foreign_keys="AdventureBeatLink.adventure_beat_id",
        cascade="all, delete-orphan",
    )


class AdventureBeatLink(Base):
    __tablename__ = "adventure_beat_links"
    __table_args__ = (
        UniqueConstraint(
            "adventure_beat_id",
            "target_type",
            "target_id",
            "role",
            name="uq_adventure_beat_link_target_role",
        ),
    )

    id = Column(String, primary_key=True, default=generate_ulid)
    adventure_beat_id = Column(String, ForeignKey("adventure_beats.id"), nullable=False)
    target_type = Column(Enum(AdventureBeatLinkTargetType), nullable=False)
    target_id = Column(String, nullable=False)
    role = Column(Enum(AdventureBeatLinkRole), nullable=False, default=AdventureBeatLinkRole.Reference)
    occurrence_kind = Column(Enum(AdventureOccurrenceKind), nullable=False, default=AdventureOccurrenceKind.Appearance)
    change_type = Column(Enum(AdventureChangeType), nullable=False, default=AdventureChangeType.Active)
    state_label = Column(String)
    starts_at_beat_id = Column(String, ForeignKey("adventure_beats.id"))
    ends_at_beat_id = Column(String, ForeignKey("adventure_beats.id"))
    continuity_group_id = Column(String)
    importance = Column(Enum(AdventureImportance), nullable=False, default=AdventureImportance.Major)
    sort_order = Column(Integer, nullable=False, default=0)
    notes = Column(Text)
    tags = Column(JSON)

    adventure_beat = relationship("AdventureBeat", back_populates="links", foreign_keys=[adventure_beat_id])
