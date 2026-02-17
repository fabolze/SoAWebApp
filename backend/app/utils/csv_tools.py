import csv
import enum
import io
import json
import os
import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.types import Enum as SAEnum

from backend.app.routes.base_route import ROUTE_REGISTRY

UE_ROW_KEY_HEADER = "Name"
ROW_KEY_SOURCE_FIELDS = ("slug", "slugName", "name", "title", "id")
ROW_KEY_FALLBACK = "row"


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


def resolve_columns(table_name: str, items: List[Dict[str, Any]]) -> List[str]:
    columns = load_schema_columns(table_name)
    if not columns:
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


def _make_unique_row_key(base_key: str, used: set) -> str:
    candidate = base_key
    suffix = 2
    while candidate in used:
        candidate = f"{base_key}_{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


def _assign_row_keys(items: List[Dict[str, Any]], sync_slug: bool) -> None:
    """Row key rules for UE DataTables:
    - derive from slug/slugName/name/title/id (in that priority)
    - trim + deterministic slug normalization
    - enforce uniqueness with _2, _3, ... suffixes
    """
    used: set = set()
    for item in items:
        base_key = _to_slug_token(_resolve_row_key_source(item))
        row_key = _make_unique_row_key(base_key, used)
        item[UE_ROW_KEY_HEADER] = row_key
        if sync_slug:
            item["slug"] = row_key


def _coerce_enum_token(enum_class: Any, raw_value: Any) -> Optional[str]:
    if raw_value is None:
        return None
    if isinstance(raw_value, enum.Enum):
        return raw_value.name
    if isinstance(raw_value, str):
        token = raw_value.strip()
        if token == "":
            return None
        try:
            return enum_class(token).name
        except Exception:
            for member in enum_class:
                if member.name.lower() == token.lower() or str(member.value).lower() == token.lower():
                    return member.name
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
    items = serialize_items_for_table(table_name, model_class, rows)
    items = [dict(item) for item in items]
    _normalize_enum_columns(model_class, items)
    _assign_row_keys(items, sync_slug=_model_has_column(model_class, "slug"))
    columns = resolve_columns(table_name, items)
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
