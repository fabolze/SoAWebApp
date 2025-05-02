# File: backend/app/__init__.py
from flask import Flask
from .config import SQLALCHEMY_DATABASE_URI, SECRET_KEY
from .extensions import db, migrate
from .api.api_items import items_bp  # example blueprint

def create_app():
    app = Flask(__name__, instance_relative_config=True)
    app.config["SQLALCHEMY_DATABASE_URI"] = SQLALCHEMY_DATABASE_URI
    app.config["SECRET_KEY"] = SECRET_KEY

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Register blueprints
    app.register_blueprint(items_bp, url_prefix="/api/items")

    return app