from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from backend.app.models.m_creation_flow_manifests import CreationFlowManifest
from backend.app.models.m_adventure_narrative import AdventureBeatLink
from backend.app.models.m_events import Event
from backend.app.models.m_flags import Flag
from backend.app.models.m_requirements import Requirement
from backend.app.services.bundle_operations import REQUIREMENT_TARGETS, column_snapshot
from backend.app.services.creation_flow_catalog import (
    BLOCKED_STEP_KINDS,
    COMPILER_VERSION,
    COMPILABLE_STEP_KINDS,
    CREATION_FLOW_FORMAT,
    REFERENCE_MODELS,
    STORY_ONLY_STEP_KINDS,
)


CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
TARGET_BY_STEP = {
    "dialogue": "dialogue",
    "encounter": "encounter",
    "item_reward": "item",
    "lore_reveal": "lore_entry",
    "teleport": "location",
}
ATTACHMENT_SCHEMA_BY_KIND = {
    "dialogue_node": "dialogue_nodes",
    "dialogue": "dialogues",
    "encounter": "encounters",
    "event": "events",
    "item": "items",
    "location_poi": "location_pois",
    "location_route": "location_routes",
    "quest": "quests",
    "shop": "shops",
}
ADVENTURE_TARGET_TYPE_BY_KIND = {
    "location": "location", "character": "character", "quest": "quest", "event": "event",
    "dialogue": "dialogue", "encounter": "encounter", "lore_entry": "lore_entry",
    "item": "item", "faction": "faction",
}


def _stable_id(flow_id: str, key: str) -> str:
    value = int.from_bytes(hashlib.sha256(f"{COMPILER_VERSION}:{flow_id}:{key}".encode()).digest()[:16], "big")
    result = ""
    for _ in range(26):
        result = CROCKFORD[value & 31] + result
        value >>= 5
    return result


def _stable_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def _slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return clean or "creation-flow"


def _as_list(value, path):
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError(f"{path} must be an array")
    return value


def _issue(severity, code, message, *, step_id=None, path=None, placeholder_id=None):
    identity = ":".join(str(part) for part in (code, step_id, placeholder_id, path) if part)
    return {
        "id": identity or code,
        "severity": severity,
        "code": code,
        "message": message,
        **({"step_id": step_id} if step_id else {}),
        **({"path": path} if path else {}),
        **({"placeholder_id": placeholder_id} if placeholder_id else {}),
    }


