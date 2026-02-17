from backend.app.models.m_stats import Stat
from backend.app.models.m_story_arcs import StoryArc
from backend.app.utils import csv_tools


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
