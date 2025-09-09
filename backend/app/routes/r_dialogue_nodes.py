from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_flags import Flag
from backend.app.db.init_db import get_db_session
from flask import jsonify, abort, request
from typing import Any, Dict, List
from sqlalchemy.orm import Session

class DialogueNodeRoute(BaseRoute):
    def __init__(self):
        super().__init__(
            model=DialogueNode,
            blueprint_name='dialogue_nodes',
            route_prefix='/api/dialogue-nodes'
        )
        self.register_additional_routes()
        
    def register_additional_routes(self):
        self.bp.route("/api/dialogues/<dialogue_id>/nodes", methods=["GET"])(self.get_dialogue_tree)
        
    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "dialogue_id", "speaker", "text"]
        
    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]
    
    def process_input_data(self, db_session: Session, node: DialogueNode, data: Dict[str, Any]) -> None:
        # Validate relationships
        self.validate_relationships(db_session, data, {
            "dialogue_id": Dialogue,
            "requirements_id": Requirement
        })
        
        # Required fields
        node.slug = data["slug"]
        node.dialogue_id = data["dialogue_id"]
        node.speaker = data["speaker"]
        node.text = data["text"]
        
        # Optional relationship
        node.requirements_id = data.get("requirements_id")
        
        # Validate flags if present
        if "set_flags" in data:
            for flag_id in data["set_flags"]:
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id: {flag_id}")
        
        # JSON fields with validation
        choices = data.get("choices", [])
        for choice in choices:
            if not choice.get("next_node_id"):
                raise ValueError("Choice missing required field: next_node_id")
            
            # Validate requirements in choices if present
            if "requirements" in choice:
                if not db_session.get(Requirement, choice["requirements"]):
                    raise ValueError(f"Invalid requirements_id in choice: {choice['requirements']}")
            
            # Validate flags in choices if present
            if "set_flags" in choice:
                for flag_id in choice["set_flags"]:
                    if not db_session.get(Flag, flag_id):
                        raise ValueError(f"Invalid flag_id in choice: {flag_id}")
        
        node.choices = choices
        node.set_flags = data.get("set_flags", [])

    def serialize_item(self, node: DialogueNode) -> Dict[str, Any]:
        return self.serialize_model(node)
    
    def get_dialogue_tree(self, dialogue_id: str):
        """Get all nodes for a specific dialogue."""
        with get_db_session() as db_session:
            # Validate dialogue exists
            if not db_session.get(Dialogue, dialogue_id):
                abort(404, description=f"Dialogue {dialogue_id} not found")
            nodes = db_session.query(DialogueNode).filter(DialogueNode.dialogue_id == dialogue_id).all()
            return jsonify([self.serialize_item(node) for node in nodes])

    def get_all(self):
        db_session = get_db_session()
        try:
            search = request.args.get('search', '').strip()
            tags = request.args.get('tags', '').strip().lower().split(',') if request.args.get('tags') else []
            query = db_session.query(self.model)
            if search:
                query = query.filter(
                    (self.model.speaker.ilike(f"%{search}%")) |
                    (self.model.text.ilike(f"%{search}%")) |
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
bp = DialogueNodeRoute().bp
