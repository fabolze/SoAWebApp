from backend.app.schemas import load_schemas
from backend.app.models import ALL_MODELS


SKIP_TABLES = {
    "ability_effect_links",
    "ability_scaling_links",
    "attribute_stat_links",
    "requirement_forbidden_flags",
    "requirement_min_faction_reputation",
    "requirement_required_flags",
    "shop_inventory"
}


def validate_models(quiet = False):
    schemas = load_schemas()

    for model in ALL_MODELS:
        table_name = model.__tablename__
        schema = schemas.get(table_name)        
        if not schema:
            if not quiet:
                print(f"⚠️ Skipping table '{table_name}' (no schema)")
            continue

        model_fields = {col.name for col in model.__table__.columns}
        schema_fields = set(schema.get("properties", {}).keys())

        missing_in_model = {
            field for field in schema_fields - model_fields
            if not should_ignore_mismatch(field, model_fields, table_name)
        }
        missing_in_schema = {
            field for field in model_fields - schema_fields
            if not should_ignore_mismatch(field, model_fields, table_name)
        }

        if missing_in_model or missing_in_schema:
            print(f"Field mismatch in '{table_name}':")
            if missing_in_model:
                print(f"  Schema has fields not in model: {missing_in_model}")
            if missing_in_schema:
                print(f"  Model has fields not in schema: {missing_in_schema}")


IGNORED_BY_DESIGN = {
    "abilities": {"effects", "scaling"},  # UI fields stored in link tables
}

def should_ignore_mismatch(field: str, other_fields: set, table: str = "") -> bool:
    if table in IGNORED_BY_DESIGN and field in IGNORED_BY_DESIGN[table]:
        return True
    # 1. Common FK patterns: requirements → requirements_id
    if field + "_id" in other_fields:
        return True
    if field.endswith("_id") and field[:-3] in other_fields:
        return True

    # 2. Common `xxx_id` vs `id` (e.g. npc_id ↔ id)
    if field.endswith("_id") and "id" in other_fields:
        return True
    if field == "id" and any(f.endswith("_id") for f in other_fields):
        return True

    # 3. Denormalized references (e.g. quest_id in schema vs id in model)
    if field.endswith("_id") and any(field.startswith(prefix) for prefix in other_fields):
        return True

    # 4. Denormalized array props (e.g. schema: 'attributes', model: 'attr_strength')
    plural_prefixes = {
        "attributes": "attr_",
        "stats": "stat_",
        "flags": "flag_",
        "effects": "effect_"
    }
    for plural, prefix in plural_prefixes.items():
        if field == plural and any(f.startswith(prefix) for f in other_fields):
            return True

    return False

