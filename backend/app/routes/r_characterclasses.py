from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_characterclasses import CharacterClass, ClassRole
from backend.app.models.m_stats import Stat
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
           return ["id", "slug", "name", "role", "base_stats"]
           
       def get_id_from_data(self, data: Dict[str, Any]) -> str:
           return data["id"]
       
       def process_input_data(self, db_session: Session, char_class: CharacterClass, data: Dict[str, Any]) -> None:  # CORRECTED HERE
           def _normalize_stat_entries(entries: Any, field_name: str) -> List[Dict[str, Any]]:
               if entries is None:
                   return []
               if isinstance(entries, dict):
                   normalized: List[Dict[str, Any]] = []
                   for key, value in entries.items():
                       if value is None:
                           raise ValueError(f"{field_name} entries must include value")
                       stat = db_session.get(Stat, key)
                       if not stat:
                           stat = db_session.query(Stat).filter(Stat.slug == key).first()
                       if not stat:
                           raise ValueError(f"Invalid stat reference in {field_name}: {key}")
                       normalized.append({"stat_id": stat.id, "value": value})
                   return normalized
               if isinstance(entries, list):
                   normalized = []
                   for entry in entries:
                       if not isinstance(entry, dict):
                           raise ValueError(f"{field_name} entries must be objects")
                       stat_ref = entry.get("stat_id")
                       if stat_ref is None:
                           raise ValueError(f"{field_name} entries must include stat_id")
                       value = entry.get("value")
                       if value is None:
                           raise ValueError(f"{field_name} entries must include value")
                       stat = db_session.get(Stat, stat_ref)
                       if not stat:
                           stat = db_session.query(Stat).filter(Stat.slug == stat_ref).first()
                       if not stat:
                           raise ValueError(f"Invalid stat_id in {field_name}: {stat_ref}")
                       normalized.append({"stat_id": stat.id, "value": value})
                   return normalized
               raise ValueError(f"{field_name} must be an array of stat entries")

           # Validate enums
           self.validate_enums(data, {
               "role": ClassRole
           })
           
           # Required fields
           char_class.slug = data["slug"]
           char_class.name = data["name"]
           char_class.role = data["role"]  # Already converted to enum
           char_class.base_stats = _normalize_stat_entries(data["base_stats"], "base_stats")
           
           # Optional fields
           char_class.description = data.get("description")
           char_class.stat_growth = _normalize_stat_entries(data.get("stat_growth", []), "stat_growth")
           char_class.starting_abilities = data.get("starting_abilities", [])
           char_class.preferred_attributes = data.get("preferred_attributes", [])
           char_class.starting_equipment = data.get("starting_equipment", [])
           char_class.tags = data.get("tags", [])

       def serialize_item(self, char_class: CharacterClass) -> Dict[str, Any]:  # CORRECTED HERE
           return self.serialize_model(char_class)

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
bp = ClassRoute().bp
