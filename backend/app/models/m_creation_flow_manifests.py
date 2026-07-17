import time

from sqlalchemy import Column, Float, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from backend.app.models.base import Base
from backend.app.utils.id import generate_ulid


class CreationFlowManifest(Base):
    """Recoverable provenance for one committed narrative creation flow."""

    __tablename__ = "creation_flow_manifests"

    id = Column(String, primary_key=True, default=generate_ulid)
    title = Column(String, nullable=False)
    format = Column(String, nullable=False, default="SOA-CREATION-FLOW/1")
    revision = Column(Integer, nullable=False, default=1)
    shape = Column(String)
    compiler_version = Column(String, nullable=False, default="capture-only")
    preview_hash = Column(String)
    normalized_draft = Column(JSON, nullable=False)
    provenance = Column(JSON, nullable=False, default=list)
    accepted_warnings = Column(JSON, nullable=False, default=list)
    canonical_snapshots = Column(JSON, nullable=False, default=list)
    implementation_summary = Column(Text)
    created_at = Column(Float, nullable=False, default=time.time)
    updated_at = Column(Float, nullable=False, default=time.time, onupdate=time.time)

    # Capture-era provenance is retained for backward-compatible local drafts.
    slug = Column(String, unique=True)
    schema_version = Column(Integer, nullable=False, default=1)
    origin_kind = Column(String)
    origin_id = Column(String)
    origin_sub_kind = Column(String)
    origin_sub_id = Column(String)
    accepted_warning_ids = Column(JSON, nullable=False, default=list)
    source_snapshots = Column(JSON, nullable=False, default=dict)
    artifact_dispositions = Column(JSON, nullable=False, default=dict)
    tags = Column(JSON, nullable=False, default=list)

    artifacts = relationship(
        "CreationFlowArtifact",
        back_populates="manifest",
        cascade="all, delete-orphan",
    )
