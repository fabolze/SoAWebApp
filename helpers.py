# helpers.py
import uuid

def _csv(form, key):
    raw = form.get(key, '').strip()
    return [s.strip() for s in raw.split(',')] if raw else []

def _i(form, key):
    v = form.get(key, '').strip()
    return int(v) if v else None

def build_item_from_form(form):
    return {
        "id"            : form.get("id") or uuid.uuid4().hex,
        "name"          : form["name"],
        "type"          : form["type"],
        "rarity"        : form.get("rarity"),
        "description"   : form.get("description"),
        # NEW model fields
        "equipment_slot": form.get("equipment_slot"),
        "weapon_slot_type": form.get("weapon_slot_type"),
        "item_stats"    : {
            "armor"       : _i(form, "armor"),
            "damage"      : _i(form, "damage"),
            "magic_resist": _i(form, "magic_resist"),
        },
        "attributes_bonus": {
            "strength": _i(form, "strength"),
            "vitality": _i(form, "vitality"),
        },
        "requirements"  : {
            "level"   : _i(form, "req_level"),
            "strength": _i(form, "req_strength"),
        },
        "effects"       : _csv(form, "effects"),
        "tags"          : _csv(form, "tags"),
        "value"         : _i(form, "value") or 0,
        "is_quest_item" : "is_quest_item"  in form,
        "is_consumable" : "is_consumable" in form,
        "is_material"   : "is_material"   in form,
        "image_path"    : form.get("image_path"),
    }
