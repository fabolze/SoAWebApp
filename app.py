import os
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, redirect, url_for, render_template   # ← added render_template
from flask_migrate import Migrate

from models import db, Item
from helpers import build_item_from_form

# -------------------------------------------------------------------
# config
# -------------------------------------------------------------------
load_dotenv()

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
migrate = Migrate(app, db)

# -------------------------------------------------------------------
# routes
# -------------------------------------------------------------------
@app.get("/items")                       # list + form page
def items():
    items = Item.query.all()
    return render_template("items.html", items=items)   # template lives in /templates

@app.post("/items")                      # handle form submit
def items_post():
    payload = build_item_from_form(request.form)
    item = Item(**payload)
    db.session.add(item)
    db.session.commit()
    return redirect(url_for("items"))
