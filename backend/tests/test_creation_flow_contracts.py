import json
from pathlib import Path

import pytest
from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models import ALL_MODELS  # noqa: F401 - populate Base metadata
from backend.app.models.base import Base
from backend.app.models.m_adventure_narrative import AdventureBeat, AdventureBeatLink, AdventureBeatType
from backend.app.models.m_creation_flow_manifests import CreationFlowManifest
from backend.app.models.m_currencies import Currency, CurrencyType
from backend.app.models.m_dialogues import Dialogue
from backend.app.models.m_encounters import Encounter, EncounterType
from backend.app.models.m_events import Event
from backend.app.models.m_factions import Alignment, Faction
from backend.app.models.m_flags import Flag
from backend.app.models.m_items import Item, ItemType
from backend.app.models.m_locations import Location
from backend.app.models.m_lore_entries import LoreEntry
from backend.app.models.m_requirements import Requirement
from backend.app.models.m_shops import Shop
from backend.app.routes import r_ui_creation_flow
from backend.app.services.creation_flow_compiler import compile_creation_flow
from backend.app.utils.csv_tools import AUTHORING_ONLY_TABLES


FIXTURES = Path(__file__).parent / "fixtures" / "creation_flow"


@pytest.fixture()
def creation_flow_context(monkeypatch):
    engine = create_engine(
        "sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(r_ui_creation_flow, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_ui_creation_flow.bp)
    session = Session()
    session.add_all([
        Dialogue(id="dialogue-1", slug="dialogue-1", title="Captain's offer", tags=[]),
        Encounter(id="encounter-1", slug="encounter-1", name="Tower ambush", encounter_type=EncounterType.Combat, participants=[], rewards={}, tags=[]),
        Currency(id="currency-1", slug="crowns", name="Crowns", type=CurrencyType.Soft, tags=[]),
        Faction(id="faction-1", slug="watch", name="City Watch", alignment=Alignment.Friendly, tags=[]),
        Item(id="item-1", slug="tower-key", name="Tower Key", type=ItemType.Quest, base_price=0, tags=[]),
        Location(id="location-1", slug="ash-harbour", name="Ash Harbour", tags=[]),
        LoreEntry(id="lore-1", slug="old-fleet", title="The Old Fleet", text="The fleet burned here.", tags=[]),
        AdventureBeat(id="beat-1", slug="chapter-three-echo", title="An old echo", beat_type=AdventureBeatType.Discovery, sort_order=3, tags=[]),
        Shop(id="shop-1", slug="watch-armoury", name="Watch Armoury", tags=[]),
    ])
    session.commit()
    session.close()
    return app.test_client(), Session


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", [
    "workflow_1_sequence.json",
    "workflow_2_constellation.json",
    "workflow_3_hybrid.json",
])
def test_golden_workflows_compile_deterministically(creation_flow_context, name):
    _, Session = creation_flow_context
    fixture = load_fixture(name)
    session = Session()
    first = compile_creation_flow(session, fixture["draft"])
    second = compile_creation_flow(session, fixture["draft"])
    expected = fixture["expected"]
    assert first["preview_hash"] == second["preview_hash"]
    assert first["normalized_draft"]["artifactIds"] == second["normalized_draft"]["artifactIds"]
    assert len(first["implementation"]["events"]) == expected["events"]
    assert len(first["implementation"]["flags"]) == expected["flags"]
    assert len(first["implementation"]["requirements"]) == expected["requirements"]
    assert len(first["implementation"]["adventure_beat_links"]) == expected["story_links"]
    assert len(first["blockers"]) == expected["blockers"]
    assert first["rehearsal"]["runtime_claim"] == "web_contract_only"
    session.close()


def test_catalog_reports_references_and_authoritative_capabilities(creation_flow_context):
    client, _ = creation_flow_context
    response = client.get("/api/ui/creation-flow/catalog")
    assert response.status_code == 200
    body = response.get_json()
    assert body["format"] == "SOA-CREATION-FLOW/1"
    assert body["references"]["dialogue"]["entries"][0]["id"] == "dialogue-1"
    assert "make_available" in body["capabilities"]["compilable_step_kinds"]
    assert "open_shop" in body["capabilities"]["blocked_step_kinds"]


def test_preview_rolls_back_all_compiled_artifacts(creation_flow_context):
    client, Session = creation_flow_context
    fixture = load_fixture("workflow_1_sequence.json")
    response = client.post("/api/ui/creation-flow/preview", json={"draft": fixture["draft"]})
    assert response.status_code == 200
    body = response.get_json()
    assert body["can_commit"] is True
    assert len(body["review"]["created"]) == 4
    session = Session()
    assert session.query(Event).count() == 0
    assert session.query(CreationFlowManifest).count() == 0
    session.close()


