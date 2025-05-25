from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_factions import Faction, Alignment
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class FactionRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Faction,
            blueprint_name='factions',
            route_prefix='/api/factions'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["faction_id", "name", "alignment"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["faction_id"]
    
    def process_input_data(self, db_session: Session, faction: Faction, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "alignment": Alignment
        })
        
        # Required fields
        faction.name = data["name"]
        faction.alignment = data["alignment"]  # Already converted to enum
        
        # Optional fields
        faction.description = data.get("description")
        faction.icon_path = data.get("icon_path")
        
        # JSON fields with relationship alignment validation
        relationships = data.get("relationships", {})
        for rel_alignment in relationships.values():
            try:
                Alignment(rel_alignment)
            except ValueError:
                raise ValueError(f"Invalid relationship alignment: {rel_alignment}")
        faction.relationships = relationships
        
        faction.reputation_config = data.get("reputation_config", {})
        faction.tags = data.get("tags", [])

    def serialize_item(self, faction: Faction) -> Dict[str, Any]:
        return {
            "id": faction.id,
            "name": faction.name,
            "description": faction.description,
            "alignment": faction.alignment.value if faction.alignment else None,
            "relationships": faction.relationships,
            "reputation_config": faction.reputation_config,
            "tags": faction.tags,
            "icon_path": faction.icon_path
        }

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
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

# Create the route instance
bp = FactionRoute().bp
