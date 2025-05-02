# backend/app/models/m_requirements.py

from sqlalchemy import Column, String, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base



# Main Requirement object — reusable across items, quests, events, etc.
class Requirement(Base):
    __tablename__ = 'requirements'

    id = Column(String, primary_key=True)

    required_flags = relationship("RequirementRequiredFlag", back_populates="requirement", cascade="all, delete-orphan")
    forbidden_flags = relationship("RequirementForbiddenFlag", back_populates="requirement", cascade="all, delete-orphan")
    min_faction_reputation = relationship("RequirementMinFactionReputation", back_populates="requirement", cascade="all, delete-orphan")


class RequirementRequiredFlag(Base):
    __tablename__ = 'requirement_required_flags'

    id = Column(Integer, primary_key=True, autoincrement=True)
    requirement_id = Column(String, ForeignKey('requirements.id'), nullable=False)
    flag_id = Column(String, ForeignKey('flags.id'), nullable=False)


    requirement = relationship("Requirement", back_populates="required_flags")


class RequirementForbiddenFlag(Base):
    __tablename__ = 'requirement_forbidden_flags'

    id = Column(Integer, primary_key=True, autoincrement=True)
    requirement_id = Column(String, ForeignKey('requirements.id'), nullable=False)
    flag_id = Column(String, ForeignKey('flags.id'), nullable=False)


    requirement = relationship("Requirement", back_populates="forbidden_flags")


class RequirementMinFactionReputation(Base):
    __tablename__ = 'requirement_min_faction_reputation'

    id = Column(Integer, primary_key=True, autoincrement=True)
    requirement_id = Column(String, ForeignKey('requirements.id'), nullable=False)
    faction_id = Column(String, nullable=False)
    min_value = Column(Float, nullable=False)

    requirement = relationship("Requirement", back_populates="min_faction_reputation")
