from flask import Blueprint, request, jsonify
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.db.init_db import get_db_session

bp = Blueprint('dialogue_nodes', __name__)

@bp.route("/api/dialogue_nodes", methods=["POST"])
def upsert_dialogue_node():
    db_session = get_db_session()
    data = request.json
    node_id = data.get("id")
    
    node = db_session.get(DialogueNode, node_id) or DialogueNode(id=node_id)
    node.text = data.get("text")
    node.next_node_id = data.get("next_node_id")
    
    db_session.add(node)
    db_session.commit()
    return jsonify({"status": "ok"})

@bp.route("/api/dialogue_nodes", methods=["GET"])
def list_dialogue_nodes():
    db_session = get_db_session()
    nodes = db_session.query(DialogueNode).all()
    return jsonify([{"id": n.id, "text": n.text} for n in nodes])
