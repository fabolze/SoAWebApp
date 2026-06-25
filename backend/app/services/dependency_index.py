from collections import defaultdict

from backend.app.models import ALL_MODELS
from backend.app.models.m_dialogue_nodes import DialogueNode
from backend.app.models.m_character_narrative import CharacterStoryBeat
from backend.app.models.m_encounters import Encounter
from backend.app.models.m_events import Event
from backend.app.models.m_flags import Flag
from backend.app.models.m_interaction_profiles import InteractionProfile
from backend.app.models.m_quests import Quest
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_story_arcs import StoryArc


def _label(item):
    return getattr(item, "name", None) or getattr(item, "title", None) or getattr(item, "slug", None) or item.id


def _node_id(kind, entry_id):
    return f"{kind}:{entry_id}"


def build_dependency_index(db_session):
    nodes = {}
    edges = []

    def node(kind, item, **metadata):
        key = _node_id(kind, item.id)
        nodes[key] = {
            "id": key, "kind": kind, "entry_id": item.id, "label": _label(item),
            "schema_name": getattr(item, "__tablename__", kind), "metadata": metadata,
        }
        return key

    def edge(source, target, relation, explicit=True, path=""):
        edges.append({
            "id": f"{source}>{relation}>{target}>{path}", "source": source, "target": target,
            "relation": relation, "explicit": explicit, "path": path,
        })

    for flag in db_session.query(Flag).all():
        node("flag", flag)
    for beat in db_session.query(CharacterStoryBeat).all():
        beat_id = node("character_story_beats", beat)
        for flag_id in beat.required_flags or []:
            edge(_node_id("flag", flag_id), beat_id, "required_by_beat", True, "required_flags")
        for flag_id in beat.forbidden_flags or []:
            edge(_node_id("flag", flag_id), beat_id, "forbidden_by_beat", True, "forbidden_flags")
        for flag_id in beat.expected_output_flags or []:
            edge(beat_id, _node_id("flag", flag_id), "expects_to_set", True, "expected_output_flags")
    requirements = db_session.query(Requirement).all()
    for requirement in requirements:
        req_id = node("requirement", requirement)
        for row in requirement.required_flags:
            edge(_node_id("flag", row.flag_id), req_id, "required_by", True, "required_flags")
        for row in requirement.forbidden_flags:
            edge(_node_id("flag", row.flag_id), req_id, "forbidden_by", True, "forbidden_flags")

    for model in ALL_MODELS:
        if model is Requirement or not hasattr(model, "requirements_id"):
            continue
        for item in db_session.query(model).all():
            content_id = node(model.__tablename__, item)
            if item.requirements_id:
                edge(_node_id("requirement", item.requirements_id), content_id, "gates", True, "requirements_id")

    flag_sources = [
        (Quest, "flags_set_on_completion"),
        (Event, "flags_set"),
        (InteractionProfile, "flags_set_on_interaction"),
    ]
    for model, field in flag_sources:
        for item in db_session.query(model).all():
            source_id = node(model.__tablename__, item)
            for flag_id in getattr(item, field) or []:
                edge(source_id, _node_id("flag", flag_id), "sets", True, field)

    for quest in db_session.query(Quest).all():
        source_id = node("quests", quest)
        for index, objective in enumerate(quest.objectives or []):
            if not isinstance(objective, dict):
                continue
            for flag_id in objective.get("flags_set", []) or []:
                edge(source_id, _node_id("flag", flag_id), "sets", True, f"objectives[{index}].flags_set")
            if objective.get("requirements_id"):
                edge(_node_id("requirement", objective["requirements_id"]), source_id, "gates", True, f"objectives[{index}].requirements_id")

    for encounter in db_session.query(Encounter).all():
        source_id = node("encounters", encounter)
        for flag_id in (encounter.rewards or {}).get("flags_set", []) if isinstance(encounter.rewards, dict) else []:
            edge(source_id, _node_id("flag", flag_id), "sets", True, "rewards.flags_set")

    for dialogue in db_session.query(DialogueNode).all():
        source_id = node("dialogue_nodes", dialogue)
        for flag_id in dialogue.set_flags or []:
            edge(source_id, _node_id("flag", flag_id), "sets", True, "set_flags")
        for index, choice in enumerate(dialogue.choices or []):
            if not isinstance(choice, dict):
                continue
            for flag_id in choice.get("set_flags", []) or []:
                edge(source_id, _node_id("flag", flag_id), "sets", True, f"choices[{index}].set_flags")
            if choice.get("requirements_id"):
                edge(_node_id("requirement", choice["requirements_id"]), source_id, "gates", True, f"choices[{index}].requirements_id")

    for event in db_session.query(Event).all():
        source_id = node("events", event)
        if event.next_event_id:
            edge(source_id, _node_id("events", event.next_event_id), "next", True, "next_event_id")

    for arc in db_session.query(StoryArc).all():
        arc_id = node("story_arcs", arc)
        for quest_id in arc.related_quests or []:
            edge(arc_id, _node_id("quests", quest_id), "contains", True, "related_quests")
        for index, branch in enumerate(arc.branching or []):
            if not isinstance(branch, dict) or not branch.get("quest_id"):
                continue
            for branch_index, target in enumerate(branch.get("branches", []) or []):
                if isinstance(target, dict) and target.get("next_quest_id"):
                    edge(_node_id("quests", branch["quest_id"]), _node_id("quests", target["next_quest_id"]), "branches_to", True, f"branching[{index}].branches[{branch_index}]")

    explicit_edges = list(edges)
    set_by_flag = defaultdict(set)
    requirements_by_flag = defaultdict(set)
    gated_by_requirement = defaultdict(set)
    for entry in explicit_edges:
        if entry["relation"] == "sets":
            set_by_flag[entry["target"]].add(entry["source"])
        elif entry["relation"] == "required_by":
            requirements_by_flag[entry["source"]].add(entry["target"])
        elif entry["relation"] == "gates":
            gated_by_requirement[entry["source"]].add(entry["target"])
    for flag_id, sources in set_by_flag.items():
        for requirement_id in requirements_by_flag.get(flag_id, set()):
            for gated_id in gated_by_requirement.get(requirement_id, set()):
                for source_id in sources:
                    edge(source_id, gated_id, "unlocks", False, f"{flag_id}>{requirement_id}")

    adjacency = defaultdict(set)
    for entry in explicit_edges:
        if entry["relation"] in {"next", "branches_to"}:
            adjacency[entry["source"]].add(entry["target"])

    cycles = set()

    def visit(current, path, active):
        if current in active:
            start = path.index(current)
            cycles.add(tuple(path[start:]))
            return
        for target in adjacency.get(current, set()):
            visit(target, path + [target], active | {current})

    for start in adjacency:
        visit(start, [start], set())

    producers = {entry["target"] for entry in edges if entry["relation"] == "sets"}
    consumers = {entry["source"] for entry in edges if entry["relation"] in {"required_by", "forbidden_by", "required_by_beat", "forbidden_by_beat"}}
    required_by_req = defaultdict(set)
    forbidden_by_req = defaultdict(set)
    for entry in edges:
        if entry["relation"] == "required_by":
            required_by_req[entry["target"]].add(entry["source"])
        if entry["relation"] == "forbidden_by":
            forbidden_by_req[entry["target"]].add(entry["source"])
    health = {
        "dead_flags": [nodes[key] for key in sorted(consumers - producers) if key in nodes],
        "unused_flags": [nodes[key] for key in sorted(producers - consumers) if key in nodes],
        "contradictions": [
            nodes[key] for key in sorted(set(required_by_req) & set(forbidden_by_req))
            if required_by_req[key] & forbidden_by_req[key] and key in nodes
        ],
        "impossible_gates": [
            nodes[requirement_id]
            for flag_id in sorted(consumers - producers)
            for requirement_id in sorted(requirements_by_flag.get(flag_id, set()))
            if requirement_id in nodes
        ],
        "cycles": [list(cycle) for cycle in sorted(cycles)],
    }
    return {"nodes": list(nodes.values()), "edges": edges, "health": health}


def quest_context(index, quest_id):
    quest_node = _node_id("quests", quest_id)
    nodes_by_id = {node["id"]: node for node in index["nodes"]}
    outgoing_flags = {edge["target"] for edge in index["edges"] if edge["source"] == quest_node and edge["relation"] == "sets"}
    gated_requirements = {edge["source"] for edge in index["edges"] if edge["target"] == quest_node and edge["relation"] == "gates"}
    prerequisites = [
        edge for edge in index["edges"]
        if edge["target"] in gated_requirements and edge["relation"] in {"required_by", "forbidden_by"}
    ]
    aftermath = [
        edge for edge in index["edges"]
        if edge["source"] == quest_node and edge["relation"] == "unlocks"
    ]
    referenced_node_ids = {quest_node}
    for edge in prerequisites + aftermath:
        referenced_node_ids.add(edge["source"])
        referenced_node_ids.add(edge["target"])
    nodes = [
        nodes_by_id[node_id]
        for node_id in sorted(referenced_node_ids)
        if node_id in nodes_by_id
    ]
    return {"prerequisites": prerequisites, "aftermath": aftermath, "nodes": nodes}
