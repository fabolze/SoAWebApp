# seed.py  (put in project root)
from app import app, db
from backend.app.models.m_items import Item, Effect

with app.app_context():
    db.session.add_all([
        Effect(id="poison", name="Poison", type="Damage",
               description="Deals 3 HP each turn",
               data={"duration":5, "value":3}),
        Item(id="iron_sword", name="Iron Sword", type="Weapon",
             rarity="Common", effects=["poison"],
             stats={"damage":8}, tags=["starter"])
    ])
    db.session.commit()
    print("✔ sample rows inserted")
