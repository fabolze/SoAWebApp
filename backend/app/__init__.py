# backend/app/__init__.py

from flask import Flask, jsonify
from flask_cors import CORS
from backend.app.db.init_db import init_db
from backend.app.utils.id import generate_ulid

########## Blueprints Import ##########
from backend.app.routes.r_abilities import bp as abilities_bp
from backend.app.routes.r_effects import bp as effects_bp
from backend.app.routes.r_attributes import bp as attributes_bp
from backend.app.routes.r_characterclasses import bp as characterclasses_bp
from backend.app.routes.r_dialogue_nodes import bp as dialogue_nodes_bp
from backend.app.routes.r_characters import bp as characters_bp
from backend.app.routes.r_combat_profiles import bp as combat_profiles_bp
from backend.app.routes.r_dialogues import bp as dialogues_bp
from backend.app.routes.r_encounters import bp as encounters_bp
from backend.app.routes.r_interaction_profiles import bp as interaction_profiles_bp
from backend.app.routes.r_events import bp as events_bp
from backend.app.routes.r_content_packs import bp as content_packs_bp
from backend.app.routes.r_currencies import bp as currencies_bp
from backend.app.routes.r_factions import bp as factions_bp
from backend.app.routes.r_flags import bp as flags_bp
from backend.app.routes.r_items import bp as items_bp
from backend.app.routes.r_location_routes import bp as location_routes_bp
from backend.app.routes.r_locations import bp as locations_bp
from backend.app.routes.r_location_pois import bp as location_pois_bp
from backend.app.routes.r_location_encounter_tables import bp as location_encounter_tables_bp
from backend.app.routes.r_route_event_bindings import bp as route_event_bindings_bp
from backend.app.routes.r_travel_tuning import bp as travel_tuning_bp
from backend.app.routes.r_location_creative_briefs import bp as location_creative_briefs_bp
from backend.app.routes.r_lore_entries import bp as lore_entries_bp
from backend.app.routes.r_quests import bp as quests_bp
from backend.app.routes.r_requirements import bp as requirements_bp
from backend.app.routes.r_shops import bp as shops_bp
from backend.app.routes.r_shop_inventory import bp as shop_inventory_bp
from backend.app.routes.r_stats import bp as stats_bp
from backend.app.routes.r_story_arcs import bp as story_arcs_bp
from backend.app.routes.r_timelines import bp as timelines_bp
from backend.app.routes.r_statuses import bp as statuses_bp
from backend.app.routes.r_talent_trees import bp as talent_trees_bp
from backend.app.routes.r_talent_nodes import bp as talent_nodes_bp
from backend.app.routes.r_talent_node_links import bp as talent_node_links_bp
from backend.app.routes.r_export import bp as export_bp
from backend.app.routes.r_bulk_export import bp as bulk_export_bp
from backend.app.routes.r_db_admin import bp as db_admin_bp
from backend.app.routes.r_authoring import bp as authoring_bp
from backend.app.routes.r_ui_items import bp as ui_items_bp
from backend.app.routes.r_ui_characters import bp as ui_characters_bp
from backend.app.routes.r_ui_location_graph import bp as ui_location_graph_bp
from backend.app.routes.r_ui_world_builder import bp as ui_world_builder_bp
from backend.app.routes.r_ui_dialogues import bp as ui_dialogues_bp
from backend.app.routes.r_ui_encounters import bp as ui_encounters_bp
from backend.app.routes.r_ui_item_ecosystem import bp as ui_item_ecosystem_bp
from backend.app.routes.r_ui_quests import bp as ui_quests_bp
from backend.app.routes.r_ui_dependencies import bp as ui_dependencies_bp
from backend.app.routes.r_ui_abilities import bp as ui_abilities_bp
from backend.app.routes.r_recovery import bp as recovery_bp
from backend.app.services.recovery import run_startup_recovery

__all__ = ["create_app", "generate_ulid"]


def create_app(startup_recovery: bool = True) -> Flask:
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
    print("ðŸ”§ Initializing database...")
    init_db()
       
    # Register all blueprints
    print("ðŸ“‘ Registering blueprints...")
    blueprints = [
        abilities_bp,
        effects_bp,
        attributes_bp,
        characterclasses_bp,
        dialogue_nodes_bp,
        dialogues_bp,
        encounters_bp,
        events_bp,
        characters_bp,
        combat_profiles_bp,
        interaction_profiles_bp,
        content_packs_bp,
        currencies_bp,
        factions_bp,
        flags_bp,
        items_bp,
        location_routes_bp,
        locations_bp,
        location_pois_bp,
        location_encounter_tables_bp,
        route_event_bindings_bp,
        travel_tuning_bp,
        location_creative_briefs_bp,
        lore_entries_bp,
        quests_bp,
        requirements_bp,
        shops_bp,
        shop_inventory_bp,
        stats_bp,
        statuses_bp,
        story_arcs_bp,
        timelines_bp,
        talent_trees_bp,
        talent_nodes_bp,
        talent_node_links_bp,
        export_bp,
        bulk_export_bp,
        db_admin_bp,
        authoring_bp,
        ui_items_bp,
        ui_characters_bp,
        ui_location_graph_bp,
        ui_world_builder_bp,
        ui_dialogues_bp,
        ui_encounters_bp,
        ui_item_ecosystem_bp,
        ui_quests_bp,
        ui_dependencies_bp,
        ui_abilities_bp,
        recovery_bp
    ]
    
    for blueprint in blueprints:
        app.register_blueprint(blueprint)
        print(f"âœ… Registered {blueprint.name} blueprint")

    if startup_recovery:
        run_startup_recovery(app)

    return app


