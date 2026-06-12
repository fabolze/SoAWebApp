from backend.app.routes.base_route import BaseRoute
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_flags import Flag
from backend.app.models.m_characters import Character
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
            "requirements_id": Requirement,
            "speaker_character_id": Character,
        })
        
        # Required fields
        node.slug = data["slug"]
        node.dialogue_id = data["dialogue_id"]
        node.speaker = data["speaker"]
        node.speaker_character_id = data.get("speaker_character_id") or None
        node.text = data["text"]
        
        # Optional relationship
        node.requirements_id = data.get("requirements_id") or None
        
        # Validate flags if present
        set_flags = data.get("set_flags", [])
        if not isinstance(set_flags, list):
            raise ValueError("set_flags must be an array")
        if "set_flags" in data:
            for flag_id in set_flags:
                if not isinstance(flag_id, str) or not flag_id:
                    raise ValueError("set_flags entries must be non-empty ids")
                if not db_session.get(Flag, flag_id):
                    raise ValueError(f"Invalid flag_id: {flag_id}")
        
        # JSON fields with validation
        choices = data.get("choices", [])
        if not isinstance(choices, list):
            raise ValueError("choices must be an array")
        for choice in choices:
            if not isinstance(choice, dict):
                raise ValueError("Choice entries must be objects")
            if not isinstance(choice.get("next_node_id"), str) or not choice["next_node_id"]:
                raise ValueError("Choice missing required field: next_node_id")
            if "choice_text" in choice and not isinstance(choice["choice_text"], str):
                raise ValueError("Choice choice_text must be a string")
            if "requirements_id" in choice and choice["requirements_id"] is not None and not isinstance(choice["requirements_id"], str):
                raise ValueError("Choice requirements_id must be an id")
            target = db_session.get(DialogueNode, choice["next_node_id"])
            if not target:
                raise ValueError(f"Invalid next_node_id: {choice['next_node_id']}")
            if target.dialogue_id != node.dialogue_id:
                raise ValueError(f"Choice target belongs to another dialogue: {choice['next_node_id']}")

            # Validate requirements in choices if present
            if choice.get("requirements_id"):
                if not db_session.get(Requirement, choice["requirements_id"]):
                    raise ValueError(f"Invalid requirements_id in choice: {choice['requirements_id']}")
            
            # Validate flags in choices if present
            if "set_flags" in choice:
                if not isinstance(choice["set_flags"], list):
                    raise ValueError("Choice set_flags must be an array")
                for flag_id in choice["set_flags"]:
                    if not isinstance(flag_id, str) or not flag_id:
                        raise ValueError("Choice set_flags entries must be non-empty ids")
                    if not db_session.get(Flag, flag_id):
                        raise ValueError(f"Invalid flag_id in choice: {flag_id}")
        
        tags = data.get("tags", [])
        if not isinstance(tags, list):
            raise ValueError("tags must be an array")
        if any(not isinstance(tag, str) for tag in tags):
            raise ValueError("tags entries must be strings")
        node.choices = choices
        node.set_flags = set_flags
        node.tags = tags

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
                            self._build_tag_filter_expression(tag)
                        )
            items = query.all()
            return jsonify(self.serialize_list(items))
        finally:
            db_session.close()

# Create the route instance
route = DialogueNodeRoute()
bp = route.bp

