from typing import Any, Dict, List, Optional

from flask import Blueprint, abort, jsonify

from backend.app.db.init_db import get_db_session
from backend.app.models.m_currencies import Currency
from backend.app.models.m_effects import Effect
from backend.app.models.m_items import Item
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.utils.pricing import compute_shop_price

bp = Blueprint("ui_items", __name__)


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _currency(currency: Optional[Currency]) -> Optional[Dict[str, Any]]:
    if not currency:
        return None
    return {
        "id": currency.id,
        "slug": currency.slug,
        "name": currency.name,
        "code": currency.code,
        "symbol": currency.symbol,
        "type": _enum_value(currency.type),
        "decimal_precision": currency.decimal_precision,
        "is_premium": currency.is_premium,
        "icon_path": currency.icon_path,
    }


def _requirement(requirement: Optional[Requirement]) -> Optional[Dict[str, Any]]:
    if not requirement:
        return None
    return {
        "id": requirement.id,
        "slug": requirement.slug,
        "tags": requirement.tags or [],
        "required_flags": [
            {"id": row.id, "flag_id": row.flag_id}
            for row in sorted(requirement.required_flags, key=lambda row: (row.flag_id or "", row.id or ""))
        ],
        "forbidden_flags": [
            {"id": row.id, "flag_id": row.flag_id}
            for row in sorted(requirement.forbidden_flags, key=lambda row: (row.flag_id or "", row.id or ""))
        ],
        "min_faction_reputation": [
            {"id": row.id, "faction_id": row.faction_id, "min_value": row.min_value}
            for row in sorted(requirement.min_faction_reputation, key=lambda row: (row.faction_id or "", row.id or ""))
        ],
    }


def _effect(effect: Effect) -> Dict[str, Any]:
    return {
        "id": effect.id,
        "slug": effect.slug,
        "name": effect.name,
        "type": _enum_value(effect.type),
        "description": effect.description,
        "target": _enum_value(effect.target),
        "duration": effect.duration,
        "value_type": _enum_value(effect.value_type),
        "value": effect.value,
        "trigger_condition": _enum_value(effect.trigger_condition),
        "icon_path": effect.icon_path,
        "tags": effect.tags or [],
    }


def _stat_modifier(modifier: Any) -> Dict[str, Any]:
    return {
        "id": modifier.id,
        "kind": "stat",
        "target_id": modifier.stat_id,
        "target_slug": modifier.stat.slug if modifier.stat else None,
        "target_name": modifier.stat.name if modifier.stat else modifier.stat_id,
        "value": modifier.value,
        "value_type": _enum_value(modifier.value_type),
        "scaling": _enum_value(modifier.scaling_behavior),
        "notes": modifier.notes,
        "order_index": modifier.order_index,
    }


def _attribute_modifier(modifier: Any) -> Dict[str, Any]:
    return {
        "id": modifier.id,
        "kind": "attribute",
        "target_id": modifier.attribute_id,
        "target_slug": modifier.attribute.slug if modifier.attribute else None,
        "target_name": modifier.attribute.name if modifier.attribute else modifier.attribute_id,
        "value": modifier.value,
        "value_type": "Flat",
        "scaling": _enum_value(modifier.scaling),
        "notes": modifier.notes,
        "order_index": modifier.order_index,
    }


def _shop_source(entry: ShopInventory) -> Dict[str, Any]:
    shop = entry.shop
    pricing = compute_shop_price(entry.item, entry, shop)
    currency = entry.currency or (shop.currency if shop else None) or entry.item.base_currency
    return {
        "shop_id": entry.shop_id,
        "shop_slug": shop.slug if shop else None,
        "shop_name": shop.name if shop else entry.shop_id,
        "inventory_id": entry.id,
        "inventory_slug": entry.slug,
        "stock": entry.stock,
        "requirements": _requirement(entry.requirements),
        "currency": _currency(currency),
        "pricing": pricing,
        "price_layers": pricing.get("breakdown", {}),
        "tags": entry.tags or [],
    }


@bp.get("/api/ui/items/<item_id>")
def get_item_view(item_id: str):
    db_session = get_db_session()
    try:
        item = db_session.get(Item, item_id)
        if not item:
            abort(404, description=f"Item {item_id} not found")

        effects: List[Effect] = []
        for effect_id in item.effects or []:
            effect = db_session.get(Effect, effect_id)
            if effect:
                effects.append(effect)

        shop_entries = (
            db_session.query(ShopInventory)
            .filter(ShopInventory.item_id == item.id)
            .all()
        )
        effects = sorted(effects, key=lambda effect: ((effect.name or "").lower(), effect.id or ""))
        stat_modifiers = sorted(
            item.stat_modifiers,
            key=lambda modifier: (
                modifier.order_index if modifier.order_index is not None else 0,
                (modifier.stat.name if modifier.stat else modifier.stat_id or "").lower(),
                modifier.id or "",
            ),
        )
        attribute_modifiers = sorted(
            item.attribute_modifiers,
            key=lambda modifier: (
                modifier.order_index if modifier.order_index is not None else 0,
                (modifier.attribute.name if modifier.attribute else modifier.attribute_id or "").lower(),
                modifier.id or "",
            ),
        )
        shop_sources = sorted(
            (_shop_source(entry) for entry in shop_entries),
            key=lambda source: ((source.get("shop_name") or "").lower(), (source.get("inventory_slug") or "").lower()),
        )

        return jsonify({
            "id": item.id,
            "slug": item.slug,
            "name": item.name,
            "type": _enum_value(item.type),
            "rarity": _enum_value(item.rarity),
            "description": item.description,
            "base_price": item.base_price,
            "base_currency": _currency(item.base_currency),
            "equipment_slot": _enum_value(item.equipment_slot),
            "weapon_type": _enum_value(item.weapon_type),
            "damage_type": _enum_value(item.damage_type),
            "weapon_range_type": _enum_value(item.weapon_range_type),
            "weapon_range": item.weapon_range,
            "icon_path": item.icon_path,
            "tags": item.tags or [],
            "requirements": _requirement(item.requirements),
            "effects": [_effect(effect) for effect in effects],
            "stat_modifiers": [_stat_modifier(modifier) for modifier in stat_modifiers],
            "attribute_modifiers": [_attribute_modifier(modifier) for modifier in attribute_modifiers],
            "shop_sources": shop_sources,
        })
    finally:
        db_session.close()
