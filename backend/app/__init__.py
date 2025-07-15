# backend/app/__init__.py

from flask import Flask, jsonify
from flask_cors import CORS
from backend.app.db.init_db import init_db

########## Blueprints Import ##########
from backend.app.routes.r_abilities import bp as abilities_bp
from backend.app.routes.r_effects import bp as effects_bp
from backend.app.routes.r_attributes import bp as attributes_bp
from backend.app.routes.r_characterclasses import bp as characterclasses_bp
from backend.app.routes.r_dialogue_nodes import bp as dialogue_nodes_bp
from backend.app.routes.r_dialogues import bp as dialogues_bp
from backend.app.routes.r_encounters import bp as encounters_bp
from backend.app.routes.r_enemies import bp as enemies_bp
from backend.app.routes.r_events import bp as events_bp
from backend.app.routes.r_factions import bp as factions_bp
from backend.app.routes.r_flags import bp as flags_bp
from backend.app.routes.r_items import bp as items_bp
from backend.app.routes.r_locations import bp as locations_bp
from backend.app.routes.r_lore_entries import bp as lore_entries_bp
from backend.app.routes.r_npcs import bp as npcs_bp
from backend.app.routes.r_quests import bp as quests_bp
from backend.app.routes.r_requirements import bp as requirements_bp
from backend.app.routes.r_shops import bp as shops_bp
from backend.app.routes.r_shop_inventory import bp as shop_inventory_bp
from backend.app.routes.r_stats import bp as stats_bp
from backend.app.routes.r_story_arcs import bp as story_arcs_bp
from backend.app.routes.r_timelines import bp as timelines_bp
from backend.app.routes.r_export import bp as export_bp
from backend.app.routes.r_bulk_export import bp as bulk_export_bp
from backend.app.routes.r_db_admin import bp as db_admin_bp

def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    # Global error handler for JSON errors
    @app.errorhandler(Exception)
    def handle_error(e):
        code = getattr(e, 'code', 500)
        description = getattr(e, 'description', str(e))
        return jsonify({
            'error': True,
            'message': description,
            'type': e.__class__.__name__,
            'status': code
        }), code
    
    # Bootstrapping pipeline
    print("🔧 Initializing database...")
    init_db()
       
    # Register all blueprints
    print("📑 Registering blueprints...")
    blueprints = [
        abilities_bp,
        effects_bp,
        attributes_bp,
        characterclasses_bp,
        dialogue_nodes_bp,
        dialogues_bp,
        encounters_bp,
        enemies_bp,
        events_bp,
        factions_bp,
        flags_bp,
        items_bp,
        locations_bp,
        lore_entries_bp,
        npcs_bp,
        quests_bp,
        requirements_bp,
        shops_bp,
        shop_inventory_bp,
        stats_bp,
        story_arcs_bp,
        timelines_bp,
        export_bp,
        bulk_export_bp,
        db_admin_bp
    ]
    
    for blueprint in blueprints:
        app.register_blueprint(blueprint)
        print(f"✅ Registered {blueprint.name} blueprint")

    return app
