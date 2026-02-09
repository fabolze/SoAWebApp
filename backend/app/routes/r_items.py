from flask import request, jsonify
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_items import (
    Item,
    ItemType,
    Rarity,
    EquipmentSlot,
    WeaponType,
    DamageType,
    WeaponRangeType,
    ModifierValueType,
)
from backend.app.models.m_items import ItemStatModifier, ItemAttributeModifier
from backend.app.models.m_stats import Stat, ScalingBehavior as StatScalingBehavior
from backend.app.models.m_attributes import Attribute
from backend.app.models.m_attribute_stat_link import ScaleType as AttributeScaleType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_effects import Effect
from backend.app.models.m_currencies import Currency
from backend.app.db.init_db import get_db_session
from typing import Any, Dict, List
from sqlalchemy.orm import Session


class ItemRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Item,
            blueprint_name='items',
            route_prefix='/api/items'
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "type", "base_price"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: Item, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": ItemType,
            "rarity": Rarity,
            "equipment_slot": EquipmentSlot,
            "weapon_type": WeaponType,
            "damage_type": DamageType,
            "weapon_range_type": WeaponRangeType,
        })

        # Validate relationships
        self.validate_relationships(db_session, data, {
            "requirements_id": Requirement,
            "base_currency_id": Currency
        })

        # Effects validation if provided
        if "effects" in data and data["effects"]:
            for effect_id in data["effects"]:
                if not db_session.get(Effect, effect_id):
                    raise ValueError(f"Invalid effect_id: {effect_id}")

        # Update fields
        item.slug = data["slug"]
        item.name = data["name"]
        item.type = data["type"]  # Already converted to enum
        item.base_price = float(data["base_price"])
        item.base_currency_id = data.get("base_currency_id")

        # Optional enum fields (already validated)
        item.rarity = data.get("rarity")
        item.equipment_slot = data.get("equipment_slot")
        item.weapon_type = data.get("weapon_type")
        item.damage_type = data.get("damage_type")
        item.weapon_range_type = data.get("weapon_range_type")

        weapon_range_value = data.get("weapon_range")
        if weapon_range_value is None:
            item.weapon_range = None
        else:
            try:
                item.weapon_range = int(weapon_range_value)
            except (TypeError, ValueError) as exc:
                raise ValueError("weapon_range must be an integer") from exc

        # Optional fields
        item.description = data.get("description")

        # Relationship fields
        item.requirements_id = data.get("requirements_id")

        # JSON fields
        item.effects = data.get("effects") or []
        item.tags = data.get("tags") or []

        # Additional fields
        item.icon_path = data.get("icon_path")

        # Replace stat modifiers when provided
        if "stat_modifiers" in data:
            incoming_modifiers = data.get("stat_modifiers") or []
            item.stat_modifiers[:] = []
            for idx, entry in enumerate(incoming_modifiers):
                if not isinstance(entry, dict):
                    raise ValueError("stat_modifiers entries must be objects")
                stat_id = entry.get("stat_id")
                if not stat_id:
                    raise ValueError("stat_modifiers entries require stat_id")
                if not db_session.get(Stat, stat_id):
                    raise ValueError(f"Invalid stat_id: {stat_id}")
                value = entry.get("value")
                if value is None:
                    raise ValueError("stat_modifiers entries require value")
                try:
                    value_type = ModifierValueType(entry.get("value_type", ModifierValueType.Flat.value))
                except ValueError as exc:
                    raise ValueError(f"Invalid value_type for stat modifier: {entry.get('value_type')}" ) from exc
                scaling_behavior = entry.get("scaling_behavior")
                if scaling_behavior == "Custom Curve":
                    scaling_behavior = "Custom"
                scaling_enum = None
                if scaling_behavior:
                    try:
                        scaling_enum = StatScalingBehavior(scaling_behavior)
                    except ValueError as exc:
                        raise ValueError(f"Invalid scaling_behavior for stat modifier: {scaling_behavior}") from exc
                modifier = ItemStatModifier(
                    stat_id=stat_id,
                    value=float(value),
                    value_type=value_type,
                    scaling_behavior=scaling_enum,
                    notes=entry.get("notes"),
                    order_index=entry.get("order_index", idx),
                )
                if entry.get("id"):
                    modifier.id = entry["id"]
                item.stat_modifiers.append(modifier)

        # Replace attribute modifiers when provided
        if "attribute_modifiers" in data:
            incoming_attributes = data.get("attribute_modifiers") or []
            item.attribute_modifiers[:] = []
            for idx, entry in enumerate(incoming_attributes):
                if not isinstance(entry, dict):
                    raise ValueError("attribute_modifiers entries must be objects")
                attribute_id = entry.get("attribute_id")
                if not attribute_id:
                    raise ValueError("attribute_modifiers entries require attribute_id")
                if not db_session.get(Attribute, attribute_id):
                    raise ValueError(f"Invalid attribute_id: {attribute_id}")
                value = entry.get("value")
                if value is None:
                    raise ValueError("attribute_modifiers entries require value")
                scaling = entry.get("scaling")
                if scaling == "Custom Curve":
                    scaling = "Custom"
                scaling_enum = None
                if scaling:
                    try:
                        scaling_enum = AttributeScaleType(scaling)
                    except ValueError as exc:
                        raise ValueError(f"Invalid scaling for attribute modifier: {scaling}") from exc
                modifier = ItemAttributeModifier(
                    attribute_id=attribute_id,
                    value=float(value),
                    scaling=scaling_enum,
                    notes=entry.get("notes"),
                    order_index=entry.get("order_index", idx),
                )
                if entry.get("id"):
                    modifier.id = entry["id"]
                item.attribute_modifiers.append(modifier)

    def serialize_item(self, item: Item) -> Dict[str, Any]:
        data = {
            "id": item.id,
            "slug": item.slug,
            "name": item.name,
            "type": item.type.value if item.type else None,
            "rarity": item.rarity.value if item.rarity else None,
            "description": item.description,
            "base_price": item.base_price,
            "base_currency_id": item.base_currency_id,
            "equipment_slot": item.equipment_slot.value if item.equipment_slot else None,
            "weapon_type": item.weapon_type.value if item.weapon_type else None,
            "damage_type": item.damage_type.value if item.damage_type else None,
            "weapon_range_type": item.weapon_range_type.value if item.weapon_range_type else None,
            "weapon_range": item.weapon_range,
            "effects": item.effects or [],
            "tags": item.tags or [],
            "icon_path": item.icon_path,
            "requirements_id": item.requirements_id,
            "stat_modifiers": [],
            "attribute_modifiers": [],
        }

        stat_modifiers = sorted(
            item.stat_modifiers,
            key=lambda mod: (
                mod.order_index if mod.order_index is not None else 0,
                mod.id or ""
            ),
        )
        for mod in stat_modifiers:
            data["stat_modifiers"].append({
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
            })

        attribute_modifiers = sorted(
            item.attribute_modifiers,
            key=lambda mod: (
                mod.order_index if mod.order_index is not None else 0,
                mod.id or ""
            ),
        )
        for mod in attribute_modifiers:
            data["attribute_modifiers"].append({
                "id": mod.id,
                "item_id": mod.item_id,
                "attribute_id": mod.attribute_id,
                "attribute_slug": mod.attribute.slug if mod.attribute else None,
                "attribute_name": mod.attribute.name if mod.attribute else None,
                "value": mod.value,
                "scaling": mod.scaling.value if mod.scaling else None,
                "notes": mod.notes,
                "order_index": mod.order_index,
            })

        return data

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%")) |
                    (self.model.id.ilike(f"%{search}%"))
                )
            if tags:
                # Filter items where any tag matches (case-insensitive, partial)
                query = query.filter(self.model.tags != None)
                for tag in tags:
                    tag = tag.strip()
                    if tag:
                        query = query.filter(
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()


# Create the route instance
bp = ItemRoute().bp

