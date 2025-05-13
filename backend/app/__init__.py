# backend/app/__init__.py

from flask import Flask
from flask_cors import CORS
from backend.app.db.init_db import init_db
########## Blueprints Import ##########
from backend.app.routes.r_abilities import bp as abilities_bp
from backend.app.routes.r_effects import bp as effects_bp




def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    # Bootstrapping pipeline
    print("🔧 Initializing database...")
    init_db()
       
    # Register blueprints, CLI commands, etc. here
    # app.register_blueprint(...)
    app.register_blueprint(abilities_bp)
    app.register_blueprint(effects_bp)


    return app
