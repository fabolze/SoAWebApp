# File: backend/app/api/items.py
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.m_items import Item  # You will define this model

items_bp = Blueprint("items", __name__)

@items_bp.route("/", methods=["GET"])
def list_items():
    items = Item.query.all()
    return jsonify([item.to_dict() for item in items])

@items_bp.route("/", methods=["POST"])
def create_item():
    data = request.get_json()
    item = Item(**data)
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201