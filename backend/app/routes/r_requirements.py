from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_requirements import (
    Requirement, RequirementRequiredFlag, 
    RequirementForbiddenFlag, RequirementMinFactionReputation
)
from backend.app.models.m_flags import Flag
from backend.app.models.m_factions import Faction
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class RequirementRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Requirement,
            blueprint_name='requirements',
            route_prefix='/api/requirements'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, requirement: Requirement, data: Dict[str, Any]) -> None:
        # Required
        requirement.slug = data["slug"]
        # Clear existing relationships
        requirement.required_flags.clear()
        requirement.forbidden_flags.clear()
        requirement.min_faction_reputation.clear()
        
        # Required flags validation and creation
        for flag_id in data.get("required_flags", []):
            if not db_session.get(Flag, flag_id):
                raise ValueError(f"Invalid flag_id: {flag_id}")
            flag_req = RequirementRequiredFlag(requirement=requirement, flag_id=flag_id)
            db_session.add(flag_req)
        
        # Forbidden flags validation and creation
        for flag_id in data.get("forbidden_flags", []):
            if not db_session.get(Flag, flag_id):
                raise ValueError(f"Invalid flag_id: {flag_id}")
            flag_req = RequirementForbiddenFlag(requirement=requirement, flag_id=flag_id)
            db_session.add(flag_req)
        
        # Faction reputation validation and creation
        for rep_req in data.get("min_faction_reputation", []):
            if not all(k in rep_req for k in ["faction_id", "min"]):
                raise ValueError("Invalid faction reputation entry: missing faction_id or min")
                
            if not db_session.get(Faction, rep_req["faction_id"]):
                raise ValueError(f"Invalid faction_id: {rep_req['faction_id']}")
                
            faction_req = RequirementMinFactionReputation(
                requirement=requirement,
                faction_id=rep_req["faction_id"],
                min_value=float(rep_req["min"])
            )
            db_session.add(faction_req)
        
        requirement.tags = data.get("tags", [])

    def serialize_item(self, requirement: Requirement) -> Dict[str, Any]:
        data = self.serialize_model(requirement)
        data["required_flags"] = [entry.flag_id for entry in (requirement.required_flags or [])]
        data["forbidden_flags"] = [entry.flag_id for entry in (requirement.forbidden_flags or [])]
        data["min_faction_reputation"] = [
            {
                "faction_id": entry.faction_id,
                "min": entry.min_value,
            }
            for entry in (requirement.min_faction_reputation or [])
        ]
        return data

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    self.model.id.ilike(f"%{search}%")
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
bp = RequirementRoute().bp
