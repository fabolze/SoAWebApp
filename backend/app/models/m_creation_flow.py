from sqlalchemy import Column, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class CreationFlowManifest(Base):
    __tablename__ = "creation_flow_manifests"

    id = Column(String, primary_key=True, default=generate_ulid)
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    format = Column(String, nullable=False, default="SOA-CREATION-FLOW/1")
    schema_version = Column(Integer, nullable=False, default=1)
    compiler_version = Column(String, nullable=False, default="capture-only")
    origin_kind = Column(String)
    origin_id = Column(String)
    origin_sub_kind = Column(String)
    origin_sub_id = Column(String)
    normalized_draft = Column(JSON, nullable=False)
    accepted_warning_ids = Column(JSON, nullable=False)
    source_snapshots = Column(JSON, nullable=False)
    artifact_dispositions = Column(JSON, nullable=False)
    created_at = Column(Integer, nullable=False)
    updated_at = Column(Integer, nullable=False)
    tags = Column(JSON, nullable=False)

    artifacts = relationship(
        "CreationFlowArtifact",
        back_populates="manifest",
        cascade="all, delete-orphan",
    )


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
