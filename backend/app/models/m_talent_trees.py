# backend/app/models/m_talent_trees.py

from sqlalchemy import Column, String, Text, JSON, Enum, Integer, ForeignKey
from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid
import enum


class TalentNodeType(enum.Enum):
    Passive = "Passive"
    Active = "Active"
    Keystone = "Keystone"
    Utility = "Utility"


class TalentTree(Base):
    __tablename__ = "talent_trees"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)

    class_id = Column(String, ForeignKey("characterclasses.id"))
    requirements_id = Column(String, ForeignKey("requirements.id"))

    icon_path = Column(String)
    tags = Column(JSON)


class TalentNode(Base):
    __tablename__ = "talent_nodes"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    tree_id = Column(String, ForeignKey("talent_trees.id"), nullable=False)

    name = Column(String, nullable=False)
    description = Column(Text)
    node_type = Column(Enum(TalentNodeType), nullable=False)

    max_rank = Column(Integer, default=1)
    point_cost = Column(Integer, default=1)
    requirements_id = Column(String, ForeignKey("requirements.id"))

    granted_abilities = Column(JSON)
    stat_modifiers = Column(JSON)
    attribute_modifiers = Column(JSON)
    ui_position = Column(JSON)
    tags = Column(JSON)


class TalentNodeLink(Base):
    __tablename__ = "talent_node_links"

    id = Column(String, primary_key=True, default=generate_ulid)
    tree_id = Column(String, ForeignKey("talent_trees.id"), nullable=False)
    from_node_id = Column(String, ForeignKey("talent_nodes.id"), nullable=False)
    to_node_id = Column(String, ForeignKey("talent_nodes.id"), nullable=False)
    min_rank_required = Column(Integer, default=1)
