from backend.app.routes import r_authoring
from flask import Flask


def _client(monkeypatch, enabled=False):
    if enabled:
        monkeypatch.setenv("SOA_AUTHORING_AI_ENABLED", "true")
    else:
        monkeypatch.delenv("SOA_AUTHORING_AI_ENABLED", raising=False)
    app = Flask(__name__)
    app.register_blueprint(r_authoring.bp)
    return app.test_client()


def test_authoring_generate_disabled_by_default(monkeypatch):
    client = _client(monkeypatch, enabled=False)

    response = client.post("/api/authoring/generate", json={})

    assert response.status_code == 501
    body = response.get_json()
    assert body["status"] == "disabled"
    assert body["suggestions"] == []


def test_authoring_generate_validates_enabled_request(monkeypatch):
    client = _client(monkeypatch, enabled=True)

    response = client.post("/api/authoring/generate", json={"schemaName": "items"})

    assert response.status_code == 400
    assert "schema" in response.get_json()["message"]


def test_authoring_generate_filters_patch_fields(monkeypatch):
    client = _client(monkeypatch, enabled=True)

    response = client.post("/api/authoring/generate", json={
        "schemaName": "items",
        "schema": {"properties": {"name": {"type": "string"}, "tags": {"type": "array"}}},
        "currentEntry": {},
        "brief": {"theme": "Frost"},
        "outputKind": "patch",
    })

    assert response.status_code == 200
    body = response.get_json()
    patch = body["suggestions"][0]["patch"]["patch"]
    assert set(patch.keys()) <= {"name", "tags"}
    assert "description" not in patch
