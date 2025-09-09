# backend/app/models/m_items.py

from sqlalchemy import Column, String, Float, Enum, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum



class ItemType(enum.Enum):
    Weapon = "Weapon"
    Armor = "Armor"
    Consumable = "Consumable"
    Misc = "Misc"

class Rarity(enum.Enum):
    Common = "Common"
    Uncommon = "Uncommon"
    Rare = "Rare"
    Epic = "Epic"
    Legendary = "Legendary"

class EquipmentSlot(enum.Enum):
    head = "head"
    chest = "chest"
    legs = "legs"
    feet = "feet"
    main_hand = "main_hand"
    off_hand = "off_hand"
    accessory = "accessory"

class WeaponType(enum.Enum):
    Sword = "Sword"
    Axe = "Axe"
    Bow = "Bow"
    Staff = "Staff"
    Dagger = "Dagger"
    Mace = "Mace"

class Item(Base):
    __tablename__ = 'items'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(ItemType), nullable=False)
    rarity = Column(Enum(Rarity))
    description = Column(Text)

    equipment_slot = Column(Enum(EquipmentSlot))
    weapon_type = Column(Enum(WeaponType))

    # Flattened important stats
    stat_damage = Column(Float)
    stat_defense = Column(Float)
    stat_crit_chance = Column(Float)
    stat_weight = Column(Float)

    attr_strength = Column(Float)
    attr_dexterity = Column(Float)
    attr_vitality = Column(Float)
    attr_intelligence = Column(Float)

    effects = Column(JSON)  # Array of strings
    tags = Column(JSON)  # List of string tags
    icon_path = Column(String)

    requirements_id = Column(String, ForeignKey('requirements.id'))  # FK to shared requirements
    requirements = relationship("Requirement")  # Optional: back_populates if needed


