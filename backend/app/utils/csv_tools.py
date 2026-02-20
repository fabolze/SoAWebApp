import csv
import enum
import io
import json
import os
import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.types import Enum as SAEnum
from sqlalchemy.orm import object_session

from backend.app.routes.base_route import ROUTE_REGISTRY

UE_ROW_KEY_HEADER = "Name"
ROW_KEY_SOURCE_FIELDS = ("slug", "slugName", "name", "title", "id")
ROW_KEY_FALLBACK = "row"
ROW_KEY_TABLE_TEMPLATES: Dict[str, Tuple[str, ...]] = {
    "ability_effect_links": ("ability_slug", "effect_slug"),
    "ability_scaling_links": ("ability_slug", "stat_slug"),
    "attribute_stat_links": ("attribute_slug", "stat_slug", "scale"),
    "combat_profiles": ("character_slug", "enemy_type", "aggression"),
    "interaction_profiles": ("character_slug", "role", "dialogue_tree_slug"),
    "item_attribute_modifiers": ("item_slug", "attribute_slug", "order_index"),
    "item_stat_modifiers": ("item_slug", "stat_slug", "order_index"),
    "requirement_forbidden_flags": ("requirement_slug", "flag_slug"),
    "requirement_required_flags": ("requirement_slug", "flag_slug"),
    "requirement_min_faction_reputation": ("requirement_slug", "faction_slug", "min_value"),
    "talent_node_links": ("tree_slug", "from_node_slug", "to_node_slug", "min_rank_required"),
}


def _schema_path(table_name: str) -> str:
    return os.path.join(os.path.dirname(__file__), "..", "schemas", f"{table_name}.json")


def load_schema(table_name: str) -> Optional[Dict[str, Any]]:
    path = _schema_path(table_name)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def load_schema_columns(table_name: str) -> List[str]:
    schema = load_schema(table_name)
    if not schema:
        return []
    props = schema.get("properties", {})
    if isinstance(props, dict):
        return list(props.keys())
    return []


def serialize_items_for_table(table_name: str, model_class: Any, rows: Iterable[Any]) -> List[Dict[str, Any]]:
    route = ROUTE_REGISTRY.get(table_name)
    if route:
        serializer = getattr(route, "serialize_item", None) or route.serialize_model
        return [serializer(row) for row in rows]
    # Fallback: raw column data
    columns = [c.name for c in model_class.__table__.columns]
    return [{col: getattr(row, col) for col in columns} for row in rows]


def _order_columns(columns: List[str]) -> List[str]:
    ordered: List[str] = []
    for key in [UE_ROW_KEY_HEADER, "id", "slug", "slugName"]:
        if key in columns and key not in ordered:
            ordered.append(key)
    for key in columns:
        if key not in ordered:
            ordered.append(key)
    return ordered


def resolve_columns(table_name: str, model_class: Any, items: List[Dict[str, Any]]) -> List[str]:
    columns = load_schema_columns(table_name)
    if not columns:
        try:
            columns = [col.name for col in model_class.__table__.columns]
        except Exception:
            columns = []
    if UE_ROW_KEY_HEADER not in columns:
        columns.insert(0, UE_ROW_KEY_HEADER)
    for item in items:
        for key in item.keys():
            if key not in columns:
                columns.append(key)
    return _order_columns(columns)


def _model_has_column(model_class: Any, column_name: str) -> bool:
    try:
        return any(col.name == column_name for col in model_class.__table__.columns)
    except Exception:
        return False


def _to_slug_token(raw_value: Any) -> str:
    text = str(raw_value or "").strip().lower()
    if not text:
        return ROW_KEY_FALLBACK
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    text = re.sub(r"-{2,}", "-", text)
    return text or ROW_KEY_FALLBACK


def _resolve_row_key_source(item: Dict[str, Any]) -> Any:
    for key in ROW_KEY_SOURCE_FIELDS:
        value = item.get(key)
        if value is not None and str(value).strip() != "":
            return value
    return ROW_KEY_FALLBACK


def _get_table_model_map() -> Dict[str, Any]:
    try:
        from backend.app.models import ALL_MODELS
    except Exception:
        return {}
    return {
        getattr(model, "__tablename__", ""): model
        for model in ALL_MODELS
        if getattr(model, "__tablename__", None)
    }


def _guess_target_table_for_id_field(field_name: str, table_map: Dict[str, Any]) -> Optional[str]:
    if not field_name.endswith("_id"):
        return None
    stem = field_name[:-3]
    candidates = [stem]
    if stem.endswith("y"):
        candidates.append(stem[:-1] + "ies")
    else:
        candidates.append(stem + "s")
        candidates.append(stem + "es")
    for candidate in candidates:
        if candidate in table_map:
            return candidate
    return None


