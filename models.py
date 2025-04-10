# models.py
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text)
    type = db.Column(db.String(50))
    icon_url = db.Column(db.String(200))

    def __repr__(self):
        return f'<Item {self.name}>'
