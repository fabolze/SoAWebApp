from typing import Optional


def generate_ulid() -> str:
    """Generate a ULID string suitable for use as a model default.

    Uses the `ulid-py` package (import name: `ulid`). If unavailable at runtime,
    falls back to a UUID4 hex string so the app can still operate.
    """
    try:
        import ulid  # type: ignore

        # ulid.new() returns a ULID object; str() yields the canonical 26-char string
        return str(ulid.new())
    except Exception:
        from uuid import uuid4

        # Fallback ensures a unique string albeit not lexicographically sortable
        return uuid4().hex

