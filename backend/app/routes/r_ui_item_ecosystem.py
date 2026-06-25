from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_currencies import Currency
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_items import Item
from backend.app.models.m_location_pois import LocationPoi
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shop_inventory import ShopInventory
from backend.app.models.m_shops import Shop
from backend.app.models.m_characters import Character
from backend.app.models.m_locations import Location
from backend.app.models.m_adventure_narrative import AdventureBeatLink
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_combat_profiles import route as combat_profile_route
from backend.app.routes.r_encounters import route as encounter_route
from backend.app.routes.r_events import EventRoute
from backend.app.routes.r_items import ItemRoute
from backend.app.routes.r_location_pois import route as poi_route
from backend.app.routes.r_quests import QuestRoute
from backend.app.routes.r_requirements import route as requirement_route
from backend.app.routes.r_shop_inventory import route_instance as shop_inventory_route
from backend.app.utils.pricing import compute_shop_price
from backend.app.utils.id import generate_ulid
from backend.app.models.m_items import ItemType, Rarity


bp = Blueprint("ui_item_ecosystem", __name__)
item_route = ItemRoute()
quest_route = QuestRoute()
event_route = EventRoute()


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    return {
        column.name: _enum_value(getattr(model, column.name))
        for column in model.__table__.columns
    }


def _compact(model):
    data = _columns(model)
    return {
        key: data.get(key)
        for key in ("id", "slug", "name", "title", "character_id", "location_id", "item_id", "type", "rarity", "level")
        if key in data
    }


