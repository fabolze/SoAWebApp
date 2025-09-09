# backend/app/models/m_enemies.py

from sqlalchemy import Column, String, Integer, Float, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum



class EnemyType(enum.Enum):
    Beast = "beast"
    Undead = "undead"
    Humanoid = "humanoid"
    Elemental = "elemental"
    Machine = "machine"
    Boss = "boss"

class Aggression(enum.Enum):
    Hostile = "Hostile"
    Neutral = "Neutral"
    Friendly = "Friendly"

class Enemy(Base):
    __tablename__ = 'enemies'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(EnemyType))
    level = Column(Integer, nullable=False)
    description = Column(Text)
    image_path = Column(String)

    class_id = Column(String, ForeignKey('characterclasses.id'))
    faction_id = Column(String, ForeignKey('factions.id'))

    aggression = Column(Enum(Aggression))

    custom_stats = Column(JSON)              # Optional override
    custom_abilities = Column(JSON)          # List of ability IDs
    tags = Column(JSON)

    loot_table = Column(JSON)                # [{ item_id, drop_chance }]
    related_quests = Column(JSON)            # List of quest IDs

    class_template = relationship("CharacterClass")
