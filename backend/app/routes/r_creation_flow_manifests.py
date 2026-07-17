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


def _list(data: Dict[str, Any], key: str) -> List[Any]:
    value = data.get(key, [])
    if not isinstance(value, list):
        raise ValueError(f"{key} must be an array")
    return value


class CreationFlowManifestRoute(BaseRoute):
    """CRUD compatibility for compiler manifests and capture-era manifests."""

    COMPILER_FIELDS = {
        "revision", "shape", "preview_hash", "provenance", "accepted_warnings", "canonical_snapshots",
    }
    CAPTURE_FIELDS = {
        "slug", "schema_version", "origin_kind", "origin_id", "origin_sub_kind", "origin_sub_id",
        "accepted_warning_ids", "source_snapshots", "artifact_dispositions", "tags",
    }

    def __init__(self):
        super().__init__(CreationFlowManifest, "creation_flow_manifests", "/api/creation-flow-manifests")

    def get_required_fields(self) -> List[str]:
        return ["id", "title", "format", "compiler_version", "normalized_draft"]

    def get_id_from_data(self, data: Dict[str, Any]) -> str:
        return data["id"]

    def process_input_data(self, db_session: Session, item: CreationFlowManifest, data: Dict[str, Any]) -> None:
        del db_session
        required = self.get_required_fields()
        self.validate_required_fields(data, required)
        draft = _object(data, "normalized_draft")
        if data.get("format") != "SOA-CREATION-FLOW/1" or draft.get("format") != "SOA-CREATION-FLOW/1":
            raise ValueError("manifest and normalized_draft must use SOA-CREATION-FLOW/1")
        if str(draft.get("id") or "") != str(data["id"]):
            raise ValueError("normalized_draft.id must match manifest id")

        item.title = str(data["title"]).strip()
        item.format = str(data["format"]).strip()
        item.compiler_version = str(data["compiler_version"]).strip()
        item.normalized_draft = draft

        compiler_payload = bool(self.COMPILER_FIELDS & set(data))
        capture_payload = bool(self.CAPTURE_FIELDS & set(data))
        if compiler_payload:
            self.validate_required_fields(data, sorted(self.COMPILER_FIELDS))
            revision = data["revision"]
            if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
                raise ValueError("revision must be an integer >= 1")
            if data["shape"] not in {"sequence", "constellation", "hybrid"}:
                raise ValueError("shape must be sequence, constellation, or hybrid")
            item.revision = revision
            item.shape = data["shape"]
            item.preview_hash = str(data["preview_hash"]).strip()
            item.provenance = _list(data, "provenance")
            item.accepted_warnings = _string_array(data, "accepted_warnings")
            item.canonical_snapshots = _list(data, "canonical_snapshots")
            item.implementation_summary = data.get("implementation_summary") or None

        if capture_payload:
            self.validate_required_fields(
                data,
                ["slug", "schema_version", "accepted_warning_ids", "source_snapshots", "artifact_dispositions", "created_at", "updated_at", "tags"],
            )
            schema_version = data["schema_version"]
            if isinstance(schema_version, bool) or not isinstance(schema_version, int) or schema_version < 1:
                raise ValueError("schema_version must be an integer >= 1")
            item.slug = str(data["slug"]).strip()
            item.schema_version = schema_version
            item.origin_kind = data.get("origin_kind") or None
            item.origin_id = data.get("origin_id") or None
            item.origin_sub_kind = data.get("origin_sub_kind") or None
            item.origin_sub_id = data.get("origin_sub_id") or None
            item.accepted_warning_ids = _string_array(data, "accepted_warning_ids")
            item.source_snapshots = _object(data, "source_snapshots")
            item.artifact_dispositions = _object(data, "artifact_dispositions")
            item.tags = _string_array(data, "tags")

        if not compiler_payload and not capture_payload:
            raise ValueError("manifest must include compiler provenance or capture provenance")
        if "created_at" in data:
            item.created_at = float(data["created_at"])
        if "updated_at" in data:
            item.updated_at = float(data["updated_at"])

    def serialize_item(self, item: CreationFlowManifest) -> Dict[str, Any]:
        return self.serialize_model(item)


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
            manifest_id=data["manifest_id"], step_id=data["step_id"],
            artifact_kind=data["artifact_kind"], artifact_id=data["artifact_id"],
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
route = manifest_route
bp = creation_flow_manifests_bp = manifest_route.bp
creation_flow_artifacts_bp = artifact_route.bp
