# models.py
# Only the minimal, core columns are defined manually. Everything else gets ALTER TABLE dynamically.
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Item(db.Model):
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String(100))
    type = db.Column(db.String(50))
    rarity = db.Column(db.String(50))
    # Dynamic columns handled at runtime by schema updater