def _get_target_table_from_fk(model_class: Any, field_name: str) -> Optional[str]:
    try:
        column = next((col for col in model_class.__table__.columns if col.name == field_name), None)
        if column is None:
            return None
        for fk in column.foreign_keys:
            table_name = getattr(getattr(fk, "column", None), "table", None)
            table_name = getattr(table_name, "name", None)
            if table_name:
                return str(table_name)
    except Exception:
        return None
    return None


def _build_reference_slug_lookups(
    model_class: Any,
    rows_list: List[Any],
    items: List[Dict[str, Any]],
) -> Dict[str, Dict[str, str]]:
    if not rows_list:
        return {}
    session = object_session(rows_list[0])
    if session is None:
        return {}

    table_map = _get_table_model_map()
    id_fields = sorted({
        key
        for item in items
        for key in item.keys()
        if isinstance(key, str) and key.endswith("_id")
    })
    lookups: Dict[str, Dict[str, str]] = {}

    for field_name in id_fields:
        target_table = _get_target_table_from_fk(model_class, field_name) or _guess_target_table_for_id_field(field_name, table_map)
        if not target_table:
            continue
        target_model = table_map.get(target_table)
        if target_model is None or not _model_has_column(target_model, "slug"):
            continue

        values = sorted({
            str(item.get(field_name)).strip()
            for item in items
            if item.get(field_name) is not None and str(item.get(field_name)).strip() != ""
        })
        if not values:
            continue

        query_rows = (
            session.query(target_model.id, target_model.slug)
            .filter(target_model.id.in_(values))
            .all()
        )
        field_lookup = {
            str(entity_id): _to_slug_token(slug if slug is not None else entity_id)
            for entity_id, slug in query_rows
        }
        if field_lookup:
            lookups[field_name] = field_lookup

    return lookups


def _inject_reference_slug_aliases(items: List[Dict[str, Any]], lookups: Dict[str, Dict[str, str]]) -> set:
    inserted_aliases: set = set()
    for item in items:
        for field_name, lookup in lookups.items():
            raw_value = item.get(field_name)
            if raw_value is None:
                continue
            raw_key = str(raw_value).strip()
            if not raw_key:
                continue
            resolved_slug = lookup.get(raw_key)
            if not resolved_slug:
                continue
            alias = f"{field_name[:-3]}_slug"
            if alias not in item or str(item.get(alias) or "").strip() == "":
                item[alias] = resolved_slug
                inserted_aliases.add(alias)
    return inserted_aliases


def _strip_transient_alias_fields(items: List[Dict[str, Any]], alias_fields: set) -> None:
    if not alias_fields:
        return
    for item in items:
        for key in alias_fields:
            item.pop(key, None)


def _value_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    return True


def _pick_row_key_parts(table_name: str, item: Dict[str, Any], has_slug_column: bool) -> List[Any]:
    if has_slug_column:
        return [_resolve_row_key_source(item)]

    template = ROW_KEY_TABLE_TEMPLATES.get(table_name)
    if template:
        parts = [item.get(field_name) for field_name in template if _value_present(item.get(field_name))]
        if parts:
            return parts

    for key in ("slug", "slugName", "name", "title"):
        if _value_present(item.get(key)):
            return [item.get(key)]

    slug_fields = sorted([
        key for key, value in item.items()
        if key.endswith("_slug") and _value_present(value)
    ])
    if slug_fields:
        return [item[key] for key in slug_fields]

    scalar_fields = sorted([
        key for key, value in item.items()
        if key != "id"
        and not key.endswith("_id")
        and _value_present(value)
        and not isinstance(value, (dict, list))
    ])
    if scalar_fields:
        return [item[key] for key in scalar_fields]

    id_fields = sorted([
        key for key, value in item.items()
        if key.endswith("_id") and _value_present(value)
    ])
    if id_fields:
        return [item[key] for key in id_fields]

    return [_resolve_row_key_source(item)]


def _compose_row_key(parts: List[Any]) -> str:
    tokens = [_to_slug_token(part) for part in parts if _value_present(part)]
    if not tokens:
        return ROW_KEY_FALLBACK
    if len(tokens) == 1:
        return tokens[0]
    return "__".join(tokens)


def _make_unique_row_key(base_key: str, used: set) -> str:
    candidate = base_key
    suffix = 2
    while candidate in used:
        candidate = f"{base_key}_{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


