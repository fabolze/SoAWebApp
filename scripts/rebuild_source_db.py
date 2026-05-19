"""Rebuild the active SQLite database from source CSV files.

This script uses the Flask import routes in-process so rebuild validation stays
identical to the application import path.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app
from backend.app.services.recovery import rebuild_database_from_source, print_recovery_report


def rebuild(source_dir: Path) -> None:
    if not source_dir.exists():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    if not any(source_dir.glob("*.csv")):
        raise FileNotFoundError(f"No CSV files found in: {source_dir}")

    app = create_app(startup_recovery=False)
    report = rebuild_database_from_source(app, source_dir)
    print_recovery_report("Source DB rebuild", report)
    if report.get("status") in ("error", "warning"):
        raise RuntimeError(report.get("message", "Database rebuild failed."))


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
