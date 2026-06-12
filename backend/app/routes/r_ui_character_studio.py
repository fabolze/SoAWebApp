from collections import defaultdict
from copy import deepcopy

from flask import Blueprint, abort, jsonify, request
from werkzeug.exceptions import HTTPException

from backend.app.db.init_db import get_db_session
from backend.app.models.m_abilities import Ability
from backend.app.models.m_character_narrative import CharacterRelationship, CharacterStoryBeat, CharacterStoryProfile
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_characters import Character
from backend.app.models.m_combat_profiles import CombatProfile
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Faction
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_locations import Location
from backend.app.models.m_quests import Quest
from backend.app.models.m_shops import Shop
from backend.app.models.m_story_arcs import StoryArc
from backend.app.routes.bundle_validation import bundle_error_response, wrap_bundle_error
from backend.app.routes.r_character_narrative import relationship_route, story_beat_route, story_profile_route
from backend.app.routes.r_characters import route as character_route
from backend.app.routes.r_combat_profiles import route as combat_profile_route
from backend.app.routes.r_interaction_profiles import route as interaction_profile_route
from backend.app.utils.id import generate_ulid


bp = Blueprint("ui_character_studio", __name__)


def _enum_value(value):
    return getattr(value, "value", value)


def _columns(model):
    if not model:
        return None
    return {column.name: _enum_value(getattr(model, column.name)) for column in model.__table__.columns}


def _compact(model):
    if not model:
        return None
    data = _columns(model)
    return {
        key: data.get(key)
        for key in (
            "id", "slug", "name", "title", "description", "level", "role", "character_id",
            "speaker_character_id", "dialogue_id", "location_id", "story_arc_id", "encounter_type", "tags",
        )
        if key in data
    }


def _upsert(db_session, route, model, data, path):
    try:
        if not isinstance(data, dict) or not data.get("id"):
            abort(400, description=f"{path}.id is required")
        item = db_session.get(model, data["id"]) or model(id=data["id"])
        route.validate_required_fields(data, route.get_schema_required_fields())
        route.process_input_data(db_session, item, dict(data))
        route._normalize_common_fields(item, data)
        route.validate_persisted_schema_types(item)
        db_session.add(item)
        db_session.flush()
        return item
    except Exception as error:
        raise wrap_bundle_error(path, error) from error


def _navigator(db_session):
    combat_ids = {row.character_id for row in db_session.query(CombatProfile).all()}
    interaction_by_character = {row.character_id: row for row in db_session.query(InteractionProfile).all()}
    encounter_counts = defaultdict(int)
    for encounter in db_session.query(Encounter).all():
        for participant in encounter.participants or []:
            if isinstance(participant, dict) and participant.get("character_id"):
                encounter_counts[participant["character_id"]] += 1
    dialogue_counts = defaultdict(int)
    for dialogue in db_session.query(Dialogue).all():
        if dialogue.character_id:
            dialogue_counts[dialogue.character_id] += 1
    for node in db_session.query(DialogueNode).all():
        if node.speaker_character_id:
            dialogue_counts[node.speaker_character_id] += 1
    return [{
        **_compact(character),
        "has_combat_profile": character.id in combat_ids,
        "interaction_role": _enum_value(getattr(interaction_by_character.get(character.id), "role", None)),
        "encounter_count": encounter_counts[character.id],
        "dialogue_count": dialogue_counts[character.id],
    } for character in db_session.query(Character).all()]


