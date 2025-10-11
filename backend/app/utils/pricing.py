from typing import Any, Dict, Optional

DEFAULT_SELL_RATIO = 0.5


def _to_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    """Best-effort conversion of a value to float, returning the default when conversion fails."""
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _apply_pricing_layer(current_price: float, multiplier: Optional[float], modifier: Optional[float], override: Optional[float]) -> Dict[str, Any]:
    """Apply a single pricing layer (shop or inventory entry) and return the updated price details."""
    result = {
        "starting_price": current_price,
        "multiplier": multiplier if multiplier is not None else 1.0,
        "modifier": modifier if modifier is not None else 0.0,
        "override": override,
        "applied_override": False,
    }

    if override is not None:
        current_price = override
        result["applied_override"] = True
    else:
        if multiplier is not None:
            current_price *= multiplier
        if modifier is not None:
            current_price += modifier

    result["result_price"] = current_price
    return result


def compute_shop_price(item: Any, shop_entry: Any = None, shop: Any = None, sell_ratio: float = DEFAULT_SELL_RATIO) -> Dict[str, Any]:
    """Calculate the canonical buy and sell price using item, shop, and shop inventory data."""
    if item is None:
        raise ValueError("Item is required to compute pricing")

    base_price = _to_float(getattr(item, "base_price", None), 0.0) or 0.0
    price_currency_id = getattr(item, "base_currency_id", None)

    price = base_price
    breakdown: Dict[str, Any] = {
        "base_price": base_price,
        "shop": None,
        "entry": None,
    }

    if shop is not None:
        shop_multiplier = _to_float(getattr(shop, "price_multiplier", None), 1.0)
        shop_modifier = _to_float(getattr(shop, "price_modifier", None), 0.0)
        shop_override = _to_float(getattr(shop, "price_override", None))
        layer = _apply_pricing_layer(price, shop_multiplier, shop_modifier, shop_override)
        price = layer["result_price"]
        breakdown["shop"] = layer
        price_currency_id = getattr(shop, "currency_id", None) or price_currency_id
    else:
        breakdown["shop"] = {
            "starting_price": price,
            "multiplier": 1.0,
            "modifier": 0.0,
            "override": None,
            "applied_override": False,
            "result_price": price,
        }

    if shop_entry is not None:
        entry_multiplier = _to_float(getattr(shop_entry, "price_multiplier", None), 1.0)
        entry_modifier = _to_float(getattr(shop_entry, "price_modifier", None), 0.0)
        entry_override = _to_float(getattr(shop_entry, "price_override", None))
        layer = _apply_pricing_layer(price, entry_multiplier, entry_modifier, entry_override)
        price = layer["result_price"]
        breakdown["entry"] = layer
        price_currency_id = getattr(shop_entry, "currency_id", None) or price_currency_id
    else:
        breakdown["entry"] = {
            "starting_price": price,
            "multiplier": 1.0,
            "modifier": 0.0,
            "override": None,
            "applied_override": False,
            "result_price": price,
        }

    buy_price = max(price, 0.0)
    effective_sell_ratio = sell_ratio if sell_ratio is not None else DEFAULT_SELL_RATIO
    sell_price = max(buy_price * effective_sell_ratio, 0.0)

    breakdown["final_buy_price"] = buy_price
    breakdown["sell_ratio"] = effective_sell_ratio

    return {
        "currency_id": price_currency_id,
        "buy_price": buy_price,
        "sell_price": sell_price,
        "breakdown": breakdown,
    }
