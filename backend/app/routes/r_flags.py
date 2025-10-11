from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_flags import Flag, FlagType
from backend.app.models.m_content_packs import ContentPack
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session

class FlagRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Flag,
            blueprint_name='flags',
            route_prefix='/api/flags'
        )
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name", "description"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, flag: Flag, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "flag_type": FlagType
        })

        # Validate relationships
        self.validate_relationships(db_session, data, {
            "content_pack_id": ContentPack
        })
        
        # Required fields
        flag.slug = data["slug"]
        flag.name = data["name"]
        flag.description = data["description"]
        
        # Optional fields
        flag.flag_type = data.get("flag_type")  # Already converted to enum if present
        flag.default_value = data.get("default_value", False)
        flag.content_pack_id = data.get("content_pack_id")
        
        # JSON fields
        flag.tags = data.get("tags", [])

    def serialize_item(self, flag: Flag) -> Dict[str, Any]:
        return self.serialize_model(flag)
    
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
bp = FlagRoute().bp
