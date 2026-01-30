import csv
import enum
import io
import json
import os
from typing import Any, Dict, Iterable, List, Optional, Tuple

from backend.app.routes.base_route import ROUTE_REGISTRY


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
    head = [c for c in ["id", "slug"] if c in columns]
    tail = [c for c in columns if c not in head]
    return head + tail


def resolve_columns(table_name: str, items: List[Dict[str, Any]]) -> List[str]:
    columns = load_schema_columns(table_name)
    if not columns:
        columns = []
    for item in items:
        for key in item.keys():
            if key not in columns:
                columns.append(key)
    return _order_columns(columns)


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
