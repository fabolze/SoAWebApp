from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import JSON, func

db = SQLAlchemy()

class Item(db.Model):
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    rarity = db.Column(db.String(50))
    description = db.Column(db.Text)
    equipment_slot = db.Column(db.String(50))  # New field
    weapon_slot_type = db.Column(db.String(50))  # New field
    item_stats = db.Column(JSON, default=dict)  # Updated to include armor, damage, magic_resist
    attributes_bonus = db.Column(JSON, default=dict)  # Updated to include strength, vitality
    effects = db.Column(JSON, default=list)  # ["poison","slow"]
    value = db.Column(db.Integer)  # New field
    requirements = db.Column(JSON, default=dict)  # {"level":3}
    is_quest_item = db.Column(db.Boolean, default=False)  # New field
    is_consumable = db.Column(db.Boolean, default=False)  # New field
    is_material = db.Column(db.Boolean, default=False)  # New field
    tags = db.Column(JSON, default=list)  # ["potion","fire"]
    image_path = db.Column(db.String(256))  # New field

    created_at = db.Column(db.DateTime, server_default=func.now())

class Effect(db.Model):
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    description = db.Column(db.Text)
    target = db.Column(db.String(50))  # New field
    duration = db.Column(db.Float)  # New field
    value_type = db.Column(db.String(50))  # New field
    value = db.Column(db.Float)  # New field
    attribute = db.Column(db.String(50))  # New field
    scaling_stat = db.Column(db.String(50))  # New field
    trigger_condition = db.Column(db.String(50))  # New field
    stackable = db.Column(db.Boolean, default=False)  # New field
    set_bonus_group = db.Column(db.String(100))  # New field
    icon_path = db.Column(db.String(256))  # New field
    related_items = db.Column(JSON, default=list)  # New field

    created_at = db.Column(db.DateTime, server_default=func.now())