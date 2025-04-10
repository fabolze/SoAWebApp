### --- app.py ---
import json
import os
from flask import Flask, render_template, request, redirect, url_for
from models import db, Item, Effect

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game_assets.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'static/images/items'
db.init_app(app)

SCHEMA_DIR = 'schemas'

def load_schema(schema_name):
    with open(os.path.join(SCHEMA_DIR, f'{schema_name}.json')) as f:
        return json.load(f)

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    items = Item.query.all()
    schema = load_schema('items')
    all_tags = sorted({tag for item in items for tag in (item.tags or [])})
    all_effects = sorted({effect for item in items for effect in (item.effects or [])})
    return render_template('index.html', items=items, schema=schema, all_tags=all_tags, all_effects=all_effects)

@app.route('/add', methods=['POST'])
def add_item():
    item = Item(
        id=request.form.get('id'),
        name=request.form.get('name'),
        type=request.form.get('type'),
        equipment_slot=request.form.get('equipment_slot'),
        rarity=request.form.get('rarity'),
        description=request.form.get('description'),
        image_path=f"/static/images/items/{request.form.get('image_path')}",
        armor=request.form.get('armor', type=int),
        damage=request.form.get('damage', type=int),
        magic_resist=request.form.get('magic_resist', type=int),
        strength_bonus=request.form.get('strength_bonus', type=int),
        vitality_bonus=request.form.get('vitality_bonus', type=int),
        effects=request.form.get('effects').split(',') if request.form.get('effects') else [],
        tags=request.form.get('tags').split(',') if request.form.get('tags') else [],
        value=request.form.get('value', type=int),
        is_quest_item='is_quest_item' in request.form,
        is_consumable='is_consumable' in request.form,
        is_material='is_material' in request.form,
        req_level=request.form.get('req_level', type=int),
        req_strength=request.form.get('req_strength', type=int),
    )
    db.session.add(item)
    db.session.commit()
    return redirect(url_for('index'))


@app.route('/items', methods=['GET', 'POST'])
def items():
    schema = load_schema('items')
    if request.method == 'POST':
        item = Item(
            id=request.form.get('id'),
            name=request.form.get('name'),
            type=request.form.get('type'),
            equipment_slot=request.form.get('equipment_slot'),
            rarity=request.form.get('rarity'),
            description=request.form.get('description'),
            image_path=f"/static/images/items/{request.form.get('image_path')}",
            armor=request.form.get('armor', type=int),
            damage=request.form.get('damage', type=int),
            magic_resist=request.form.get('magic_resist', type=int),
            strength_bonus=request.form.get('strength_bonus', type=int),
            vitality_bonus=request.form.get('vitality_bonus', type=int),
            effects=request.form.get('effects').split(',') if request.form.get('effects') else [],
            tags=request.form.get('tags').split(',') if request.form.get('tags') else [],
            value=request.form.get('value', type=int),
            is_quest_item='is_quest_item' in request.form,
            is_consumable='is_consumable' in request.form,
            is_material='is_material' in request.form,
            req_level=request.form.get('req_level', type=int),
            req_strength=request.form.get('req_strength', type=int),
        )
        db.session.add(item)
        db.session.commit()
        return redirect(url_for('items'))

    items = Item.query.all()
    all_tags = sorted({tag for item in items for tag in (item.tags or [])})
    all_effects = sorted({effect for item in items for effect in (item.effects or [])})
    return render_template('items.html', items=items, schema=schema, all_tags=all_tags, all_effects=all_effects)

@app.route('/effects', methods=['GET', 'POST'])
def effects():
    schema = load_schema('effects')
    if request.method == 'POST':
        effect = Effect(
            effect_name=request.form['effect_name'],
            description=request.form['description'],
            magnitude=float(request.form['magnitude']),
            duration=float(request.form['duration']),
            target_type=request.form['target_type'],
            effect_type=request.form['effect_type'],
            stackable='stackable' in request.form,
            icon_path=request.form['icon_path'],
            related_items=request.form.get('related_items', '').split(','),
            set_bonus_group=request.form.get('set_bonus_group', '')
        )
        db.session.add(effect)
        db.session.commit()
        return redirect(url_for('effects'))

    effects = Effect.query.all()
    return render_template('effects.html', schema=schema, effects=effects)

if __name__ == '__main__':
    app.run(debug=True)