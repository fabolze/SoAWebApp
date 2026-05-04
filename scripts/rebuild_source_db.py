"""Rebuild the active SQLite database from source CSV files.

This script uses the Flask import routes in-process so rebuild validation stays
identical to the application import path.
"""

from __future__ import annotations

import argparse
import sys
from io import BytesIO
from pathlib import Path
from typing import Iterable

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app


DEFAULT_IMPORT_ORDER = [
    "content_packs",
    "stats",
    "attributes",
    "statuses",
    "currencies",
    "factions",
    "flags",
    "requirements",
    "effects",
    "abilities",
    "attribute_stat_links",
    "ability_effect_links",
    "ability_scaling_links",
    "characterclasses",
    "locations",
    "location_routes",
    "characters",
    "combat_profiles",
    "interaction_profiles",
    "shops",
    "shops_inventory",
    "timelines",
    "story_arcs",
    "lore_entries",
    "quests",
    "dialogues",
    "dialogue_nodes",
    "encounters",
    "events",
    "talent_trees",
    "talent_nodes",
    "talent_node_links",
    "items",
    "item_stat_modifiers",
    "item_attribute_modifiers",
]


def _csv_paths(source_dir: Path) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for path in source_dir.glob("*.csv"):
        table_name = path.stem.removesuffix("_seed").removesuffix(".source")
        paths[table_name] = path
    return paths


def _ordered_tables(existing_tables: Iterable[str]) -> list[str]:
    existing = set(existing_tables)
    ordered = [table for table in DEFAULT_IMPORT_ORDER if table in existing]
    ordered.extend(sorted(existing - set(ordered)))
    return ordered


def rebuild(source_dir: Path) -> None:
    if not source_dir.exists():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    paths = _csv_paths(source_dir)
    if not paths:
        raise FileNotFoundError(f"No CSV files found in: {source_dir}")

    app = create_app()
    client = app.test_client()

    reset = client.post("/api/db/reset")
    if reset.status_code >= 400:
        raise RuntimeError(f"Database reset failed: {reset.get_data(as_text=True)}")

    for table_name in _ordered_tables(paths):
        path = paths[table_name]
        with path.open("rb") as handle:
            response = client.post(
                f"/api/source/import/csv/{table_name}",
                data={"file": (BytesIO(handle.read()), path.name)},
                content_type="multipart/form-data",
            )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Import failed for {table_name} from {path}: {response.get_data(as_text=True)}"
            )
        payload = response.get_json() or {}
        print(
            f"{table_name}: imported={payload.get('imported', 0)} "
            f"deleted={payload.get('deleted', 0)}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild SQLite from source CSV files.")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("backend/data"),
        help="Directory containing source CSV files. Defaults to backend/data.",
    )
    args = parser.parse_args()
    rebuild(args.source_dir)


if __name__ == "__main__":
    main()
