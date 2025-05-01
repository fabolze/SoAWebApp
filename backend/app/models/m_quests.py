# backend/app/models/m_quests.py

from sqlalchemy import Column, String, Float, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Quest(Base):
    __tablename__ = 'quests'

    quest_id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    story_arc_id = Column(String, ForeignKey('story_arcs.id'))
    requirements_id = Column(String, ForeignKey('requirements.id'))

    objectives = Column(JSON)                   # List of { objective_id, description, requirements, flags_set }
    flags_set_on_completion = Column(JSON)      # List of flag IDs
    xp_reward = Column(Float)
    item_rewards = Column(JSON)                 # List of { item_id, quantity }
    tags = Column(JSON)

    requirements = relationship("Requirement")
    story_arc = relationship("StoryArc")