class CreationFlowCompiler:
    def __init__(self, db_session, draft):
        if not isinstance(draft, dict):
            raise ValueError("draft must be an object")
        self.db_session = db_session
        self.draft = copy.deepcopy(draft)
        self.flow_id = str(self.draft.get("id") or "").strip()
        self.blockers = []
        self.warnings = []
        self.information = []
        self.snapshots = []
        self.provenance = []
        self.step_review = []
        self.mutation = {
            "flags": [], "requirements": [], "events": [], "requirement_attachments": [],
            "adventure_beat_links": [],
        }
        self.event_by_step = {}
        self._snapshot_keys = set()

    def blocker(self, code, message, **location):
        self.blockers.append(_issue("blocker", code, message, **location))

    def warning(self, code, message, **location):
        self.warnings.append(_issue("warning", code, message, **location))

    def info(self, code, message, **location):
        self.information.append(_issue("info", code, message, **location))

    def artifact_id(self, key):
        artifacts = self.draft.setdefault("artifactIds", {})
        if not isinstance(artifacts, dict):
            artifacts = {}
            self.draft["artifactIds"] = artifacts
        existing = artifacts.get(key)
        if isinstance(existing, str) and existing.strip():
            return existing.strip()
        generated = _stable_id(self.flow_id, key)
        artifacts[key] = generated
        return generated

    def snapshot(self, kind, item_id, item):
        key = (kind, item_id)
        if key in self._snapshot_keys:
            return
        self._snapshot_keys.add(key)
        value = column_snapshot(item)
        if isinstance(item, Requirement) and value is not None:
            value = {
                **value,
                "required_flags": sorted(row.flag_id for row in item.required_flags or []),
                "forbidden_flags": sorted(row.flag_id for row in item.forbidden_flags or []),
                "min_faction_reputation": sorted(
                    ({"faction_id": row.faction_id, "min": row.min_value} for row in item.min_faction_reputation or []),
                    key=lambda row: (row["faction_id"], row["min"]),
                ),
            }
        self.snapshots.append({"kind": kind, "id": item_id, "value": value})

    def resolve(self, ref, step_id, path, expected_kind=None):
        if not isinstance(ref, dict):
            self.blocker("target_required", "Choose an existing canonical target for this step.", step_id=step_id, path=path)
            return None
        kind = str(ref.get("kind") or "")
        canonical_id = str(ref.get("canonicalId") or "").strip()
        if expected_kind and kind != expected_kind:
            self.blocker(
                "target_kind_mismatch",
                f"This step requires a {expected_kind} target, not {kind or 'an unspecified target'}.",
                step_id=step_id,
                path=f"{path}.kind",
            )
            return None
        model_entry = REFERENCE_MODELS.get(kind)
        if not model_entry or not canonical_id:
            self.blocker(
                "target_unresolved",
                "The target is local or unresolved; compilation requires an existing canonical record.",
                step_id=step_id,
                path=path,
            )
            return None
        schema_name, model = model_entry
        item = self.db_session.get(model, canonical_id)
        self.snapshot(kind, canonical_id, item)
        if item is None:
            self.blocker(
                "target_missing",
                f"The referenced {kind} '{canonical_id}' no longer exists.",
                step_id=step_id,
                path=f"{path}.canonicalId",
            )
            return None
        return schema_name, item

    def _check_identity(self):
        if self.draft.get("format") != CREATION_FLOW_FORMAT:
            self.blocker("format_invalid", f"format must be '{CREATION_FLOW_FORMAT}'.", path="draft.format")
        if not self.flow_id:
            self.blocker("draft_id_required", "The draft needs a stable id.", path="draft.id")
        if not str(self.draft.get("title") or "").strip():
            self.blocker("title_required", "Give the flow a title before compilation.", path="draft.title")
        if self.draft.get("shape") not in {"sequence", "constellation", "hybrid"}:
            self.blocker("shape_invalid", "shape must be sequence, constellation, or hybrid.", path="draft.shape")
        revision = self.draft.get("revision")
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            self.blocker("revision_invalid", "revision must be a positive integer.", path="draft.revision")

    def _check_unique_ids(self, values, collection, *, required=True):
        seen = set()
        for index, value in enumerate(values):
            if not isinstance(value, dict):
                self.blocker("entry_invalid", f"{collection}[{index}] must be an object.", path=f"draft.{collection}[{index}]")
                continue
            item_id = str(value.get("id") or "").strip()
            if required and not item_id:
                self.blocker("entry_id_required", f"{collection}[{index}].id is required.", path=f"draft.{collection}[{index}].id")
            elif item_id in seen:
                self.blocker("entry_id_duplicate", f"Duplicate {collection} id '{item_id}'.", path=f"draft.{collection}[{index}].id")
            seen.add(item_id)
        return seen

    def _check_generated_ownership(self, model, item_id, kind, step_id):
        item = self.db_session.get(model, item_id)
        self.snapshot(f"generated_{kind}", item_id, item)
        if item is None:
            return
        tags = getattr(item, "tags", None) or []
        ownership = f"creation-flow:{self.flow_id}".lower()
        if ownership not in [str(tag).lower() for tag in tags]:
            self.blocker(
                "artifact_id_collision",
                f"Generated {kind} id '{item_id}' already belongs to another record.",
                step_id=step_id,
            )

    def _event_base(self, step, index, event_type):
        step_id = step["id"]
        event_id = self.artifact_id(f"step:{step_id}:event")
        self._check_generated_ownership(Event, event_id, "event", step_id)
        title = str(step.get("text") or "").strip() or f"{step.get('kind', 'Narrative')} step"
        event = {
            "id": event_id,
            "slug": f"creation-flow-{_slug(self.flow_id)[-12:]}-{index + 1}-{_slug(step_id)[-8:]}",
            "title": title,
            "type": event_type,
            "item_rewards": [],
            "currency_rewards": [],
            "reputation_rewards": [],
            "flags_set": [],
            "tags": ["creation-flow", f"creation-flow:{self.flow_id}", f"creation-flow-step:{step_id}"],
            "next_event_id": None,
        }
        self.event_by_step[step_id] = event
        self.provenance.append({"artifact_kind": "event", "artifact_id": event_id, "step_id": step_id})
        return event

    def _reward_payload(self, step, event):
        step_id = step["id"]
        payload = step.get("payload") if isinstance(step.get("payload"), dict) else {}
        if step["kind"] == "item_reward":
            items = payload.get("items")
            if items is None:
                resolved = self.resolve(step.get("target"), step_id, f"draft.steps.{step_id}.target", "item")
                if resolved:
                    items = [{"item_id": resolved[1].id, "quantity": payload.get("quantity", 1)}]
            if not isinstance(items, list) or not items:
                self.blocker("item_reward_empty", "An item reward needs at least one item.", step_id=step_id)
                return
            for reward_index, reward in enumerate(items):
                if not isinstance(reward, dict):
                    self.blocker("item_reward_invalid", "Each item reward must be an object.", step_id=step_id)
                    continue
                item_id = str(reward.get("item_id") or reward.get("itemId") or "").strip()
                quantity = reward.get("quantity", 1)
                resolved = self.resolve(
                    {"kind": "item", "canonicalId": item_id}, step_id,
                    f"draft.steps.{step_id}.payload.items[{reward_index}]", "item",
                )
                if isinstance(quantity, bool) or not isinstance(quantity, (int, float)) or quantity <= 0:
                    self.blocker("item_quantity_invalid", "Item reward quantity must be greater than zero.", step_id=step_id)
                elif resolved:
                    event["item_rewards"].append({"item_id": item_id, "quantity": quantity})
            return

        xp = payload.get("xp_reward", payload.get("xpReward"))
        if xp is not None:
            if isinstance(xp, bool) or not isinstance(xp, (int, float)) or xp < 0:
                self.blocker("xp_reward_invalid", "XP reward must be a non-negative number.", step_id=step_id)
            else:
                event["xp_reward"] = xp
        for input_key, output_key, ref_kind, id_keys in (
            ("currency_rewards", "currency_rewards", "currency", ("currency_id", "currencyId")),
            ("reputation_rewards", "reputation_rewards", "faction", ("faction_id", "factionId")),
        ):
            rows = payload.get(input_key, payload.get("".join([input_key.split("_")[0], input_key.split("_")[1].title()]))) or []
            if not isinstance(rows, list):
                self.blocker("reward_list_invalid", f"{input_key} must be an array.", step_id=step_id)
                continue
            for reward_index, reward in enumerate(rows):
                if not isinstance(reward, dict):
                    self.blocker("reward_invalid", "Each numeric reward must be an object.", step_id=step_id)
                    continue
                ref_id = next((str(reward.get(key) or "").strip() for key in id_keys if reward.get(key)), "")
                amount = reward.get("amount")
                resolved = self.resolve(
                    {"kind": ref_kind, "canonicalId": ref_id}, step_id,
                    f"draft.steps.{step_id}.payload.{input_key}[{reward_index}]", ref_kind,
                )
                if isinstance(amount, bool) or not isinstance(amount, (int, float)):
                    self.blocker("reward_amount_invalid", "Reward amount must be a number.", step_id=step_id)
                elif ref_kind == "currency" and amount <= 0:
                    self.blocker("currency_reward_amount_invalid", "Currency reward amount must be greater than zero.", step_id=step_id)
                elif ref_kind == "faction" and amount == 0:
                    self.warning("reputation_reward_zero", "A zero reputation change has no effect.", step_id=step_id)
                elif resolved:
                    event[output_key].append({id_keys[0]: ref_id, "amount": amount})
        if not event.get("xp_reward") and not event["currency_rewards"] and not event["reputation_rewards"]:
            self.warning("numeric_reward_empty", "This numeric reward currently grants nothing.", step_id=step_id)

    def _state_step(self, step, event, *, availability=False):
        step_id = step["id"]
        flag_id = self.artifact_id(f"step:{step_id}:flag")
        self._check_generated_ownership(Flag, flag_id, "flag", step_id)
        title = str(step.get("text") or "State change").strip()
        flag = {
            "id": flag_id,
            "slug": f"creation-flow-{_slug(self.flow_id)[-12:]}-{_slug(step_id)[-8:]}-set",
            "name": title,
            "description": f"Generated by narrative creation flow '{self.draft.get('title')}'.",
            "flag_type": "Shop Unlock" if availability and step.get("target", {}).get("kind") == "shop" else "Story Progress",
            "default_value": False,
            "tags": ["creation-flow", f"creation-flow:{self.flow_id}", f"creation-flow-step:{step_id}"],
        }
        self.mutation["flags"].append(flag)
        event["flags_set"].append(flag_id)
        self.provenance.append({"artifact_kind": "flag", "artifact_id": flag_id, "step_id": step_id})
        if not availability:
            return

        resolved = self.resolve(step.get("target"), step_id, f"draft.steps.{step_id}.target")
        if not resolved:
            return
        target_kind = step["target"].get("kind")
        schema_name = ATTACHMENT_SCHEMA_BY_KIND.get(target_kind)
        if not schema_name or schema_name not in REQUIREMENT_TARGETS:
            self.blocker(
                "availability_target_unsupported",
                f"Availability gates cannot currently attach to {target_kind or 'this target type'}.",
                step_id=step_id,
            )
            return
        target = resolved[1]
        requirement_id = self.artifact_id(f"step:{step_id}:requirement")
        self._check_generated_ownership(Requirement, requirement_id, "requirement", step_id)
        if getattr(target, "requirements_id", None) not in (None, requirement_id):
            self.blocker(
                "requirement_composition_required",
                "The target already has a requirement. Automatic replacement would lose authored gating, so compose it manually first.",
                step_id=step_id,
            )
            return
        requirement = {
            "id": requirement_id,
            "slug": f"creation-flow-{_slug(self.flow_id)[-12:]}-{_slug(step_id)[-8:]}-available",
            "required_flags": [flag_id],
            "forbidden_flags": [],
            "min_faction_reputation": [],
            "tags": ["creation-flow", f"creation-flow:{self.flow_id}", f"creation-flow-step:{step_id}"],
        }
        self.mutation["requirements"].append(requirement)
        self.mutation["requirement_attachments"].append({
            "schema_name": schema_name,
            "entry_id": target.id,
            "requirements_id": requirement_id,
        })
        self.provenance.extend([
            {"artifact_kind": "requirement", "artifact_id": requirement_id, "step_id": step_id},
            {"artifact_kind": "requirement_attachment", "artifact_id": f"{schema_name}:{target.id}", "step_id": step_id},
        ])

    def _compile_step(self, step, index):
        step_id = str(step.get("id") or "")
        kind = str(step.get("kind") or "unshaped")
        before = {key: len(value) for key, value in self.mutation.items()}
        if kind == "story_placement":
            self._compile_story_placement(step, index)
            return
        if kind in STORY_ONLY_STEP_KINDS:
            self.info("story_only", "This intention remains in the manifest and does not create runtime data.", step_id=step_id)
            self.step_review.append({"step_id": step_id, "kind": kind, "status": "story_only", "artifacts": []})
            return
        if kind in BLOCKED_STEP_KINDS or kind not in COMPILABLE_STEP_KINDS:
            self.blocker(
                "step_kind_not_compilable",
                f"'{kind}' has no verified canonical compiler contract yet.",
                step_id=step_id,
                path=f"draft.steps[{index}].kind",
            )
            self.step_review.append({"step_id": step_id, "kind": kind, "status": "blocked", "artifacts": []})
            return

        event_type = {
            "dialogue": "Dialogue", "encounter": "Encounter", "item_reward": "ItemReward",
            "numeric_reward": "ItemReward", "lore_reveal": "LoreDiscovery", "teleport": "Teleport",
            "scripted_moment": "ScriptedScene", "make_available": "ScriptedScene",
            "persistent_fact": "ScriptedScene", "world_state": "ScriptedScene",
        }[kind]
        event = self._event_base(step, index, event_type)
        expected_kind = TARGET_BY_STEP.get(kind)
        if expected_kind:
            resolved = self.resolve(step.get("target"), step_id, f"draft.steps[{index}].target", expected_kind)
            if resolved:
                if kind == "dialogue":
                    event["dialogue_id"] = resolved[1].id
                elif kind == "encounter":
                    event["encounter_id"] = resolved[1].id
                elif kind == "lore_reveal":
                    event["lore_id"] = resolved[1].id
                elif kind == "teleport":
                    event["location_id"] = resolved[1].id
        if kind in {"item_reward", "numeric_reward"}:
            self._reward_payload(step, event)
        if kind in {"persistent_fact", "world_state"}:
            self._state_step(step, event)
        if kind == "make_available":
            self._state_step(step, event, availability=True)
        if step.get("repeatPolicy") not in (None, "unspecified", "inherit_owner"):
            self.warning(
                "repeat_policy_unrepresented",
                "The canonical Event model has no repeat-policy field; the intention is preserved in the manifest only.",
                step_id=step_id,
            )
        self.mutation["events"].append(event)
        artifacts = []
        for collection, previous_length in before.items():
            artifacts.extend({"kind": collection.rstrip("s"), "id": row.get("id") or row.get("entry_id")} for row in self.mutation[collection][previous_length:])
        self.step_review.append({"step_id": step_id, "kind": kind, "status": "compilable", "artifacts": artifacts})

    def _compile_story_placement(self, step, index):
        step_id = step["id"]
        beat = self.resolve(step.get("target"), step_id, f"draft.steps[{index}].target", "story_beat")
        origin = self.draft.get("origin") if isinstance(self.draft.get("origin"), dict) else {}
        origin_ref = origin.get("ref") if isinstance(origin.get("ref"), dict) else None
        origin_kind = str(origin_ref.get("kind") or "") if origin_ref else ""
        target_type = ADVENTURE_TARGET_TYPE_BY_KIND.get(origin_kind)
        if not beat or not origin_ref or not target_type:
            self.info(
                "story_placement_manifest_only",
                "Story placement needs a supported canonical flow origin and story beat to emit an Adventure Beat link; it remains in the manifest.",
                step_id=step_id,
            )
            self.step_review.append({"step_id": step_id, "kind": "story_placement", "status": "story_only", "artifacts": []})
            return
        subject = self.resolve(origin_ref, step_id, "draft.origin.ref", origin_kind)
        if not subject:
            self.step_review.append({"step_id": step_id, "kind": "story_placement", "status": "blocked", "artifacts": []})
            return
        link_id = self.artifact_id(f"step:{step_id}:adventure_beat_link")
        self._check_generated_ownership(AdventureBeatLink, link_id, "adventure_beat_link", step_id)
        role = "setting" if origin_kind == "location" else "runtime" if origin_kind in {"dialogue", "encounter", "event", "quest"} else "reference"
        link = {
            "id": link_id,
            "adventure_beat_id": beat[1].id,
            "target_type": target_type,
            "target_id": subject[1].id,
            "role": role,
            "occurrence_kind": "appearance",
            "change_type": "active",
            "importance": "major",
            "sort_order": index,
            "notes": str(step.get("text") or "").strip() or None,
            "tags": ["creation-flow", f"creation-flow:{self.flow_id}", f"creation-flow-step:{step_id}"],
        }
        self.mutation["adventure_beat_links"].append(link)
        self.provenance.append({"artifact_kind": "adventure_beat_link", "artifact_id": link_id, "step_id": step_id})
        self.step_review.append({
            "step_id": step_id, "kind": "story_placement", "status": "compilable",
            "artifacts": [{"kind": "adventure_beat_link", "id": link_id}],
        })

    def _compile_transitions(self, transitions, step_ids):
        outgoing = {}
        for index, transition in enumerate(transitions):
            if not isinstance(transition, dict):
                continue
            source = str(transition.get("fromStepId") or "")
            target = str(transition.get("toStepId") or "")
            path = f"draft.transitions[{index}]"
            if source not in step_ids or target not in step_ids:
                self.blocker("transition_step_missing", "Transition endpoints must reference existing steps.", path=path)
                continue
            if source == target:
                self.blocker("transition_self_cycle", "A step cannot transition directly to itself.", step_id=source, path=path)
                continue
            if transition.get("trigger", "complete") != "complete" or transition.get("requirementId") or transition.get("sourceRefId"):
                self.blocker(
                    "transition_semantics_unsupported",
                    "Only unconditional 'complete' transitions compile to Event.next_event_id today.",
                    step_id=source,
                    path=path,
                )
                continue
            outgoing.setdefault(source, []).append(target)
        for source, targets in outgoing.items():
            if len(targets) > 1:
                self.blocker(
                    "transition_branch_unsupported",
                    "Event.next_event_id is linear; this step has more than one outgoing runtime transition.",
                    step_id=source,
                )
                continue
            source_event = self.event_by_step.get(source)
            target_event = self.event_by_step.get(targets[0])
            if source_event and target_event:
                source_event["next_event_id"] = target_event["id"]
            elif source_event or target_event:
                self.warning(
                    "story_transition_not_executable",
                    "A transition touches a story-only step and is preserved only in the manifest.",
                    step_id=source,
                )

        visiting, visited = set(), set()
        def visit(node):
            if node in visiting:
                return True
            if node in visited:
                return False
            visiting.add(node)
            for target in outgoing.get(node, []):
                if visit(target):
                    return True
            visiting.remove(node)
            visited.add(node)
            return False
        if any(visit(node) for node in step_ids if node not in visited):
            self.blocker("transition_cycle_unsupported", "Canonical Event chains cannot contain a cycle.", path="draft.transitions")

    def compile(self):
        self._check_identity()
        try:
            steps = _as_list(self.draft.get("steps"), "draft.steps")
            transitions = _as_list(self.draft.get("transitions"), "draft.transitions")
            relations = _as_list(self.draft.get("relations"), "draft.relations")
            placeholders = _as_list(self.draft.get("placeholders"), "draft.placeholders")
            _as_list(self.draft.get("localNotes"), "draft.localNotes")
        except ValueError as error:
            self.blocker("collection_invalid", str(error))
            steps, transitions, relations, placeholders = [], [], [], []
        step_ids = self._check_unique_ids(steps, "steps")
        self._check_unique_ids(transitions, "transitions")
        self._check_unique_ids(relations, "relations")
        self._check_unique_ids(placeholders, "placeholders")
        for index, step in enumerate(steps):
            if isinstance(step, dict) and step.get("id"):
                self._compile_step(step, index)
        self._compile_transitions(transitions, step_ids)
        for placeholder in placeholders:
            if isinstance(placeholder, dict) and not placeholder.get("promotedCanonicalId"):
                self.warning(
                    "placeholder_local",
                    f"Placeholder '{placeholder.get('label') or placeholder.get('id')}' remains local.",
                    placeholder_id=placeholder.get("id"),
                )
        if relations:
            self.info("relations_manifest_only", "Cross-step relations are preserved in the manifest and do not create runtime links.")
        if not steps:
            self.warning("flow_empty", "This flow has no steps to compile.")

        self.snapshots.sort(key=lambda row: (row["kind"], row["id"]))
        preview_hash = _stable_hash({
            "compiler_version": COMPILER_VERSION,
            "draft": self.draft,
            "mutation": self.mutation,
            "canonical_snapshots": self.snapshots,
            "warning_ids": sorted(issue["id"] for issue in self.warnings),
            "blocker_ids": sorted(issue["id"] for issue in self.blockers),
        })
        executable = len(self.mutation["events"])
        summary = (
            f"{executable} event{'s' if executable != 1 else ''}, "
            f"{len(self.mutation['flags'])} flag{'s' if len(self.mutation['flags']) != 1 else ''}, "
            f"{len(self.mutation['requirements'])} requirement{'s' if len(self.mutation['requirements']) != 1 else ''}, "
            f"{len(self.mutation['adventure_beat_links'])} story link{'s' if len(self.mutation['adventure_beat_links']) != 1 else ''}."
        )
        rehearsal = self._build_rehearsal()
        return {
            "format": CREATION_FLOW_FORMAT,
            "compiler_version": COMPILER_VERSION,
            "normalized_draft": self.draft,
            "story_summary": {
                "id": self.flow_id,
                "title": self.draft.get("title"),
                "shape": self.draft.get("shape"),
                "origin": self.draft.get("origin"),
                "steps": [{"id": step.get("id"), "kind": step.get("kind"), "text": step.get("text")} for step in steps if isinstance(step, dict)],
                "relations": relations,
            },
            "implementation_summary": summary,
            "implementation": self.mutation,
            "step_review": self.step_review,
            "provenance": self.provenance,
            "canonical_snapshots": self.snapshots,
            "warnings": self.warnings,
            "blockers": self.blockers,
            "information": self.information,
            "rehearsal": rehearsal,
            "preview_hash": preview_hash,
            "can_commit": not self.blockers,
        }

    def _build_rehearsal(self):
        events = {event["id"]: event for event in self.mutation["events"]}
        targeted = {event.get("next_event_id") for event in events.values() if event.get("next_event_id")}
        starts = [event_id for event_id in events if event_id not in targeted]
        step_by_event = {
            row["artifact_id"]: row["step_id"]
            for row in self.provenance
            if row.get("artifact_kind") == "event"
        }
        paths = []
        for start in starts:
            trace, flags, current, seen = [], [], start, set()
            while current and current in events and current not in seen:
                seen.add(current)
                event = events[current]
                new_flags = [flag_id for flag_id in event.get("flags_set") or [] if flag_id not in flags]
                flags.extend(new_flags)
                trace.append({
                    "event_id": current,
                    "step_id": step_by_event.get(current),
                    "title": event.get("title"),
                    "event_type": event.get("type"),
                    "target_id": event.get("dialogue_id") or event.get("encounter_id") or event.get("lore_id") or event.get("location_id"),
                    "flags_added": new_flags,
                    "state_after": {"flags": list(flags)},
                })
                current = event.get("next_event_id")
            paths.append({"entry_event_id": start, "trace": trace, "terminal_event_id": trace[-1]["event_id"] if trace else None})
        return {
            "runtime_claim": "web_contract_only",
            "paths": paths,
            "disconnected_event_count": sum(1 for path in paths if len(path["trace"]) == 1),
            "note": "This is a temporary canonical sequence/state trace, not runtime execution verification.",
        }


def compile_creation_flow(db_session, draft):
    return CreationFlowCompiler(db_session, draft).compile()


def upsert_creation_flow_manifest(db_session, result, accepted_warning_ids):
    draft = result["normalized_draft"]
    item = db_session.get(CreationFlowManifest, draft["id"])
    if item is None:
        item = CreationFlowManifest(id=draft["id"])
    item.title = draft["title"]
    item.format = draft["format"]
    item.revision = draft["revision"]
    item.shape = draft["shape"]
    item.compiler_version = result["compiler_version"]
    item.preview_hash = result["preview_hash"]
    item.normalized_draft = draft
    item.provenance = result["provenance"]
    item.accepted_warnings = sorted(accepted_warning_ids)
    item.canonical_snapshots = result["canonical_snapshots"]
    item.implementation_summary = result["implementation_summary"]
    db_session.add(item)
    db_session.flush()
    return item
