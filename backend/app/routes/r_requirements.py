from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_requirements import (
    Requirement, RequirementRequiredFlag, 
    RequirementForbiddenFlag, RequirementMinFactionReputation
)
from backend.app.models.m_flags import Flag
from backend.app.models.m_factions import Faction
from typing import Any, Dict, List
from sqlalchemy.orm import Session

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

    def serialize_item(self, requirement: Requirement) -> Dict[str, Any]:
        return {
            "id": requirement.id,
            "required_flags": [rf.flag_id for rf in requirement.required_flags],
            "forbidden_flags": [ff.flag_id for ff in requirement.forbidden_flags],
            "min_faction_reputation": [{
                "faction_id": fr.faction_id,
                "min": fr.min_value
            } for fr in requirement.min_faction_reputation]
        }

# Create the route instance
bp = RequirementRoute().bp