def _assign_row_keys(table_name: str, items: List[Dict[str, Any]], sync_slug: bool) -> None:
    """Row key rules for UE DataTables:
    - derive from slug/slugName/name/title/id (in that priority)
    - trim + deterministic slug normalization
    - enforce uniqueness with _2, _3, ... suffixes
    """
    used: set = set()
    for item in items:
        key_parts = _pick_row_key_parts(table_name, item, has_slug_column=sync_slug)
        base_key = _compose_row_key(key_parts)
        row_key = _make_unique_row_key(base_key, used)
        item[UE_ROW_KEY_HEADER] = row_key
        if sync_slug:
            item["slug"] = row_key


def _coerce_enum_token(enum_class: Any, raw_value: Any) -> Optional[str]:
    def _member_token(member: enum.Enum) -> str:
        return member.name.rstrip("_")

    if raw_value is None:
        return None
    if isinstance(raw_value, enum.Enum):
        return _member_token(raw_value)
    if isinstance(raw_value, str):
        token = raw_value.strip()
        if token == "":
            return None
        try:
            return _member_token(enum_class(token))
        except Exception:
            for member in enum_class:
                if member.name.lower() == token.lower() or str(member.value).lower() == token.lower():
                    return _member_token(member)
    return None


def _normalize_enum_columns(model_class: Any, items: List[Dict[str, Any]]) -> None:
    try:
        enum_columns = [
            (column.name, column.type.enum_class)
            for column in model_class.__table__.columns
            if isinstance(column.type, SAEnum) and getattr(column.type, "enum_class", None) is not None
        ]
    except Exception:
        enum_columns = []

    for item in items:
        for column_name, enum_class in enum_columns:
            if column_name not in item:
                continue
            token = _coerce_enum_token(enum_class, item.get(column_name))
            if token is not None:
                item[column_name] = token


def _serialize_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return str(value)
    return value


def build_csv_rows(table_name: str, model_class: Any, rows: Iterable[Any]) -> Tuple[List[str], List[List[Any]]]:
    rows_list = list(rows)
    items = serialize_items_for_table(table_name, model_class, rows_list)
    items = [dict(item) for item in items]
    ref_slug_lookups = _build_reference_slug_lookups(model_class, rows_list, items)
    transient_aliases = _inject_reference_slug_aliases(items, ref_slug_lookups)
    _normalize_enum_columns(model_class, items)
    _assign_row_keys(table_name, items, sync_slug=_model_has_column(model_class, "slug"))
    _strip_transient_alias_fields(items, transient_aliases)
    columns = resolve_columns(table_name, model_class, items)
    data_rows: List[List[Any]] = []
    for item in items:
        data_rows.append([_serialize_cell(item.get(col)) for col in columns])
    return columns, data_rows


def write_csv_string(columns: List[str], data_rows: List[List[Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    writer.writerows(data_rows)
    output.seek(0)
    return output.read()


def _parse_json_value(raw: str) -> Optional[Any]:
    try:
        return json.loads(raw)
    except Exception:
        return None


def _coerce_primitive(raw: str) -> Any:
    lower = raw.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if lower in ("null", "none", "__null__"):
        return None
    return raw


def coerce_row_from_schema(table_name: str, row: Dict[str, str]) -> Dict[str, Any]:
    schema = load_schema(table_name) or {}
    properties = schema.get("properties", {}) if isinstance(schema.get("properties"), dict) else {}
    coerced: Dict[str, Any] = {}
    for key, raw_value in row.items():
        if key is None:
            continue
        value = raw_value if raw_value is not None else ""
        value = value.strip()
        if value == "":
            coerced[key] = None
            continue
        field_schema = properties.get(key) if isinstance(properties, dict) else None
        if isinstance(field_schema, dict):
            field_type = field_schema.get("type")
            if field_type == "array":
                parsed = _parse_json_value(value)
                if isinstance(parsed, list):
                    coerced[key] = parsed
                else:
                    coerced[key] = [v.strip() for v in value.split(",") if v.strip()]
                continue
            if field_type == "object":
                parsed = _parse_json_value(value)
                coerced[key] = parsed if parsed is not None else _coerce_primitive(value)
                continue
            if field_type == "integer":
                try:
                    coerced[key] = int(value)
                except Exception:
                    coerced[key] = _coerce_primitive(value)
                continue
            if field_type == "number":
                try:
                    coerced[key] = float(value)
                except Exception:
                    coerced[key] = _coerce_primitive(value)
                continue
            if field_type == "boolean":
                coerced[key] = _coerce_primitive(value)
                continue
        parsed = _parse_json_value(value)
        if isinstance(parsed, (list, dict)):
            coerced[key] = parsed
        else:
            coerced[key] = _coerce_primitive(value)
    return coerced
