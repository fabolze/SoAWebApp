from flask import request, jsonify
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_items import Item, ItemType, Rarity, EquipmentSlot, WeaponType
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_effects import Effect
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
        return ["id", "name", "type"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
        
    def process_input_data(self, db_session: Session, item: Item, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "type": ItemType,
            "rarity": Rarity,
            "equipment_slot": EquipmentSlot,
            "weapon_type": WeaponType
        })
        
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "requirements_id": Requirement
        })
        
        # Effects validation if provided
        if "effects" in data:
            for effect_id in data["effects"]:
                if not db_session.get(Effect, effect_id):
                    raise ValueError(f"Invalid effect_id: {effect_id}")
        
        # Update fields
        item.name = data["name"]
        item.type = data["type"]  # Already converted to enum
        
        # Optional enum fields (already validated)
        if "rarity" in data:
            item.rarity = data["rarity"]
        if "equipment_slot" in data:
            item.equipment_slot = data["equipment_slot"]
        if "weapon_type" in data:
            item.weapon_type = data["weapon_type"]
            
        # Optional fields
        item.description = data.get("description")
        
        # Stats fields
        stats = data.get("stats", {})
        item.stat_damage = stats.get("damage")
        item.stat_defense = stats.get("defense")
        item.stat_crit_chance = stats.get("crit_chance")
        item.stat_weight = stats.get("weight")
        
        # Attribute bonuses
        attributes = data.get("attributes", {})
        item.attr_strength = attributes.get("strength")
        item.attr_dexterity = attributes.get("dexterity")
        item.attr_vitality = attributes.get("vitality")
        item.attr_intelligence = attributes.get("intelligence")
        
        # Relationship fields
        item.requirements_id = data.get("requirements_id")
        
        # JSON fields
        item.effects = data.get("effects", [])
        
        # Additional fields
        if "icon_path" in data:
            item.icon_path = data["icon_path"]
        if "tags" in data:
            item.tags = data["tags"]
            
    def serialize_item(self, item: Item) -> Dict[str, Any]:
        return self.serialize_model(item)
    
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
                            self.model.tags.any(lambda t: t.ilike(f"%{tag}%"))
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = ItemRoute().bp
