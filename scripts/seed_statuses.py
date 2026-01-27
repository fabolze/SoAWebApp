import argparse
import csv
import json
import sys
import urllib.error
import urllib.request


def parse_bool(value: str) -> bool:
    if value is None:
        return False
    normalized = value.strip().lower()
    if normalized in ("true", "1", "yes", "y"):
        return True
    if normalized in ("false", "0", "no", "n", ""):
        return False
    return False


def parse_float(value: str):
    if value is None or value.strip() == "":
        return None
    return float(value)


def parse_int(value: str):
    if value is None or value.strip() == "":
        return None
    return int(value)


def parse_tags(value: str):
    if value is None or value.strip() == "":
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


def build_payload(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "category": row.get("category") or None,
        "description": row.get("description") or None,
        "default_duration": parse_float(row.get("default_duration")),
        "stackable": parse_bool(row.get("stackable")),
        "max_stacks": parse_int(row.get("max_stacks")),
        "icon_path": row.get("icon_path") or None,
        "tags": parse_tags(row.get("tags")),
    }


def post_status(api_url: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        return response.read().decode("utf-8")


def seed_statuses(csv_path: str, api_url: str) -> int:
    failures = 0
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            payload = build_payload(row)
            try:
                post_status(api_url, payload)
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8") if exc.fp else ""
                print(f"Failed to seed {payload.get('slug')}: {exc.code} {body}", file=sys.stderr)
                failures += 1
            except urllib.error.URLError as exc:
                print(f"Failed to seed {payload.get('slug')}: {exc.reason}", file=sys.stderr)
                failures += 1
    return failures


def main():
    parser = argparse.ArgumentParser(description="Seed statuses via the backend API.")
    parser.add_argument(
        "--csv",
        default="backend/data/statuses_seed.csv",
        help="Path to statuses_seed.csv",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:5000/api/statuses",
        help="Statuses API endpoint",
    )
    args = parser.parse_args()

    failures = seed_statuses(args.csv, args.api_url)
    if failures:
        raise SystemExit(f"{failures} statuses failed to seed.")


if __name__ == "__main__":
    main()
