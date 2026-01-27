from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_talent_trees import TalentNodeLink, TalentTree, TalentNode
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from flask import request, jsonify
from backend.app.db.init_db import get_db_session


class TalentNodeLinkRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=TalentNodeLink,
            blueprint_name='talent_node_links',
            route_prefix='/api/talent-node-links'
        )

    def get_required_fields(self) -> List[str]:
        return ["id", "tree_id", "from_node_id", "to_node_id"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, link: TalentNodeLink, data: Dict[str, Any]) -> None:
        self.validate_relationships(db_session, data, {"tree_id": TalentTree})

        from_node = db_session.get(TalentNode, data.get("from_node_id"))
        to_node = db_session.get(TalentNode, data.get("to_node_id"))
        if not from_node:
            raise ValueError(f"Invalid from_node_id: {data.get('from_node_id')}")
        if not to_node:
            raise ValueError(f"Invalid to_node_id: {data.get('to_node_id')}")
        if from_node.id == to_node.id:
            raise ValueError("from_node_id and to_node_id must be different")
        if from_node.tree_id != data.get("tree_id") or to_node.tree_id != data.get("tree_id"):
            raise ValueError("from_node_id and to_node_id must belong to the same tree_id")

        link.tree_id = data["tree_id"]
        link.from_node_id = data["from_node_id"]
        link.to_node_id = data["to_node_id"]

        min_rank_required = data.get("min_rank_required", 1)
        try:
            min_rank_required = int(min_rank_required)
        except (TypeError, ValueError) as exc:
            raise ValueError("min_rank_required must be an integer") from exc
        if min_rank_required < 1:
            raise ValueError("min_rank_required must be >= 1")
        link.min_rank_required = min_rank_required

    def serialize_item(self, link: TalentNodeLink) -> Dict[str, Any]:
        return self.serialize_model(link)

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.id.ilike(f"%{search}%")) |
                    (self.model.tree_id.ilike(f"%{search}%"))
                )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()


bp = TalentNodeLinkRoute().bp