def _upsert(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        item_id = data.get("id")
        if not item_id:
            abort(400, description=f"{path}.id is required")
        model_item = db_session.get(model, item_id) or model(id=item_id)
        route.validate_required_fields(data, route.get_schema_required_fields(model.__name__.lower()))
        route.process_input_data(db_session, model_item, dict(data))
        route._normalize_common_fields(model_item, data)
        route.validate_persisted_schema_types(model_item)
        db_session.add(model_item)
        db_session.flush()
        return model_item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


SOURCE_CONFIG = {
    "combat_loot": (CombatProfile, combat_profile_route, "loot_table"),
    "quest_rewards": (Quest, quest_route, "item_rewards"),
    "encounter_rewards": (Encounter, encounter_route, "rewards"),
    "event_rewards": (Event, event_route, "item_rewards"),
}

IMPORTANT_ITEM_TYPES = {"quest", "setpiece"}
IMPORTANT_ITEM_RARITIES = {"rare", "epic", "legendary"}
IMPORTANT_ITEM_TAGS = {"quest", "key", "story", "legendary"}


def _normalize_route_lists(model, data):
    fields = {
        CombatProfile: ["custom_stats", "custom_abilities", "tags", "loot_table", "currency_rewards", "reputation_rewards", "related_quests"],
        Quest: ["objectives", "flags_set_on_completion", "currency_rewards", "reputation_rewards", "item_rewards", "tags"],
        Event: ["item_rewards", "currency_rewards", "reputation_rewards", "flags_set", "tags"],
        Encounter: ["participants", "tags"],
    }.get(model, [])
    for field in fields:
        data[field] = data.get(field) or []
    if model is Encounter:
        data["rewards"] = data.get("rewards") or {}
    return data


def _source_rows(db_session, item_id):
    sources = {key: [] for key in SOURCE_CONFIG}
    for key, (model, _route, field) in SOURCE_CONFIG.items():
        for owner in db_session.query(model).all():
            container = getattr(owner, field) or ([] if field != "rewards" else {})
            rows = container.get("items", []) if field == "rewards" and isinstance(container, dict) else container
            for row in rows or []:
                if isinstance(row, dict) and row.get("item_id") == item_id:
                    sources[key].append({"owner_id": owner.id, "entry": dict(row)})
    sources["shop_inventory"] = []
    for row in db_session.query(ShopInventory).filter(ShopInventory.item_id == item_id).all():
        data = _columns(row)
        data["pricing"] = compute_shop_price(row.item, row, row.shop)
        sources["shop_inventory"].append(data)
    sources["poi_ids"] = [
        row.id for row in db_session.query(LocationPoi).filter(LocationPoi.item_id == item_id).all()
    ]
    return sources


def _source_channel_keys(source_counts):
    labels = {
        "shop_inventory": "shop inventory",
        "combat_loot": "combat loot",
        "quest_rewards": "quest rewards",
        "encounter_rewards": "encounter rewards",
        "event_rewards": "event rewards",
        "poi_ids": "world placements",
    }
    return [
        {"key": key, "label": label, "count": source_counts.get(key, 0)}
        for key, label in labels.items()
        if source_counts.get(key, 0) > 0
    ]


def _important_item(item):
    tags = item.tags or []
    return (
        str(_enum_value(item.type)).lower() in IMPORTANT_ITEM_TYPES
        or str(_enum_value(item.rarity)).lower() in IMPORTANT_ITEM_RARITIES
        or any(str(tag).lower() in IMPORTANT_ITEM_TAGS for tag in tags)
    )


def _has_story_explanation(db_session, item_id):
    for link in db_session.query(AdventureBeatLink).filter(AdventureBeatLink.target_id == item_id).all():
        if _enum_value(link.target_type) != "item" or _enum_value(link.importance) == "background":
            continue
        if (
            (link.notes or "").strip()
            or (link.state_label or "").strip()
            or ((link.continuity_group_id or "").strip() and link.continuity_group_id != item_id)
        ):
            return True
    return False


def _analysis(db_session, item, sources):
    source_counts = {
        key: len(value) for key, value in sources.items()
        if isinstance(value, list)
    }
    acquisition_channels = _source_channel_keys(source_counts)
    total_sources = sum(source_counts.values())
    repeated = []
    for key in ("combat_loot", "quest_rewards", "encounter_rewards", "event_rewards"):
        owner_ids = [entry.get("owner_id") for entry in sources[key] if isinstance(entry, dict)]
        repeated.extend(f"{key}:{owner_id}" for owner_id in set(owner_ids) if owner_ids.count(owner_id) > 1)
    warnings = []
    if total_sources == 0:
        warnings.append("Item has no acquisition sources.")
    broad_sources = source_counts.get("shop_inventory", 0) + source_counts.get("combat_loot", 0)
    if _enum_value(item.type) == "Quest" and broad_sources > 0:
        warnings.append("Quest item is sold or dropped broadly.")
    scarcity_target = {"Common": 6, "Uncommon": 4, "Rare": 3, "Epic": 2, "Legendary": 1}.get(_enum_value(item.rarity), 4)
    if total_sources > scarcity_target * 2:
        warnings.append("Rarity and acquisition scarcity appear mismatched.")
    if repeated:
        warnings.append("Item is rewarded repeatedly by the same source.")
    if _important_item(item) and len(acquisition_channels) > 1 and not _has_story_explanation(db_session, item.id):
        warnings.append("Important item appears in multiple acquisition channels without story placement context explaining why.")
    peers = [
        row for row in db_session.query(Item).all()
        if row.id != item.id and (_enum_value(row.type) == _enum_value(item.type) or _enum_value(row.rarity) == _enum_value(item.rarity))
    ]
    prices = sorted(float(row.base_price or 0) for row in peers)
    median_price = prices[len(prices) // 2] if prices else 0
    if median_price > 0 and float(item.base_price or 0) < median_price * 0.6:
        warnings.append("Base price is below 60% of the peer median.")
    return {
        "source_counts": source_counts,
        "total_sources": total_sources,
        "acquisition_channels": acquisition_channels,
        "acquisition_channel_count": len(acquisition_channels),
        "repeated_sources": repeated,
        "median_peer_price": median_price,
        "warnings": warnings,
        "peers": [item_route.serialize_item(row) for row in peers],
    }


def _catalogs(db_session):
    characters = {row.id: row for row in db_session.query(Character).all()}
    locations = {row.id: row for row in db_session.query(Location).all()}
    return {
        "items": [_compact(row) for row in db_session.query(Item).all()],
        "shops": [_compact(row) for row in db_session.query(Shop).all()],
        "combat_profiles": [
            {**_compact(row), "label": _compact(characters.get(row.character_id)) if characters.get(row.character_id) else None}
            for row in db_session.query(CombatProfile).all()
        ],
        "quests": [_compact(row) for row in db_session.query(Quest).all()],
        "encounters": [_compact(row) for row in db_session.query(Encounter).all()],
        "events": [_compact(row) for row in db_session.query(Event).all()],
        "pois": [
            {**_compact(row), "location": _compact(locations.get(row.location_id)) if locations.get(row.location_id) else None}
            for row in db_session.query(LocationPoi).all()
        ],
        "currencies": [_compact(row) for row in db_session.query(Currency).all()],
        "requirements": [requirement_route.serialize_item(row) for row in db_session.query(Requirement).all()],
    }


def _packet(db_session, item):
    sources = _source_rows(db_session, item.id)
    return {
        "item": item_route.serialize_item(item),
        "requirement": requirement_route.serialize_item(item.requirements) if item.requirements else None,
        "sources": sources,
        "catalogs": _catalogs(db_session),
        "analysis": _analysis(db_session, item, sources),
    }


@bp.get("/api/ui/items/ecosystem")
def get_item_ecosystem_selector():
    db_session = get_db_session()
    try:
        return jsonify({
            "items": [item_route.serialize_item(row) for row in db_session.query(Item).all()],
            "catalogs": _catalogs(db_session),
        })
    finally:
        db_session.close()


def _desired_source_map(payload, key):
    value = payload.get(key, [])
    if not isinstance(value, list):
        abort(400, description=f"sources.{key} must be an array")
    desired = {}
    for index, source in enumerate(value):
        path = f"sources.{key}[{index}]"
        if not isinstance(source, dict) or not source.get("owner_id") or not isinstance(source.get("entry"), dict):
            abort(400, description=f"{path} requires owner_id and entry")
        owner_id = source["owner_id"]
        desired.setdefault(owner_id, []).append(dict(source["entry"]))
    return desired


def _replace_nested_sources(db_session, item_id, sources):
    for key, (model, route, field) in SOURCE_CONFIG.items():
        desired = _desired_source_map(sources, key)
        owners = db_session.query(model).all()
        known = {owner.id for owner in owners}
        missing = set(desired) - known
        if missing:
            abort(400, description=f"sources.{key} references missing owner: {sorted(missing)[0]}")
        for owner in owners:
            data = _normalize_route_lists(model, _columns(owner))
            if field == "rewards":
                rewards = dict(owner.rewards or {})
                rows = [dict(row) if isinstance(row, dict) else row for row in rewards.get("items", []) if not isinstance(row, dict) or row.get("item_id") != item_id]
                for desired_entry in desired.get(owner.id, []):
                    desired_entry["item_id"] = item_id
                    rows.append(desired_entry)
                rewards["items"] = rows
                data["rewards"] = rewards
            else:
                rows = [dict(row) if isinstance(row, dict) else row for row in (getattr(owner, field) or []) if not isinstance(row, dict) or row.get("item_id") != item_id]
                for desired_entry in desired.get(owner.id, []):
                    desired_entry["item_id"] = item_id
                    rows.append(desired_entry)
                data[field] = rows
            if owner.id in desired or any(isinstance(row, dict) and row.get("item_id") == item_id for row in ((getattr(owner, field) or {}).get("items", []) if field == "rewards" else getattr(owner, field) or [])):
                _upsert(db_session, route, model, data, f"sources.{key}[{owner.id}]")


def _replace_shop_sources(db_session, item_id, rows):
    if not isinstance(rows, list):
        abort(400, description="sources.shop_inventory must be an array")
    desired_ids = set()
    for index, data in enumerate(rows):
        path = f"sources.shop_inventory[{index}]"
        if not isinstance(data, dict):
            abort(400, description=f"{path} must be an object")
        data = dict(data)
        data["item_id"] = item_id
        existing = db_session.get(ShopInventory, data.get("id")) if data.get("id") else None
        if existing and existing.item_id != item_id:
            abort(400, description=f"{path}.id belongs to another item")
        saved = _upsert(db_session, shop_inventory_route, ShopInventory, data, path)
        desired_ids.add(saved.id)
    for existing in db_session.query(ShopInventory).filter(ShopInventory.item_id == item_id).all():
        if existing.id not in desired_ids:
            db_session.delete(existing)


def _replace_pois(db_session, item_id, poi_ids):
    if not isinstance(poi_ids, list) or any(not isinstance(value, str) for value in poi_ids):
        abort(400, description="sources.poi_ids must be an array of ids")
    if len(poi_ids) != len(set(poi_ids)):
        abort(400, description="sources.poi_ids contains duplicates")
    desired = set(poi_ids)
    pois = db_session.query(LocationPoi).all()
    known = {poi.id for poi in pois}
    missing = desired - known
    if missing:
        abort(400, description=f"sources.poi_ids references missing POI: {sorted(missing)[0]}")
    for poi in pois:
        if poi.id in desired and poi.item_id not in (None, item_id):
            abort(400, description=f"sources.poi_ids POI {poi.id} is occupied by another item")
        next_item_id = item_id if poi.id in desired else (None if poi.item_id == item_id else poi.item_id)
        if next_item_id == poi.item_id:
            continue
        data = _columns(poi)
        data["item_id"] = next_item_id
        _upsert(db_session, poi_route, LocationPoi, data, f"sources.poi_ids[{poi.id}]")


@bp.get("/api/ui/items/ecosystem/<item_id>")
def get_item_ecosystem(item_id):
    db_session = get_db_session()
    try:
        item = db_session.get(Item, item_id)
        if not item:
            abort(404, description=f"Item {item_id} not found")
        return jsonify(_packet(db_session, item))
    finally:
        db_session.close()


@bp.get("/api/ui/items/ecosystem-new")
def get_new_item_ecosystem():
    db_session = get_db_session()
    try:
        item = Item(
            id=generate_ulid(),
            slug="",
            name="New Item",
            type=ItemType.Misc,
            rarity=Rarity.Common,
            base_price=0,
            effects=[],
            tags=[],
        )
        return jsonify({
            "item": item_route.serialize_item(item),
            "requirement": None,
            "sources": {**{key: [] for key in SOURCE_CONFIG}, "shop_inventory": [], "poi_ids": []},
            "catalogs": _catalogs(db_session),
            "analysis": {
                "source_counts": {},
                "total_sources": 0,
                "acquisition_channels": [],
                "acquisition_channel_count": 0,
                "repeated_sources": [],
                "median_peer_price": 0,
                "warnings": ["Item has no acquisition sources."],
                "peers": [],
            },
        })
    finally:
        db_session.close()


@bp.post("/api/ui/items/ecosystem/bundle")
def save_item_ecosystem():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("item"), dict):
            abort(400, description="item ecosystem bundle requires an item object")
        item_data = dict(payload["item"])
        item_id = item_data.get("id")
        if not item_id:
            abort(400, description="item.id is required")
        requirement = payload.get("requirement")
        if requirement is not None:
            if not isinstance(requirement, dict) or requirement.get("id") != item_data.get("requirements_id"):
                abort(400, description="requirement.id must match item.requirements_id")
            _upsert(db_session, requirement_route, Requirement, requirement, "requirement")
        item = _upsert(db_session, item_route, Item, item_data, "item")
        sources = payload.get("sources", {})
        if not isinstance(sources, dict):
            abort(400, description="sources must be an object")
        _replace_nested_sources(db_session, item_id, sources)
        _replace_shop_sources(db_session, item_id, sources.get("shop_inventory", []))
        _replace_pois(db_session, item_id, sources.get("poi_ids", []))
        db_session.commit()
        return jsonify(_packet(db_session, item))
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
