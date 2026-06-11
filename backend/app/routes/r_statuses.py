from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_statuses import (
    Status, StatusCategory, StatusPolarity, StatusReapplicationPolicy, StatusStackDecayPolicy,
)
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
            "polarity": StatusPolarity,
            "reapplication_policy": StatusReapplicationPolicy,
            "stack_decay_policy": StatusStackDecayPolicy,
        })

        # Required fields
        status.slug = data["slug"]
        status.name = data["name"]

        # Optional fields
        status.category = data.get("category")
        status.polarity = data.get("polarity") or StatusPolarity.Neutral
        status.description = data.get("description")
        status.default_duration = data.get("default_duration")
        status.stackable = data.get("stackable", False)
        status.max_stacks = data.get("max_stacks")
        status.reapplication_policy = data.get("reapplication_policy") or StatusReapplicationPolicy.RefreshDuration
        status.stack_decay_policy = data.get("stack_decay_policy") or StatusStackDecayPolicy.AllAtOnce
        status.can_cleanse = data.get("can_cleanse", True)
        status.can_dispel = data.get("can_dispel", True)
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
route = StatusRoute()
bp = route.bp

