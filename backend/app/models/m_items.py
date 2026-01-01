# backend/app/models/m_items.py

from sqlalchemy import Column, String, Float, Enum, Text, JSON, ForeignKey, Integer
from sqlalchemy.orm import relationship
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
from backend.app.models.m_stats import ScalingBehavior as StatScalingBehavior
from backend.app.models.m_attribute_stat_link import ScaleType as AttributeScaleType
import enum


class ItemType(enum.Enum):
    Weapon = "Weapon"
    Armor = "Armor"
    Accessory = "Accessory"
    Consumable = "Consumable"
    Tool = "Tool"
    Material = "Material"
    Upgrade = "Upgrade"
    Quest = "Quest"
    SetPiece = "SetPiece"
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
    hands = "hands"
    belt = "belt"
    ring = "ring"
    amulet = "amulet"
    back = "back"
    main_hand = "main_hand"
    off_hand = "off_hand"
    two_hand = "two_hand"
    accessory = "accessory"
    mount = "mount"
    pet = "pet"


class WeaponType(enum.Enum):
    Greatsword = "Greatsword"
    Longsword = "Longsword"
    Shortsword = "Shortsword"
    Dagger = "Dagger"
    Rapier = "Rapier"
    Axe = "Axe"
    Greataxe = "Greataxe"
    Hammer = "Hammer"
    Mace = "Mace"
    Spear = "Spear"
    Polearm = "Polearm"
    Halberd = "Halberd"
    Staff = "Staff"
    Wand = "Wand"
    Tome = "Tome"
    Bow = "Bow"
    Crossbow = "Crossbow"
    Firearm = "Firearm"
    Thrown = "Thrown"
    Unarmed = "Unarmed"
    Shield = "Shield"
    Focus = "Focus"
    Instrument = "Instrument"


class DamageType(enum.Enum):
    Slashing = "Slashing"
    Piercing = "Piercing"
    Blunt = "Blunt"
    Elemental = "Elemental"
    Poison = "Poison"
    Psychic = "Psychic"
    Holy = "Holy"
    Void = "Void"


class WeaponRangeType(enum.Enum):
    Melee = "melee"
    Range = "range"


class ModifierValueType(enum.Enum):
    Flat = "Flat"
    Percentage = "Percentage"
    Multiplier = "Multiplier"


class Item(Base):
    __tablename__ = 'items'

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(Enum(ItemType), nullable=False)
    rarity = Column(Enum(Rarity))
    description = Column(Text)

    base_price = Column(Float, nullable=False, default=0.0)
    base_currency_id = Column(String, ForeignKey('currencies.id'))

    equipment_slot = Column(Enum(EquipmentSlot))
    weapon_type = Column(Enum(WeaponType))
    damage_type = Column(Enum(DamageType))
    weapon_range_type = Column(Enum(WeaponRangeType))
    weapon_range = Column(Integer)

    effects = Column(JSON)
    tags = Column(JSON)
    icon_path = Column(String)

    requirements_id = Column(String, ForeignKey('requirements.id'))
    base_currency = relationship("Currency")
    requirements = relationship("Requirement")

    stat_modifiers = relationship(
        "ItemStatModifier",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="ItemStatModifier.order_index"
    )
    attribute_modifiers = relationship(
        "ItemAttributeModifier",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="ItemAttributeModifier.order_index"
    )

    def custom_serialization(self):
        def _serialize_stat_modifier(mod):
            return {
                "id": mod.id,
                "item_id": mod.item_id,
                "stat_id": mod.stat_id,
                "stat_slug": mod.stat.slug if mod.stat else None,
                "stat_name": mod.stat.name if mod.stat else None,
                "value": mod.value,
                "value_type": mod.value_type.value if mod.value_type else None,
                "scaling_behavior": mod.scaling_behavior.value if mod.scaling_behavior else None,
                "notes": mod.notes,
                "order_index": mod.order_index,
            }

        def _serialize_attribute_modifier(mod):
            return {
                "id": mod.id,
                "item_id": mod.item_id,
                "attribute_id": mod.attribute_id,
                "attribute_slug": mod.attribute.slug if mod.attribute else None,
                "attribute_name": mod.attribute.name if mod.attribute else None,
                "value": mod.value,
                "scaling": mod.scaling.value if mod.scaling else None,
                "notes": mod.notes,
                "order_index": mod.order_index,
            }

        return {
            "stat_modifiers": [_serialize_stat_modifier(mod) for mod in self.stat_modifiers],
            "attribute_modifiers": [_serialize_attribute_modifier(mod) for mod in self.attribute_modifiers],
        }


class ItemStatModifier(Base):
    __tablename__ = 'item_stat_modifiers'

    id = Column(String, primary_key=True, default=generate_ulid)
    item_id = Column(String, ForeignKey('items.id', ondelete='CASCADE'), nullable=False)
    stat_id = Column(String, ForeignKey('stats.id'), nullable=False)
    value = Column(Float, nullable=False)
    value_type = Column(Enum(ModifierValueType), nullable=False, default=ModifierValueType.Flat)
    scaling_behavior = Column(Enum(StatScalingBehavior))
    notes = Column(Text)
    order_index = Column(Integer)

    item = relationship("Item", back_populates="stat_modifiers")
    stat = relationship("Stat")


class ItemAttributeModifier(Base):
    __tablename__ = 'item_attribute_modifiers'

    id = Column(String, primary_key=True, default=generate_ulid)
    item_id = Column(String, ForeignKey('items.id', ondelete='CASCADE'), nullable=False)
    attribute_id = Column(String, ForeignKey('attributes.id'), nullable=False)
    value = Column(Float, nullable=False)
    scaling = Column(Enum(AttributeScaleType))
    notes = Column(Text)
    order_index = Column(Integer)

    item = relationship("Item", back_populates="attribute_modifiers")
    attribute = relationship("Attribute")
