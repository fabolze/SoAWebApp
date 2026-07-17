from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_factions import Faction, Alignment
from backend.app.models.m_requirements import RequirementMinFactionReputation
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import abort, request, jsonify
from backend.app.db.init_db import get_db_session
from backend.app.services.narrative_contracts import validate_reputation_ranks

class FactionRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Faction,
            blueprint_name='factions',
            route_prefix='/api/factions'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "alignment"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, faction: Faction, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "alignment": Alignment
        })
        
        # Required fields
        faction.slug = data["slug"]
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
        faction.reputation_ranks = validate_reputation_ranks(data.get("reputation_ranks", []))
        faction.tags = data.get("tags", [])

    def serialize_item(self, faction: Faction) -> Dict[str, Any]:
        return self.serialize_model(faction)

    def delete(self, item_id: str):
        db_session = get_db_session()
        try:
            faction = db_session.get(Faction, item_id)
            if not faction:
                abort(404, description=f"Item {item_id} not found")
            cascade_deleted = (
                db_session.query(RequirementMinFactionReputation)
                .filter_by(faction_id=item_id)
                .count()
            )
            db_session.query(RequirementMinFactionReputation).filter_by(faction_id=item_id).delete()
            db_session.delete(faction)
            db_session.commit()
            return jsonify({"status": "ok", "cascade_deleted": {"requirement_min_faction_reputation": cascade_deleted}})
        except Exception as error:
            db_session.rollback()
            abort(400, description=f"Error deleting item: {str(error)}")
        finally:
            db_session.close()

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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
bp = FactionRoute().bp