def _presence(db_session, character_id):
    encounters = [
        encounter for encounter in db_session.query(Encounter).all()
        if any(isinstance(row, dict) and row.get("character_id") == character_id for row in encounter.participants or [])
    ]
    dialogues = {
        dialogue.id: dialogue for dialogue in db_session.query(Dialogue).filter_by(character_id=character_id).all()
    }
    speaker_nodes = db_session.query(DialogueNode).filter_by(speaker_character_id=character_id).all()
    for node in speaker_nodes:
        dialogue = db_session.get(Dialogue, node.dialogue_id)
        if dialogue:
            dialogues[dialogue.id] = dialogue
    shops = db_session.query(Shop).filter_by(character_id=character_id).all()
    interaction = db_session.query(InteractionProfile).filter_by(character_id=character_id).first()
    combat = db_session.query(CombatProfile).filter_by(character_id=character_id).first()
    quest_ids = set((interaction.available_quests if interaction else []) or []) | set((combat.related_quests if combat else []) or [])
    quests = [quest for quest in db_session.query(Quest).all() if quest.id in quest_ids]
    locations = {}
    character = db_session.get(Character, character_id)
    if character and character.home_location_id:
        location = db_session.get(Location, character.home_location_id)
        if location:
            locations[location.id] = location
    for dialogue in dialogues.values():
        if dialogue.location_id:
            location = db_session.get(Location, dialogue.location_id)
            if location:
                locations[location.id] = location
    return {
        "encounters": [_columns(row) for row in encounters],
        "dialogues": [_columns(row) for row in dialogues.values()],
        "dialogue_nodes": [_columns(row) for row in speaker_nodes],
        "shops": [_columns(row) for row in shops],
        "quests": [_columns(row) for row in quests],
        "locations": [_columns(row) for row in locations.values()],
    }


def _graph(db_session, character, combat, interaction, profile, relationships, beats, presence):
    nodes = {}
    edges = []

    def add_node(kind, entry, label=None, metadata=None):
        if not entry:
            return ""
        entry_id = entry.get("id") if isinstance(entry, dict) else entry.id
        data = entry if isinstance(entry, dict) else _columns(entry)
        key = f"{kind}:{entry_id}"
        nodes[key] = {
            "id": key, "kind": kind, "entry_id": entry_id,
            "label": label or data.get("name") or data.get("title") or data.get("slug") or entry_id,
            "data": data, "metadata": metadata or {},
        }
        return key

    def edge(source, target, relation, explicit=True, editable=False, path="", metadata=None):
        if source and target:
            edges.append({
                "id": f"{source}>{relation}>{target}>{path}", "source": source, "target": target,
                "relation": relation, "explicit": explicit, "editable": editable, "path": path,
                "metadata": metadata or {},
            })

    center = add_node("character", character)
    for field, kind, model in [
        ("class_id", "class", CharacterClass), ("faction_id", "faction", Faction), ("home_location_id", "location", Location),
    ]:
        target = db_session.get(model, character.get(field)) if character.get(field) else None
        edge(center, add_node(kind, target), field.removesuffix("_id"), True, True, field)
    for ability_id in (combat or {}).get("custom_abilities", []) or []:
        edge(center, add_node("ability", db_session.get(Ability, ability_id)), "uses", True, True, "combat_profile.custom_abilities")
    for kind, entries in presence.items():
        singular = kind.removesuffix("s")
        for entry in entries:
            edge(center, add_node(singular, entry), "appears_in", True, kind in {"encounters", "dialogues", "shops", "quests"}, f"world_presence.{kind}")
    for relation in relationships:
        other_id = relation["to_character_id"] if relation["from_character_id"] == character["id"] else relation["from_character_id"]
        other = db_session.get(Character, other_id)
        target = add_node("character", other)
        direction = "outgoing" if relation["from_character_id"] == character["id"] else "incoming"
        edge(center, target, relation["relationship_type"], True, True, f"relationships.{relation['id']}", {"direction": direction, "relationship": relation})
    for beat in beats:
        beat_node = add_node("story_beat", beat)
        edge(center, beat_node, "story_beat", True, True, f"story_beats.{beat['id']}")
        for field, kind in [
            ("quest_id", "quest"), ("dialogue_id", "dialogue"), ("encounter_id", "encounter"),
            ("event_id", "event"), ("location_id", "location"), ("story_arc_id", "story_arc"),
        ]:
            source_id = beat.get(field)
            if source_id:
                model = {"quest": Quest, "dialogue": Dialogue, "encounter": Encounter, "event": Event, "location": Location, "story_arc": StoryArc}[kind]
                edge(beat_node, add_node(kind, db_session.get(model, source_id)), "references", True, True, field)
    # Shared encounter proximity is useful but not a canonical social relationship.
    for encounter in presence["encounters"]:
        for participant in encounter.get("participants", []) or []:
            other_id = participant.get("character_id") if isinstance(participant, dict) else None
            if other_id and other_id != character["id"]:
                edge(center, add_node("character", db_session.get(Character, other_id)), "shared_encounter", False, False, f"encounters.{encounter['id']}")
    return {"nodes": list(nodes.values()), "edges": edges}


