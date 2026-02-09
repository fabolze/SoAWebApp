from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_talent_trees import TalentTree
from backend.app.models.m_characterclasses import CharacterClass
from backend.app.models.m_requirements import Requirement
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class TalentTreeRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=TalentTree,
            blueprint_name='talent_trees',
            route_prefix='/api/talent-trees'
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, tree: TalentTree, data: Dict[str, Any]) -> None:
        self.validate_relationships(db_session, data, {
            "class_id": CharacterClass,
            "requirements_id": Requirement,
        })

        tree.slug = data["slug"]
        tree.name = data["name"]
        tree.description = data.get("description")
        tree.class_id = data.get("class_id")
        tree.requirements_id = data.get("requirements_id")
        tree.icon_path = data.get("icon_path")
        tree.tags = data.get("tags", [])

    def serialize_item(self, tree: TalentTree) -> Dict[str, Any]:
        return self.serialize_model(tree)

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.name.ilike(f"%{search}%")) |
                    (self.model.slug.ilike(f"%{search}%")) |
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


bp = TalentTreeRoute().bp

