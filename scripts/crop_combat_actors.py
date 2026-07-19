from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "soa-editor" / "public" / "playtest"
SOURCE = ASSET_DIR / "combat-actors.png"
TILES = {
    "combat-player.png": (0, 0, 627, 627),
    "combat-nessa.png": (627, 0, 1254, 627),
    "combat-boar.png": (0, 627, 627, 1254),
    "combat-warden.png": (627, 627, 1254, 1254),
}


def main() -> None:
    atlas = Image.open(SOURCE).convert("RGBA")
    for filename, bounds in TILES.items():
        tile = atlas.crop(bounds)
        content_bounds = tile.getbbox()
        if content_bounds:
            tile = tile.crop(content_bounds)
        side = max(tile.size) + 24
        output = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        output.paste(tile, ((side - tile.width) // 2, (side - tile.height) // 2), tile)
        output.save(ASSET_DIR / filename, optimize=True)


if __name__ == "__main__":
    main()
