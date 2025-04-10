### --- models.py ---
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Item(db.Model):
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50))
    equipment_slot = db.Column(db.String(50))
    rarity = db.Column(db.String(50))
    description = db.Column(db.Text)
    image_path = db.Column(db.String(200))

    armor = db.Column(db.Integer)
    damage = db.Column(db.Integer)
    magic_resist = db.Column(db.Integer)

    strength_bonus = db.Column(db.Integer)
    vitality_bonus = db.Column(db.Integer)

    effects = db.Column(db.PickleType)
    tags = db.Column(db.PickleType)

    value = db.Column(db.Integer)
    is_quest_item = db.Column(db.Boolean)
    is_consumable = db.Column(db.Boolean)
    is_material = db.Column(db.Boolean)

    req_level = db.Column(db.Integer)
    req_strength = db.Column(db.Integer)


class Effect(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    effect_name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    magnitude = db.Column(db.Float)
    duration = db.Column(db.Float)
    target_type = db.Column(db.String(50))
    effect_type = db.Column(db.String(50))
    stackable = db.Column(db.Boolean)
    icon_path = db.Column(db.String(200))
    related_items = db.Column(db.PickleType)
    set_bonus_group = db.Column(db.String(50))