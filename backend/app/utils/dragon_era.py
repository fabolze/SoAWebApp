import re
from typing import Any, Optional


_DRAGON_ERA_RE = re.compile(r"^\s*([+-]?)\s*([0-9][0-9.\s_]*)\s*([ab])\s*\.?\s*d\s*\.?\s*$", re.IGNORECASE)
_PLAIN_YEAR_RE = re.compile(r"^\s*([+-]?)\s*([0-9][0-9.\s_]*)\s*$")


def parse_dragon_era_year(value: Any) -> Optional[int]:
    """Parse a Dragon-era year into the stored integer offset.

    Negative integers are before Dragons. Zero and positive integers are after
    Dragons. Formatted inputs may include dot thousands separators and b.D./a.D.
    suffixes.
    """
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("Dragon-era year must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not value.is_integer():
            raise ValueError("Dragon-era year must be an integer")
        return int(value)
    if not isinstance(value, str):
        raise ValueError("Dragon-era year must be an integer")

    raw = value.strip()
    match = _DRAGON_ERA_RE.match(raw)
    era = None
    if not match:
        match = _PLAIN_YEAR_RE.match(raw)
    else:
        era = match.group(3).lower()

    if not match:
        raise ValueError("Dragon-era year must be an integer")

    sign = match.group(1)
    digits = re.sub(r"[.\s_]", "", match.group(2))
    if not digits.isdigit():
        raise ValueError("Dragon-era year must be an integer")

    year = int(digits)
    if era == "b":
        return -year
    if era == "a":
        if sign == "-":
            raise ValueError("a.D. years cannot be negative")
        return year
    return -year if sign == "-" else year
