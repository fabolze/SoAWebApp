from flask import Flask, jsonify
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.models.base import Base
from backend.app.models.m_timelines import Timeline
from backend.app.routes import base_route, r_timelines


def _client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(base_route, "get_db_session", lambda: Session())
    monkeypatch.setattr(r_timelines, "get_db_session", lambda: Session())
    app = Flask(__name__)

    @app.errorhandler(Exception)
    def handle_error(error):
        return jsonify({"message": getattr(error, "description", str(error))}), getattr(error, "code", 400)

    app.register_blueprint(r_timelines.bp)
    return app.test_client(), Session


def test_timeline_route_accepts_dragon_era_year_strings(monkeypatch):
    client, Session = _client(monkeypatch)

    response = client.post("/api/timelines", json={
        "id": "timeline-1",
        "slug": "ancient-era",
        "name": "Ancient Era",
        "start_year": "-50.000 b.D.",
        "end_year": "10.000 a.D.",
        "tags": [],
    })

    assert response.status_code == 200
    session = Session()
    timeline = session.get(Timeline, "timeline-1")
    assert timeline.start_year == -50000
    assert timeline.end_year == 10000
    session.close()


def test_timeline_route_rejects_negative_after_dragons_year(monkeypatch):
    client, Session = _client(monkeypatch)

    response = client.post("/api/timelines", json={
        "id": "timeline-1",
        "slug": "bad-era",
        "name": "Bad Era",
        "start_year": "-10 a.D.",
        "tags": [],
    })

    assert response.status_code == 400
    assert "a.D. years cannot be negative" in response.get_json()["message"]
    session = Session()
    assert session.get(Timeline, "timeline-1") is None
    session.close()