def _health(character, combat, interaction, profile, relationships, beats, presence):
    blockers = []
    warnings = []
    if not character.get("name"):
        blockers.append("Name is required.")
    if not character.get("slug"):
        blockers.append("Slug is required.")
    if combat and not character.get("class_id"):
        blockers.append("Combat character needs a class.")
    if profile:
        for key, label in [("want", "want"), ("need", "need"), ("contradiction", "contradiction")]:
            if not profile.get(key):
                warnings.append(f"Story profile has no authored {label}.")
    else:
        warnings.append("Character has no story profile.")
    if not relationships:
        warnings.append("Character has no named relationships.")
    if not beats:
        warnings.append("Character has no authored story beats.")
    for beat in beats:
        if not any(beat.get(key) for key in ["quest_id", "dialogue_id", "encounter_id", "event_id", "location_id", "story_arc_id"]):
            warnings.append(f"Story beat '{beat.get('title')}' has no source content.")
    if interaction and _enum_value(interaction.get("role")) == "Questgiver" and not interaction.get("available_quests"):
        warnings.append("Quest giver offers no quests.")
    if combat and not presence["encounters"]:
        warnings.append("Combat character has no encounter presence.")
    return {"blockers": blockers, "warnings": warnings}


def _unplaced(presence, beats):
    placed = {
        (field.removesuffix("_id"), beat[field])
        for beat in beats
        for field in ["quest_id", "dialogue_id", "encounter_id", "event_id", "location_id", "story_arc_id"]
        if beat.get(field)
    }
    return [
        {"kind": kind.removesuffix("s"), "entry": entry}
        for kind in ["quests", "dialogues", "encounters", "locations"]
        for entry in presence[kind]
        if (kind.removesuffix("s"), entry["id"]) not in placed
    ]


def _catalogs(db_session):
    return {
        "characters": [_compact(row) for row in db_session.query(Character).all()],
        "abilities": [_compact(row) for row in db_session.query(Ability).all()],
        "quests": [_compact(row) for row in db_session.query(Quest).all()],
        "dialogues": [_compact(row) for row in db_session.query(Dialogue).all()],
        "dialogue_nodes": [_compact(row) for row in db_session.query(DialogueNode).all()],
        "encounters": [_columns(row) for row in db_session.query(Encounter).all()],
        "shops": [_compact(row) for row in db_session.query(Shop).all()],
        "locations": [_compact(row) for row in db_session.query(Location).all()],
        "factions": [_compact(row) for row in db_session.query(Faction).all()],
        "characterclasses": [_compact(row) for row in db_session.query(CharacterClass).all()],
        "events": [_compact(row) for row in db_session.query(Event).all()],
        "story_arcs": [_compact(row) for row in db_session.query(StoryArc).all()],
    }


