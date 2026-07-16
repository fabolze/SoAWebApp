from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_creation_flow_manifests import CreationFlowManifest
from backend.app.routes.base_route import BaseRoute


class CreationFlowManifestRoute(BaseRoute):
    def __init__(self):
        super().__init__(CreationFlowManifest, "creation_flow_manifests", "/api/creation-flow-manifests")

    def get_required_fields(self) -> List[str]:
        return [
            "id", "title", "format", "revision", "shape", "compiler_version",
            "preview_hash", "normalized_draft", "provenance", "accepted_warnings",
            "canonical_snapshots",
        ]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: CreationFlowManifest, data: Dict[str, Any]) -> None:
        item.title = str(data["title"]).strip()
        item.format = str(data["format"]).strip()
        item.revision = int(data["revision"])
        item.shape = str(data["shape"]).strip()
        item.compiler_version = str(data["compiler_version"]).strip()
        item.preview_hash = str(data["preview_hash"]).strip()
        item.normalized_draft = dict(data["normalized_draft"])
        item.provenance = list(data["provenance"])
        item.accepted_warnings = list(data["accepted_warnings"])
        item.canonical_snapshots = list(data["canonical_snapshots"])
        item.implementation_summary = data.get("implementation_summary")
        if "created_at" in data:
            item.created_at = float(data["created_at"])
        if "updated_at" in data:
            item.updated_at = float(data["updated_at"])

    def serialize_item(self, item: CreationFlowManifest) -> Dict[str, Any]:
        return self.serialize_model(item)


route = CreationFlowManifestRoute()
bp = route.bp
