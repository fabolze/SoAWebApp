from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.routes import base_route, r_abilities, r_flags, r_requirements


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def get_session():
        return Session()

    monkeypatch.setattr(base_route, "get_db_session", get_session)
    monkeypatch.setattr(r_abilities, "get_db_session", get_session)
    monkeypatch.setattr(r_flags, "get_db_session", get_session)
    monkeypatch.setattr(r_requirements, "get_db_session", get_session)

    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        code = getattr(error, "code", 500)
        description = getattr(error, "description", str(error))
        return jsonify({"message": description}), code

    app.register_blueprint(r_flags.bp)
    app.register_blueprint(r_requirements.bp)
    app.register_blueprint(r_abilities.bp)
    return app.test_client()


def test_ability_saves_and_reloads_requirements_id(monkeypatch):
    client = _client(monkeypatch)

    assert client.post("/api/requirements", json={
        "id": "req-use-fireball",
        "slug": "use-fireball",
        "required_flags": [],
        "forbidden_flags": [],
    }).status_code == 200

    response = client.post("/api/abilities", json={
        "id": "ability-fireball",
        "slug": "fireball",
        "name": "Fireball",
        "type": "Active",
        "targeting": "Single",
        "damage_type_source": "Fixed",
        "damage_type": "Fire",
        "requirements_id": "req-use-fireball",
        "effects": [],
        "scaling": [],
    })

    assert response.status_code == 200
    payload = client.get("/api/abilities/ability-fireball").get_json()
    assert payload["requirements_id"] == "req-use-fireball"
    assert payload["requirements"] is None


def test_ability_rejects_missing_requirements_id(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/abilities", json={
        "id": "ability-locked",
        "slug": "locked",
        "name": "Locked Ability",
        "type": "Passive",
        "requirements_id": "missing-requirement",
        "effects": [],
        "scaling": [],
    })

    assert response.status_code == 400
    assert "Invalid requirements_id" in response.get_json()["message"]


def test_requirements_validate_required_and_forbidden_flags(monkeypatch):
    client = _client(monkeypatch)

    assert client.post("/api/flags", json={
        "id": "flag-known",
        "slug": "known",
        "name": "Known",
        "description": "Known test flag.",
    }).status_code == 200

    valid = client.post("/api/requirements", json={
        "id": "req-known",
        "slug": "known-gate",
        "required_flags": ["flag-known"],
        "forbidden_flags": ["flag-known"],
    })
    assert valid.status_code == 200

    payload = client.get("/api/requirements/req-known").get_json()
    assert payload["required_flags"] == ["flag-known"]
    assert payload["forbidden_flags"] == ["flag-known"]

    invalid = client.post("/api/requirements", json={
        "id": "req-missing",
        "slug": "missing-gate",
        "required_flags": ["missing-flag"],
        "forbidden_flags": [],
    })
    assert invalid.status_code == 400
    assert "Invalid flag_id" in invalid.get_json()["message"]
