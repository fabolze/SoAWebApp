# backend/app/__init__.py

from flask import Flask

from backend.app.db.init_db import init_db
from backend.app.db.schema_sync import sync_schema
from backend.app.db.validate_schema import validate_models

def create_app():
    app = Flask(__name__)

    # Bootstrapping pipeline
    print("🔧 Initializing database...")
    init_db()
    print("🔄 Syncing schema...")
    sync_schema()
    print("🔍 Validating schema alignment...")
    validate_models(quiet=True)

    # Register blueprints, CLI commands, etc. here
    # app.register_blueprint(...)

    return app
