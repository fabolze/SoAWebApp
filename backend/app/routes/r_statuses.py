from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_statuses import Status, StatusCategory
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class StatusRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=Status,
            blueprint_name="statuses",
            route_prefix="/api/statuses",
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "name"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, status: Status, data: Dict[str, Any]) -> None:
        # Validate enums
        self.validate_enums(data, {
            "category": StatusCategory,
        })

        # Required fields
        status.slug = data["slug"]
        status.name = data["name"]

        # Optional fields
        status.category = data.get("category")
        status.description = data.get("description")
        status.default_duration = data.get("default_duration")
        status.stackable = data.get("stackable", False)
        status.max_stacks = data.get("max_stacks")
        status.icon_path = data.get("icon_path")

        # JSON fields
        status.tags = data.get("tags", [])

    def serialize_item(self, status: Status) -> Dict[str, Any]:
        return self.serialize_model(status)

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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()


# Create the route instance
bp = StatusRoute().bp

