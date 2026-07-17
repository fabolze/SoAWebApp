from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.models.m_creation_flow import CreationFlowArtifact, CreationFlowManifest
from backend.app.routes.base_route import BaseRoute


def _string_array(data: Dict[str, Any], key: str) -> List[str]:
    value = data.get(key, [])
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(entry, str) or not entry.strip() for entry in value):
        raise ValueError(f"{key} must be an array of non-empty strings")
    return list(dict.fromkeys(entry.strip() for entry in value))


def _object(data: Dict[str, Any], key: str) -> Dict[str, Any]:
    value = data.get(key, {})
    if not isinstance(value, dict):
        raise ValueError(f"{key} must be an object")
    return value


class CreationFlowManifestRoute(BaseRoute):
    def __init__(self):
        super().__init__(CreationFlowManifest, "creation_flow_manifests", "/api/creation-flow-manifests")

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "title", "format", "schema_version", "compiler_version", "normalized_draft", "created_at", "updated_at"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def serialize_item(self, item: CreationFlowManifest) -> Dict[str, Any]:
        return self.serialize_model(item)

    def process_input_data(self, db_session: Session, item: CreationFlowManifest, data: Dict[str, Any]) -> None:
        del db_session
        draft = _object(data, "normalized_draft")
        if data.get("format") != "SOA-CREATION-FLOW/1" or draft.get("format") != "SOA-CREATION-FLOW/1":
            raise ValueError("manifest and normalized_draft must use SOA-CREATION-FLOW/1")
        if str(draft.get("id") or "") != str(data["id"]):
            raise ValueError("normalized_draft.id must match manifest id")
        schema_version = data.get("schema_version")
        if isinstance(schema_version, bool) or not isinstance(schema_version, int) or schema_version < 1:
            raise ValueError("schema_version must be an integer >= 1")
        for key in ("created_at", "updated_at"):
            value = data.get(key)
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"{key} must be a non-negative integer")
        item.slug = str(data["slug"]).strip()
        item.title = str(data["title"]).strip()
        item.format = data["format"]
        item.schema_version = schema_version
        item.compiler_version = str(data["compiler_version"]).strip()
        item.origin_kind = data.get("origin_kind") or None
        item.origin_id = data.get("origin_id") or None
        item.origin_sub_kind = data.get("origin_sub_kind") or None
        item.origin_sub_id = data.get("origin_sub_id") or None
        item.normalized_draft = draft
        item.accepted_warning_ids = _string_array(data, "accepted_warning_ids")
        item.source_snapshots = _object(data, "source_snapshots")
        item.artifact_dispositions = _object(data, "artifact_dispositions")
        item.created_at = data["created_at"]
        item.updated_at = data["updated_at"]
        item.tags = _string_array(data, "tags")


class CreationFlowArtifactRoute(BaseRoute):
    OWNERSHIP = {"generated", "reused", "shared", "detached"}
    DISPOSITIONS = {"still_owned", "modified", "detached_shared", "cleanup_candidate", "retained"}

    def __init__(self):
        super().__init__(CreationFlowArtifact, "creation_flow_artifacts", "/api/creation-flow-artifacts")

    def get_required_fields(self) -> List[str]:
        return ["id", "slug", "manifest_id", "step_id", "artifact_kind", "artifact_id", "ownership", "disposition", "expected_snapshot"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def serialize_item(self, item: CreationFlowArtifact) -> Dict[str, Any]:
        return self.serialize_model(item)

    def process_input_data(self, db_session: Session, item: CreationFlowArtifact, data: Dict[str, Any]) -> None:
        self.validate_relationships(db_session, data, {"manifest_id": CreationFlowManifest})
        ownership = str(data.get("ownership") or "")
        disposition = str(data.get("disposition") or "")
        if ownership not in self.OWNERSHIP:
            raise ValueError(f"ownership must be one of: {', '.join(sorted(self.OWNERSHIP))}")
        if disposition not in self.DISPOSITIONS:
            raise ValueError(f"disposition must be one of: {', '.join(sorted(self.DISPOSITIONS))}")
        for key in ("step_id", "artifact_kind", "artifact_id"):
            if not str(data.get(key) or "").strip():
                raise ValueError(f"{key} is required")
        duplicate = db_session.query(CreationFlowArtifact).filter_by(
            manifest_id=data["manifest_id"],
            step_id=data["step_id"],
            artifact_kind=data["artifact_kind"],
            artifact_id=data["artifact_id"],
        ).first()
        if duplicate and duplicate.id != data["id"]:
            raise ValueError("manifest step already references this artifact")
        item.slug = str(data["slug"]).strip()
        item.manifest_id = data["manifest_id"]
        item.step_id = str(data["step_id"]).strip()
        item.artifact_kind = str(data["artifact_kind"]).strip()
        item.artifact_id = str(data["artifact_id"]).strip()
        item.ownership = ownership
        item.disposition = disposition
        item.expected_snapshot = _object(data, "expected_snapshot")
        item.notes = data.get("notes") or None
        item.tags = _string_array(data, "tags")


manifest_route = CreationFlowManifestRoute()
artifact_route = CreationFlowArtifactRoute()
creation_flow_manifests_bp = manifest_route.bp
creation_flow_artifacts_bp = artifact_route.bp