def test_constellation_preview_validates_story_link_and_rehearses_disconnected_state(creation_flow_context):
    client, Session = creation_flow_context
    fixture = load_fixture("workflow_2_constellation.json")
    response = client.post("/api/ui/creation-flow/preview", json={"draft": fixture["draft"]})
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert any(change["table"] == "adventure_beat_links" for change in body["review"]["created"])
    assert len(body["rehearsal"]["paths"]) == 2
    assert any(path["trace"][0]["state_after"]["flags"] for path in body["rehearsal"]["paths"])
    session = Session()
    assert session.query(AdventureBeatLink).count() == 0
    session.close()


def test_bundle_commits_atomically_with_recoverable_manifest(creation_flow_context):
    client, Session = creation_flow_context
    fixture = load_fixture("workflow_3_hybrid.json")
    preview = client.post("/api/ui/creation-flow/preview", json={"draft": fixture["draft"]}).get_json()
    response = client.post("/api/ui/creation-flow/bundle", json={
        "draft": preview["normalized_draft"],
        "preview_hash": preview["preview_hash"],
        "accepted_warning_ids": [warning["id"] for warning in preview["warnings"]],
    })
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["committed"] is True
    session = Session()
    assert session.query(Event).count() == 3
    assert session.query(Flag).count() == 2
    assert session.query(Requirement).count() == 1
    manifest = session.get(CreationFlowManifest, "flow-workflow-3")
    assert manifest is not None
    assert len(manifest.provenance) >= 6
    assert session.get(Shop, "shop-1").requirements_id is not None
    session.close()


def test_bundle_rejects_stale_preview_without_partial_writes(creation_flow_context):
    client, Session = creation_flow_context
    fixture = load_fixture("workflow_1_sequence.json")
    preview = client.post("/api/ui/creation-flow/preview", json={"draft": fixture["draft"]}).get_json()
    session = Session()
    dialogue = session.get(Dialogue, "dialogue-1")
    dialogue.title = "Changed concurrently"
    session.commit()
    session.close()
    response = client.post("/api/ui/creation-flow/bundle", json={
        "draft": preview["normalized_draft"],
        "preview_hash": preview["preview_hash"],
        "accepted_warning_ids": [],
    })
    assert response.status_code == 409
    session = Session()
    assert session.query(Event).count() == 0
    assert session.query(CreationFlowManifest).count() == 0
    session.close()


def test_recompile_rejects_concurrent_generated_requirement_child_change(creation_flow_context):
    client, Session = creation_flow_context
    fixture = load_fixture("workflow_3_hybrid.json")
    first_preview = client.post("/api/ui/creation-flow/preview", json={"draft": fixture["draft"]}).get_json()
    committed = client.post("/api/ui/creation-flow/bundle", json={
        "draft": first_preview["normalized_draft"],
        "preview_hash": first_preview["preview_hash"],
        "accepted_warning_ids": [warning["id"] for warning in first_preview["warnings"]],
    }).get_json()
    second_preview = client.post("/api/ui/creation-flow/preview", json={"draft": committed["normalized_draft"]}).get_json()
    requirement_id = committed["implementation"]["requirements"][0]["id"]
    session = Session()
    requirement = session.get(Requirement, requirement_id)
    requirement.required_flags.clear()
    session.commit()
    session.close()
    response = client.post("/api/ui/creation-flow/bundle", json={
        "draft": second_preview["normalized_draft"],
        "preview_hash": second_preview["preview_hash"],
        "accepted_warning_ids": [warning["id"] for warning in second_preview["warnings"]],
    })
    assert response.status_code == 409


def test_unsupported_semantics_are_step_scoped_blockers(creation_flow_context):
    client, _ = creation_flow_context
    draft = load_fixture("workflow_3_hybrid.json")["draft"]
    draft["steps"][0] = {
        "id": "step-scene", "kind": "open_shop", "text": "Open the armoury now",
        "target": {"kind": "shop", "canonicalId": "shop-1"},
        "targetResolution": "canonical", "support": "compilable",
    }
    response = client.post("/api/ui/creation-flow/preview", json={"draft": draft})
    assert response.status_code == 200
    body = response.get_json()
    assert body["can_commit"] is False
    assert any(issue["step_id"] == "step-scene" and issue["code"] == "step_kind_not_compilable" for issue in body["blockers"])
    assert body["review"]["created"] == []


def test_numeric_reward_validation_is_step_scoped(creation_flow_context):
    client, _ = creation_flow_context
    draft = load_fixture("workflow_1_sequence.json")["draft"]
    reward_step = next(step for step in draft["steps"] if step["id"] == "step-reward")
    reward_step["payload"]["currencyRewards"][0]["amount"] = 0
    reward_step["payload"]["reputationRewards"][0]["amount"] = 0
    response = client.post("/api/ui/creation-flow/preview", json={"draft": draft})
    assert response.status_code == 200
    body = response.get_json()
    assert any(issue["code"] == "currency_reward_amount_invalid" and issue["step_id"] == "step-reward" for issue in body["blockers"])
    assert any(issue["code"] == "reputation_reward_zero" and issue["step_id"] == "step-reward" for issue in body["warnings"])


def test_manifest_is_source_recoverable_but_excluded_from_runtime_export():
    assert "creation_flow_manifests" in AUTHORING_ONLY_TABLES
