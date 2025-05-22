from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class ClassRoute(BaseRoute):
       def __init__(self):
           super().__init__(
               model=CharacterClass,  # CORRECTED HERE
               blueprint_name='characterclasses',
               route_prefix='/api/characterclasses'
           )
       
       def get_required_fields(self) -> List[str]:
           return ["class_id", "name", "role", "base_stats"]
           
       def get_id_from_data(self, data: Dict[str, Any]) -> str:
           return data["class_id"]
       
       def process_input_data(self, db_session: Session, char_class: CharacterClass, data: Dict[str, Any]) -> None:  # CORRECTED HERE
           # Validate enums
           self.validate_enums(data, {
               "role": ClassRole
           })
           
           # Required fields
           char_class.name = data["name"]
           char_class.role = data["role"]  # Already converted to enum
           char_class.base_stats = data["base_stats"]
           
           # Optional fields
           char_class.description = data.get("description")
           char_class.stat_growth = data.get("stat_growth", {})
           char_class.starting_abilities = data.get("starting_abilities", [])
           char_class.preferred_attributes = data.get("preferred_attributes", [])
           char_class.starting_equipment = data.get("starting_equipment", [])
           char_class.tags = data.get("tags", [])

       def serialize_item(self, char_class: CharacterClass) -> Dict[str, Any]:  # CORRECTED HERE
           return {
               "id": char_class.id,
               "name": char_class.name,
               "description": char_class.description,
               "role": char_class.role.value if char_class.role else None,
               "base_stats": char_class.base_stats,
               "stat_growth": char_class.stat_growth,
               "starting_abilities": char_class.starting_abilities,
               "preferred_attributes": char_class.preferred_attributes,
               "starting_equipment": char_class.starting_equipment,
               "tags": char_class.tags
           }

       def get_all(self):
           db_session = get_db_session()
           try:
               search = request.args.get('search', '').strip()
               query = db_session.query(self.model)
               if search:
                   query = query.filter(
                       (self.model.name.ilike(f"%{search}%")) |
                       (self.model.id.ilike(f"%{search}%"))
                   )
               items = query.all()
               return jsonify(self.serialize_list(items))
           finally:
               db_session.close()

# Create the route instance
bp = ClassRoute().bp