def _packet(db_session, character):
    character_data = _columns(character)
    combat_model = db_session.query(CombatProfile).filter_by(character_id=character.id).first()
    interaction_model = db_session.query(InteractionProfile).filter_by(character_id=character.id).first()
    profile_model = db_session.query(CharacterStoryProfile).filter_by(character_id=character.id).first()
    relationships = [
        _columns(row) for row in db_session.query(CharacterRelationship).all()
        if character.id in {row.from_character_id, row.to_character_id}
    ]
    beats = sorted(
        [_columns(row) for row in db_session.query(CharacterStoryBeat).filter_by(character_id=character.id).all()],
        key=lambda row: (row.get("sort_order", 0), row.get("id", "")),
    )
    combat = _columns(combat_model)
    interaction = _columns(interaction_model)
    profile = _columns(profile_model)
    presence = _presence(db_session, character.id)
    return {
        "navigator": _navigator(db_session),
        "character": character_data,
        "combat_profile": combat,
        "interaction_profile": interaction,
        "story_profile": profile,
        "relationships": relationships,
        "story_beats": beats,
        "world_presence": presence,
        "graph": _graph(db_session, character_data, combat, interaction, profile, relationships, beats, presence),
        "catalogs": _catalogs(db_session),
        "health": _health(character_data, combat, interaction, profile, relationships, beats, presence),
        "unplaced_presence": _unplaced(presence, beats),
    }


def _new_character():
    return Character(id=generate_ulid(), slug="", name="", title="", description="", level=1, tags=[])


@bp.get("/api/ui/character-studio")
def get_character_studio_selector():
    db_session = get_db_session()
    try:
        return jsonify({"navigator": _navigator(db_session), "catalogs": _catalogs(db_session)})
    finally:
        db_session.close()


@bp.get("/api/ui/character-studio/new")
def get_new_character_studio():
    db_session = get_db_session()
    try:
        character = _new_character()
        db_session.add(character)
        db_session.flush()
        packet = _packet(db_session, character)
        db_session.rollback()
        return jsonify(packet)
    finally:
        db_session.close()


@bp.get("/api/ui/character-studio/<character_id>")
def get_character_studio(character_id):
    db_session = get_db_session()
    try:
        character = db_session.get(Character, character_id)
        if not character:
            abort(404, description=f"Character {character_id} not found")
        return jsonify(_packet(db_session, character))
    finally:
        db_session.close()


def _expect(item, field, expected, path):
    actual = _enum_value(getattr(item, field))
    if actual != expected:
        abort(400, description=f"{path}.expected_previous is stale")


def _review_change(review, action, table, item_id, details=None):
    review[action].append({"table": table, "id": item_id, "details": details or {}})


def _apply_presence(db_session, payload, allowed_ids, review, warnings):
    presence = payload.get("presence", {})
    if not isinstance(presence, dict):
        abort(400, description="presence must be an object")
    for key, model, field in [
        ("dialogues", Dialogue, "character_id"), ("shops", Shop, "character_id"),
        ("dialogue_nodes", DialogueNode, "speaker_character_id"),
    ]:
        for index, change in enumerate(presence.get(key, []) or []):
            path = f"presence.{key}[{index}]"
            item = db_session.get(model, change.get("id"))
            if not item:
                abort(400, description=f"{path}.id references missing content")
            _expect(item, field, change.get("expected_previous"), path)
            next_id = change.get("value") or None
            if next_id and next_id not in allowed_ids:
                abort(400, description=f"{path}.value is outside the selected character scope")
            previous = getattr(item, field)
            if previous and previous != next_id:
                warnings.append({"id": f"{key}:{item.id}:reassign", "message": f"Reassign {key.removesuffix('s')} from another character."})
            setattr(item, field, next_id)
            db_session.add(item)
            _review_change(review, "changed", model.__tablename__, item.id, {field: {"from": previous, "to": next_id}})
    for index, change in enumerate(presence.get("encounters", []) or []):
        path = f"presence.encounters[{index}]"
        encounter = db_session.get(Encounter, change.get("id"))
        if not encounter:
            abort(400, description=f"{path}.id references missing encounter")
        expected = change.get("expected_previous")
        if expected != (encounter.participants or []):
            abort(400, description=f"{path}.expected_previous is stale")
        participants = change.get("participants")
        if not isinstance(participants, list):
            abort(400, description=f"{path}.participants must be an array")
        previous_others = [row for row in encounter.participants or [] if not isinstance(row, dict) or row.get("character_id") not in allowed_ids]
        next_others = [row for row in participants if not isinstance(row, dict) or row.get("character_id") not in allowed_ids]
        if previous_others != next_others:
            abort(400, description=f"{path} cannot modify unrelated participants")
        encounter.participants = participants
        db_session.add(encounter)
        _review_change(review, "changed", "encounters", encounter.id, {"participants": {"from": expected, "to": participants}})


