from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_talent_trees import TalentNode, TalentNodeType, TalentTree
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_abilities import Ability
from backend.app.models.m_stats import Stat
from backend.app.models.m_attributes import Attribute
from backend.app.models.m_items import ModifierValueType
from backend.app.models.m_attribute_stat_link import ScaleType as AttributeScaleType
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class TalentNodeRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=TalentNode,
            blueprint_name='talent_nodes',
            route_prefix='/api/talent-nodes'
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "tree_id", "name", "node_type"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, node: TalentNode, data: Dict[str, Any]) -> None:
        self.validate_enums(data, {"node_type": TalentNodeType})

        self.validate_relationships(db_session, data, {
            "tree_id": TalentTree,
            "requirements_id": Requirement,
        })

        node.slug = data["slug"]
        node.tree_id = data["tree_id"]
        node.name = data["name"]
        node.node_type = data["node_type"]
        node.description = data.get("description")

        max_rank = data.get("max_rank", 1)
        try:
            max_rank = int(max_rank)
        except (TypeError, ValueError) as exc:
            raise ValueError("max_rank must be an integer") from exc
        if max_rank < 1:
            raise ValueError("max_rank must be >= 1")

        point_cost = data.get("point_cost", 1)
        try:
            point_cost = int(point_cost)
        except (TypeError, ValueError) as exc:
            raise ValueError("point_cost must be an integer") from exc
        if point_cost < 0:
            raise ValueError("point_cost must be >= 0")

        node.max_rank = max_rank
        node.point_cost = point_cost
        node.requirements_id = data.get("requirements_id")

        granted_abilities = data.get("granted_abilities") or []
        for ability_id in granted_abilities:
            if not db_session.get(Ability, ability_id):
                raise ValueError(f"Invalid ability_id: {ability_id}")
        node.granted_abilities = granted_abilities

        node.stat_modifiers = self._validate_stat_modifiers(db_session, data.get("stat_modifiers") or [])
        node.attribute_modifiers = self._validate_attribute_modifiers(db_session, data.get("attribute_modifiers") or [])

        ui_position = data.get("ui_position")
        if ui_position is not None and not isinstance(ui_position, dict):
            raise ValueError("ui_position must be an object with x/y")
        if isinstance(ui_position, dict):
            sanitized_position = {}
            if "x" in ui_position:
                sanitized_position["x"] = float(ui_position["x"])
            if "y" in ui_position:
                sanitized_position["y"] = float(ui_position["y"])
            node.ui_position = sanitized_position
        else:
            node.ui_position = None

        node.tags = data.get("tags", [])

    def _validate_stat_modifiers(self, db_session: Session, entries: List[Any]) -> List[Dict[str, Any]]:
        sanitized: List[Dict[str, Any]] = []
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("stat_modifiers entries must be objects")
            stat_id = entry.get("stat_id")
            if not stat_id:
                raise ValueError("stat_modifiers entries require stat_id")
            if not db_session.get(Stat, stat_id):
                raise ValueError(f"Invalid stat_id: {stat_id}")
            value = entry.get("value")
            if value is None:
                raise ValueError("stat_modifiers entries require value")
            value_type = entry.get("value_type", ModifierValueType.Flat.value)
            try:
                value_type = ModifierValueType(value_type).value
            except ValueError as exc:
                raise ValueError(f"Invalid value_type for stat modifier: {value_type}") from exc
            sanitized.append({
                "stat_id": stat_id,
                "value": float(value),
                "value_type": value_type,
            })
        return sanitized

    def _validate_attribute_modifiers(self, db_session: Session, entries: List[Any]) -> List[Dict[str, Any]]:
        sanitized: List[Dict[str, Any]] = []
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("attribute_modifiers entries must be objects")
            attribute_id = entry.get("attribute_id")
            if not attribute_id:
                raise ValueError("attribute_modifiers entries require attribute_id")
            if not db_session.get(Attribute, attribute_id):
                raise ValueError(f"Invalid attribute_id: {attribute_id}")
            value = entry.get("value")
            if value is None:
                raise ValueError("attribute_modifiers entries require value")
            scaling = entry.get("scaling")
            if scaling == "Custom Curve":
                scaling = "Custom"
            scaling_value = None
            if scaling:
                try:
                    scaling_value = AttributeScaleType(scaling).value
                except ValueError as exc:
                    raise ValueError(f"Invalid scaling for attribute modifier: {scaling}") from exc
            sanitized.append({
                "attribute_id": attribute_id,
                "value": float(value),
                "scaling": scaling_value,
            })
        return sanitized

    def serialize_item(self, node: TalentNode) -> Dict[str, Any]:
        return self.serialize_model(node)

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


bp = TalentNodeRoute().bp

