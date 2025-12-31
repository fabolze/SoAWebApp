# backend/app/routes/r_characters.py
from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_characters import Character
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_factions import Faction
from backend.app.models.m_locations import Location
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class CharacterRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Character,
            blueprint_name="characters",
            route_prefix="/api/characters"
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, character: Character, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "class_id": CharacterClass,
            "faction_id": Faction,
            "home_location_id": Location
        })

        # Required fields
        character.slug = data["slug"]
        character.name = data["name"]

        # Optional fields
        character.title = data.get("title")
        character.description = data.get("description")
        character.image_path = data.get("image_path")
        character.level = data.get("level")

        # Optional relationships
        character.class_id = data.get("class_id")
        character.faction_id = data.get("faction_id")
        character.home_location_id = data.get("home_location_id")

        # JSON fields
        character.tags = data.get("tags", [])

    def serialize_item(self, character: Character) -> Dict[str, Any]:
        return self.serialize_model(character)

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get("search", "").strip()
            tags = request.args.get("tags", "").strip().lower().split(",") if request.args.get("tags") else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%")) |
                    (self.model.id.ilike(f"%{search}%"))
                )
            if tags:
                query = query.filter(self.model.tags != None)
                for tag in tags:
                    tag = tag.strip()
                    if tag:
                        query = query.filter(
                            self.model.tags.any(lambda t: t.ilike(f"%{tag}%"))
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()


bp = CharacterRoute().bp