def _apply_quest_links(db_session, payload, allowed_ids, review):
    for index, change in enumerate(payload.get("quest_links", []) or []):
        path = f"quest_links[{index}]"
        character_id = change.get("character_id")
        if character_id not in allowed_ids:
            abort(400, description=f"{path}.character_id is outside the selected scope")
        link_type = change.get("link_type")
        model = InteractionProfile if link_type == "offered" else CombatProfile if link_type == "combat" else None
        field = "available_quests" if link_type == "offered" else "related_quests"
        profile = db_session.query(model).filter_by(character_id=character_id).first() if model else None
        if not profile:
            abort(400, description=f"{path} requires the matching profile")
        expected = change.get("expected_previous")
        if expected != (getattr(profile, field) or []):
            abort(400, description=f"{path}.expected_previous is stale")
        values = change.get("value")
        if not isinstance(values, list) or any(not db_session.get(Quest, quest_id) for quest_id in values):
            abort(400, description=f"{path}.value contains invalid quests")
        setattr(profile, field, values)
        db_session.add(profile)
        _review_change(review, "changed", model.__tablename__, profile.id, {field: {"from": expected, "to": values}})


def _reconcile(db_session, payload, commit):
    if not isinstance(payload, dict):
        abort(400, description="character studio mutation must be an object")
    mode = payload.get("mode", "individual")
    if mode not in {"individual", "ensemble"}:
        abort(400, description="mode must be individual or ensemble")
    selected_ids = payload.get("selected_character_ids", [])
    if not isinstance(selected_ids, list) or any(not isinstance(value, str) for value in selected_ids):
        abort(400, description="selected_character_ids must be an array")
    if mode == "ensemble" and not 2 <= len(set(selected_ids)) <= 8:
        abort(400, description="ensemble mode requires two to eight selected characters")
    review = {"created": [], "changed": [], "deleted": []}
    warnings = []
    primary = payload.get("character")
    if mode == "individual":
        if not isinstance(primary, dict) or not primary.get("id"):
            abort(400, description="individual mutation requires character")
        selected_ids = [primary["id"]]
        existed = db_session.get(Character, primary["id"]) is not None
        character = _upsert(db_session, character_route, Character, primary, "character")
        _review_change(review, "changed" if existed else "created", "characters", character.id)
        for key, model, route in [
            ("combat_profile", CombatProfile, combat_profile_route),
            ("interaction_profile", InteractionProfile, interaction_profile_route),
            ("story_profile", CharacterStoryProfile, story_profile_route),
        ]:
            data = payload.get(key)
            if data is not None:
                if data.get("character_id") != character.id:
                    abort(400, description=f"{key}.character_id must match character.id")
                existed = db_session.get(model, data["id"]) is not None
                item = _upsert(db_session, route, model, data, key)
                _review_change(review, "changed" if existed else "created", model.__tablename__, item.id)
    allowed_ids = set(selected_ids)
    for character_id in allowed_ids:
        if not db_session.get(Character, character_id):
            abort(400, description=f"selected character does not exist: {character_id}")
    for key, model, route in [
        ("relationships", CharacterRelationship, relationship_route), ("story_beats", CharacterStoryBeat, story_beat_route),
    ]:
        for index, data in enumerate(payload.get(key, []) or []):
            involved = {data.get("character_id")} if key == "story_beats" else {data.get("from_character_id"), data.get("to_character_id")}
            if not involved <= allowed_ids and mode == "ensemble":
                abort(400, description=f"{key}[{index}] is outside ensemble scope")
            if mode == "individual" and not involved & allowed_ids:
                abort(400, description=f"{key}[{index}] is outside character scope")
            existing = db_session.get(model, data.get("id"))
            existed = existing is not None
            if existing and data.get("expected_previous") != _columns(existing):
                abort(400, description=f"{key}[{index}].expected_previous is stale")
            item = _upsert(db_session, route, model, data, f"{key}[{index}]")
            _review_change(review, "changed" if existed else "created", model.__tablename__, item.id)
    deletions = payload.get("deletions", {})
    if not isinstance(deletions, dict):
        abort(400, description="deletions must be an object")
    delete_models = {
        "relationships": CharacterRelationship, "story_beats": CharacterStoryBeat,
        "combat_profile": CombatProfile, "interaction_profile": InteractionProfile, "story_profile": CharacterStoryProfile,
    }
    if mode == "ensemble" and set(deletions) - {"relationships", "story_beats"}:
        abort(400, description="ensemble mode cannot delete profiles")
    for key, ids in deletions.items():
        model = delete_models.get(key)
        if not model or not isinstance(ids, list):
            abort(400, description=f"deletions.{key} is unsupported")
        for item_id in ids:
            item = db_session.get(model, item_id)
            if not item:
                continue
            involved = {getattr(item, "character_id", None), getattr(item, "from_character_id", None), getattr(item, "to_character_id", None)}
            if not (involved - {None}) & allowed_ids:
                abort(400, description=f"deletions.{key} is outside selected character scope")
            if model is CombatProfile:
                for encounter in db_session.query(Encounter).all():
                    for row in encounter.participants or []:
                        if isinstance(row, dict) and row.get("character_id") == item.character_id and "Combat" in (row.get("contexts") or []):
                            pending = next((change for change in (payload.get("presence", {}).get("encounters", []) or []) if change.get("id") == encounter.id), None)
                            if not pending or any(isinstance(next_row, dict) and next_row.get("character_id") == item.character_id and "Combat" in (next_row.get("contexts") or []) for next_row in pending.get("participants", [])):
                                abort(400, description="combat profile cannot be deleted while Combat encounter contexts remain")
            db_session.delete(item)
            _review_change(review, "deleted", model.__tablename__, item_id)
    _apply_presence(db_session, payload, allowed_ids, review, warnings)
    _apply_quest_links(db_session, payload, allowed_ids, review)
    accepted = set(payload.get("accepted_warning_ids", []) or [])
    missing_acceptance = [warning for warning in warnings if warning["id"] not in accepted]
    blockers = []
    if commit and missing_acceptance:
        blockers.append("Accept all destructive reassignment warnings before commit.")
    if commit and blockers:
        abort(400, description=blockers[0])
    db_session.flush()
    return {"review": review, "warnings": warnings, "blockers": blockers, "selected_character_ids": list(allowed_ids)}


@bp.post("/api/ui/character-studio/preview")
def preview_character_studio():
    db_session = get_db_session()
    try:
        result = _reconcile(db_session, deepcopy(request.get_json(silent=True)), False)
        db_session.rollback()
        return jsonify(result)
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()


@bp.post("/api/ui/character-studio/bundle")
def save_character_studio():
    db_session = get_db_session()
    try:
        payload = request.get_json(silent=True)
        result = _reconcile(db_session, payload, True)
        db_session.commit()
        selected = result["selected_character_ids"]
        if len(selected) == 1:
            return jsonify({"result": result, "packet": _packet(db_session, db_session.get(Character, selected[0]))})
        return jsonify({"result": result, "packets": [_packet(db_session, db_session.get(Character, character_id)) for character_id in selected]})
    except Exception as error:
        db_session.rollback()
        if isinstance(error, HTTPException) and error.code != 400:
            raise
        return bundle_error_response(error)
    finally:
        db_session.close()
