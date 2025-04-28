# app.py

import os
import json
from flask import Flask, render_template, redirect, url_for
from models import db, Item
from utils.schema_updater import update_items_table
from utils.form_builder import generate_form_class
from utils.payload_builder import build_payload
import uuid

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

# Schema
with open(ITEM_SCHEMA_PATH, "r", encoding="utf-8") as f:
    item_schema = json.load(f)

@app.before_request
def setup():
    db.create_all()
    update_items_table(DB_PATH, ITEM_SCHEMA_PATH)

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

if __name__ == "__main__":
    app.run(debug=True)
