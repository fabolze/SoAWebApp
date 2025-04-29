# app.py

import os
import json
import uuid
from flask import Flask, render_template, redirect, url_for, abort
from models import db, Item
from utils.schema_updater import update_table_from_schema
from utils.form_builder import generate_form_class
from utils.payload_builder import build_payload
from utils.db_helpers import get_fresh_table

# HELPER 
def load_schema(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)



app = Flask(__name__)

# Correct absolute database path
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, "instance", "SoA.db")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
app.config["SECRET_KEY"] = "supersecretkey"

db.init_app(app)


# Paths

DB_PATH = "instance/SoA.db"
ITEM_SCHEMA_PATH = "schemas/items.json"
EFFECT_SCHEMA_PATH = "schemas/effects.json"

# Schema
with open(ITEM_SCHEMA_PATH, "r", encoding="utf-8") as f:
    item_schema = json.load(f)

@app.before_request
def setup():
    db.create_all()
    update_table_from_schema(db, "item", load_schema(EFFECT_SCHEMA_PATH))
    update_table_from_schema(db, "effect", load_schema(EFFECT_SCHEMA_PATH))

@app.route("/")
def index():
    items = Item.query.all()
    return render_template("index.html", items=items)

@app.route("/item/new", methods=["GET", "POST"])
def create_item():
    DynamicItemForm = generate_form_class(item_schema)
    form = DynamicItemForm()

    if form.validate_on_submit():
        payload = build_payload(form, item_schema)

        # Auto-generate ID if empty
        if not payload.get("id"):
            payload["id"] = str(uuid.uuid4())

        new_item = Item(**payload)
        db.session.add(new_item)
        db.session.commit()
        return redirect(url_for("index"))

    return render_template("item_form.html", form=form)


@app.route("/item/<id>/edit", methods=["GET", "POST"])
def edit_item(id):
    item = Item.query.get_or_404(id)
    DynamicItemForm = generate_form_class(item_schema)
    form = DynamicItemForm(obj=item)

    if form.validate_on_submit():
        payload = build_payload(form, item_schema)
        for key, value in payload.items():
            setattr(item, key, value)
        db.session.commit()
        return redirect(url_for("index"))

    return render_template("item_form.html", form=form, item=item)

@app.route("/item/<id>/delete", methods=["POST"])
def delete_item(id):
    item = Item.query.get_or_404(id)
    db.session.delete(item)
    db.session.commit()
    return redirect(url_for("index"))


# ========== EFFECTS ==========
@app.route("/effects")
def list_effects():
    table = db.metadata.tables["effect"]
    effects = db.session.execute(table.select()).fetchall()
    return render_template("effects_list.html", effects=effects)

@app.route("/effects/new", methods=["GET", "POST"])
def create_effect():
    schema = load_schema(EFFECT_SCHEMA_PATH)
    FormClass = generate_form_class(schema)
    form = FormClass()

    if form.validate_on_submit():
        payload = build_payload(form, schema)
        table = db.metadata.tables["effect"]
        db.session.execute(table.insert().values(**payload))
        db.session.commit()
        return redirect(url_for("list_effects"))

    return render_template("generic_form.html", form=form, title="Create Effect")

@app.route("/effects/<id>/edit", methods=["GET", "POST"])
def edit_effect(id):
    schema = load_schema(EFFECT_SCHEMA_PATH)
    FormClass = generate_form_class(schema)
    table = db.metadata.tables["effect"]

    existing = db.session.execute(table.select().where(table.c["effect_id"]
 == id)).fetchone()
    if not existing:
        abort(404)

    form = FormClass(data=dict(existing._mapping))

    if form.validate_on_submit():
        payload = build_payload(form, schema)
        db.session.execute(table.update().where(table.c["effect_id"]
 == id).values(**payload))
        db.session.commit()
        return redirect(url_for("list_effects"))

    return render_template("generic_form.html", form=form, title="Edit Effect")


@app.route("/effects/<id>/delete", methods=["POST"])
def delete_effect(id):
    table = get_fresh_table("effect")
    db.session.execute(table.delete().where(table.c["effect_id"] == id))
    db.session.commit()
    return redirect(url_for("list_effects"))


# ========== MAIN ==========
if __name__ == "__main__":
    app.run(debug=True)
