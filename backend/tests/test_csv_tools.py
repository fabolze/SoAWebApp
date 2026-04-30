from backend.app.models.m_abilities_links import AbilityEffectLink
from backend.app.models.m_stats import Stat
from backend.app.models.m_story_arcs import StoryArc
from backend.app.utils import csv_tools
from backend.app.routes import r_export
from flask import Flask
from io import BytesIO


def _mock_serialized_items(monkeypatch, items):
    monkeypatch.setattr(
        csv_tools,
        "serialize_items_for_table",
        lambda table_name, model_class, rows: [dict(item) for item in items],
    )


def test_row_key_column_is_first_and_matches_slug(monkeypatch):
    items = [
        {
            "id": "01TEST",
            "slug": "health",
            "name": "Health",
            "category": "Attribute",
            "value_type": "float",
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("stats", Stat, [])
    row = data_rows[0]

    assert columns[0] == csv_tools.UE_ROW_KEY_HEADER
    assert row[columns.index(csv_tools.UE_ROW_KEY_HEADER)] == "health"
    assert row[columns.index("slug")] == "health"
    assert columns.index("id") > 0


def test_row_key_is_trimmed_deterministic_and_unique(monkeypatch):
    items = [
        {"id": "01A", "slug": "  Alpha Boss  ", "name": "Alpha Boss"},
        {"id": "01B", "slug": "alpha-boss", "name": "Alpha Boss"},
        {"id": "01C", "slug": "", "name": "Alpha Boss"},
        {"id": "01D", "slug": None, "name": "   "},
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("stats", Stat, [])
    row_key_idx = columns.index(csv_tools.UE_ROW_KEY_HEADER)
    slug_idx = columns.index("slug")

    row_keys = [row[row_key_idx] for row in data_rows]
    slugs = [row[slug_idx] for row in data_rows]

    assert row_keys == ["alpha-boss", "alpha-boss_2", "alpha-boss_3", "01d"]
    assert slugs == row_keys


def test_enum_columns_export_enum_name_tokens(monkeypatch):
    items = [
        {
            "id": "01ARC",
            "slug": "main-story",
            "title": "Main Story Arc",
            "summary": "Summary",
            "type": "Main Story",
            "content_pack_id": "01PACK",
            "required_flags": [],
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("story_arcs", StoryArc, [])
    row = data_rows[0]

    assert row[columns.index("type")] == "Main"


def test_enum_none_member_token_strips_python_suffix(monkeypatch):
    items = [
        {
            "id": "01LINK",
            "attribute_id": "attr1",
            "stat_id": "stat1",
            "scale": "None",
            "multiplier": 1.0,
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    from backend.app.models.m_attribute_stat_link import AttributeStatLink
    columns, data_rows = csv_tools.build_csv_rows("attribute_stat_links", AttributeStatLink, [])
    row = data_rows[0]

    assert row[columns.index("scale")] == "None"


def test_row_key_falls_back_to_slug_name_when_slug_absent(monkeypatch):
    class _Column:
        def __init__(self, name):
            self.name = name
            self.type = None

    class _Table:
        columns = [_Column("id"), _Column("slugName"), _Column("label")]

    class _DummyModel:
        __table__ = _Table()

    items = [{"id": "01X", "slugName": "Hero_Primary", "label": "Hero"}]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("dummy_table_for_tests", _DummyModel, [])
    row = data_rows[0]

    assert columns[0] == csv_tools.UE_ROW_KEY_HEADER
    assert row[columns.index(csv_tools.UE_ROW_KEY_HEADER)] == "hero-primary"
    assert "slug" not in columns


def test_slugless_template_row_keys_are_readable_and_unique(monkeypatch):
    items = [
        {
            "id": "01A",
            "ability_id": "ab1",
            "effect_id": "ef1",
            "ability_slug": "power_slash",
            "effect_slug": "bleeding",
        },
        {
            "id": "01B",
            "ability_id": "ab1",
            "effect_id": "ef1",
            "ability_slug": "power_slash",
            "effect_slug": "bleeding",
        },
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("ability_effect_links", AbilityEffectLink, [])
    row_key_idx = columns.index(csv_tools.UE_ROW_KEY_HEADER)
    row_keys = [row[row_key_idx] for row in data_rows]

    assert row_keys == ["power-slash__bleeding", "power-slash__bleeding_2"]


def test_transient_reference_slug_aliases_are_not_exported(monkeypatch):
    items = [{"id": "01A", "ability_id": "ab1", "effect_id": "ef1"}]
    _mock_serialized_items(monkeypatch, items)
    monkeypatch.setattr(
        csv_tools,
        "_build_reference_slug_lookups",
        lambda model_class, rows_list, current_items: {
            "ability_id": {"ab1": "power_slash"},
            "effect_id": {"ef1": "bleeding"},
        },
    )

    columns, data_rows = csv_tools.build_csv_rows("ability_effect_links", AbilityEffectLink, [])
    row = data_rows[0]

    assert "ability_slug" not in columns
    assert "effect_slug" not in columns
    assert row[columns.index(csv_tools.UE_ROW_KEY_HEADER)] == "power-slash__bleeding"


class _PreviewColumn:
    def __init__(self, name):
        self.name = name


class _PreviewTable:
    columns = [_PreviewColumn("id"), _PreviewColumn("slug"), _PreviewColumn("name"), _PreviewColumn("tags")]


class _PreviewModel:
    __tablename__ = "preview_items"
    __table__ = _PreviewTable()

    def __init__(self, id, slug, name, tags=None):
        self.id = id
        self.slug = slug
        self.name = name
        self.tags = tags or []


class _PreviewQuery:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _PreviewSession:
    def __init__(self, rows):
        self.rows = rows
        self.committed = False

    def query(self, model):
        return _PreviewQuery(self.rows)

    def close(self):
        pass

    def commit(self):
        self.committed = True


def _preview_client(monkeypatch, rows):
    session = _PreviewSession(rows)
    monkeypatch.setattr(r_export, "ALL_MODELS", [_PreviewModel])
    monkeypatch.setattr(r_export, "get_db_session", lambda: session)
    monkeypatch.setattr(r_export, "load_schema", lambda table_name: {
        "properties": {
            "id": {"type": "string"},
            "slug": {"type": "string"},
            "name": {"type": "string"},
            "tags": {"type": "array"},
        }
    })
    app = Flask(__name__)
    app.register_blueprint(r_export.bp)
    return app.test_client(), session


def test_csv_import_preview_counts_changes_without_commit(monkeypatch):
    client, session = _preview_client(monkeypatch, [
        _PreviewModel("01A", "alpha", "Alpha", ["old"]),
        _PreviewModel("01B", "beta", "Beta", []),
    ])
    payload = b"id,slug,name,tags\n01A,alpha,Alpha Updated,\"[\"\"new\"\"]\"\n01C,gamma,Gamma,\"[\"\"fresh\"\"]\"\n"

    response = client.post(
        "/api/import/csv/preview_items/preview",
        data={"file": (BytesIO(payload), "preview_items.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "ok"
    assert body["counts"] == {"added": 1, "updated": 1, "deleted": 1, "unchanged": 0}
    assert session.committed is False


def test_csv_import_preview_reports_duplicate_ids(monkeypatch):
    client, _session = _preview_client(monkeypatch, [])
    payload = b"id,slug,name\n01A,alpha,Alpha\n01A,alpha-2,Alpha Two\n"

    response = client.post(
        "/api/import/csv/preview_items/preview",
        data={"file": (BytesIO(payload), "preview_items.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "error"
    assert "Duplicate id" in body["errors"][0]["message"]
