# backend/app/models/m_combat_profiles.py

from sqlalchemy import Column, String, Enum, JSON, ForeignKey, Float
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
    Demon = "demon"
    Dragon = "dragon"
    Giant = "giant"
    Spirit = "spirit"
    Other = "other"

class Aggression(enum.Enum):
    Hostile = "Hostile"
    Neutral = "Neutral"
    Friendly = "Friendly"

class CombatProfile(Base):
    __tablename__ = "combat_profiles"

    id = Column(String, primary_key=True, default=generate_ulid)
    character_id = Column(String, ForeignKey("characters.id"), nullable=False, unique=True)

    enemy_type = Column(Enum(EnemyType))
    aggression = Column(Enum(Aggression))

    custom_stats = Column(JSON)
    custom_abilities = Column(JSON)
    tags = Column(JSON)

    loot_table = Column(JSON)
    currency_rewards = Column(JSON)
    reputation_rewards = Column(JSON)
    xp_reward = Column(Float)
    related_quests = Column(JSON)

    companion_config = Column(JSON)
