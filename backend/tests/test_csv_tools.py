from backend.app.models.m_abilities_links import AbilityEffectLink
from backend.app.models.m_abilities import Ability
from backend.app.models.m_attributes import Attribute
from backend.app.models.m_items import Item
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


def test_attributes_export_omits_results_in_column(monkeypatch):
    items = [
        {
            "id": "01ATTR",
            "slug": "strength",
            "name": "Strength",
            "value_type": "float",
            "results_in": [{"stat_id": "hp", "scale": "Linear", "multiplier": 1.0}],
            "used_in": ["Character"],
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("attributes", Attribute, [])
    row = data_rows[0]

    assert "results_in" not in columns
    assert "used_in" in columns
    assert row[columns.index(csv_tools.UE_ROW_KEY_HEADER)] == "strength"


def test_abilities_export_omits_nested_link_columns(monkeypatch):
    items = [
        {
            "id": "01ABL",
            "slug": "power-slash",
            "name": "Power Slash",
            "type": "Active",
            "effects": ["01EFF"],
            "scaling": [{"stat_id": "01STAT", "multiplier": 0.8}],
            "requirements": {"flags": []},
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, _ = csv_tools.build_csv_rows("abilities", Ability, [])

    assert "effects" not in columns
    assert "scaling" not in columns
    assert "requirements" in columns


def test_items_export_omits_modifier_payload_columns(monkeypatch):
    items = [
        {
            "id": "01ITEM",
            "slug": "iron-sword",
            "name": "Iron Sword",
            "type": "Weapon",
            "stat_modifiers": [{"stat_id": "01STAT", "value": 3}],
            "attribute_modifiers": [{"attribute_id": "01ATTR", "value": 1}],
            "effects": [],
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, _ = csv_tools.build_csv_rows("items", Item, [])

    assert "stat_modifiers" not in columns
    assert "attribute_modifiers" not in columns


def test_array_cells_use_ue_property_text_not_json(monkeypatch):
    items = [
        {
            "id": "01ATTR",
            "slug": "strength",
            "name": "Strength",
            "value_type": "float",
            "used_in": ["Character", "Item"],
            "tags": ["core", "combat"],
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    columns, data_rows = csv_tools.build_csv_rows("attributes", Attribute, [])
    row = data_rows[0]

    used_in_cell = row[columns.index("used_in")]
    tags_cell = row[columns.index("tags")]

    assert used_in_cell == '("Character","Item")'
    assert tags_cell == '("core","combat")'


def test_nested_struct_arrays_use_ue_property_text(monkeypatch):
    items = [
        {
            "id": "01CLASS",
            "slug": "warrior",
            "name": "Warrior",
            "role": "Tank",
            "base_stats": [
                {"stat_id": "01HP", "value": 100},
                {"stat_id": "01ATK", "value": 10},
            ],
            "stat_growth": [{"stat_id": "01HP", "value": 5}],
        }
    ]
    _mock_serialized_items(monkeypatch, items)

    from backend.app.models.m_characterclasses import CharacterClass
    columns, data_rows = csv_tools.build_csv_rows("characterclasses", CharacterClass, [])
    row = data_rows[0]

    base_stats_cell = row[columns.index("base_stats")]
    stat_growth_cell = row[columns.index("stat_growth")]

    assert base_stats_cell == '((stat_id="01HP",value=100),(stat_id="01ATK",value=10))'
    assert stat_growth_cell == '((stat_id="01HP",value=5))'
