import time

from sqlalchemy import Column, Float, Integer, JSON, String, Text

from backend.app.models.base import Base


class CreationFlowManifest(Base):
    """Recoverable provenance for one committed narrative creation flow."""

    __tablename__ = "creation_flow_manifests"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    format = Column(String, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
    shape = Column(String, nullable=False)
    compiler_version = Column(String, nullable=False)
    preview_hash = Column(String, nullable=False)
    normalized_draft = Column(JSON, nullable=False)
    provenance = Column(JSON, nullable=False)
    accepted_warnings = Column(JSON, nullable=False, default=list)
    canonical_snapshots = Column(JSON, nullable=False, default=list)
    implementation_summary = Column(Text)
    created_at = Column(Float, nullable=False, default=time.time)
    updated_at = Column(Float, nullable=False, default=time.time, onupdate=time.time)

