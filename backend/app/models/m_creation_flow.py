from sqlalchemy import Column, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.models.m_creation_flow_manifests import CreationFlowManifest
from backend.app.utils.id import generate_ulid


class CreationFlowArtifact(Base):
    __tablename__ = "creation_flow_artifacts"
    __table_args__ = (
        UniqueConstraint(
            "manifest_id",
            "step_id",
            "artifact_kind",
            "artifact_id",
            name="uq_creation_flow_step_artifact",
        ),
    )

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    manifest_id = Column(String, ForeignKey("creation_flow_manifests.id", ondelete="CASCADE"), nullable=False)
    step_id = Column(String, nullable=False)
    artifact_kind = Column(String, nullable=False)
    artifact_id = Column(String, nullable=False)
    ownership = Column(String, nullable=False, default="generated")
    disposition = Column(String, nullable=False, default="still_owned")
    expected_snapshot = Column(JSON, nullable=False)
    notes = Column(Text)
    tags = Column(JSON, nullable=False)

    manifest = relationship("CreationFlowManifest", back_populates="artifacts")
