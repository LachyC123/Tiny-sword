#!/usr/bin/env python3
"""
Builds assets/manifest.json.

Frame size, frame count and sprite anchors are all DERIVED from the pixels
rather than assumed, so nothing downstream carries a hardcoded magic offset.
See `detect_frames` for how frame size is worked out and why it needs two
signals rather than one.

Anchors matter as much as frame counts: characters are anchored at their feet,
FX at the cell centre, props at the bottom-centre of their artwork. Emitting
them here means the renderer never has to scan pixels at runtime.

Requires Pillow:  pip install Pillow
Regression test:  python3 tools/test_detect.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# --------------------------------------------------------------- playback ---
UNIT_FPS = {
    "idle": (8, True), "run": (12, True), "guard": (10, True),
    "attack1": (14, False), "attack2": (14, False), "shoot": (14, False),
    "heal": (12, False), "heal-effect": (12, False),
}
FX_FPS = {
    "dust-01": (16, False), "dust-02": (16, False),
    "explosion-01": (16, False), "explosion-02": (16, False),
    "fire-01": (12, True), "fire-02": (12, True), "fire-03": (12, True),
    "water-splash": (14, False),
}
PROP_FPS = {
    "tree1": (8, True), "tree2": (8, True), "tree3": (8, True), "tree4": (8, True),
    "bushe1": (7, True), "bushe2": (7, True), "bushe3": (7, True), "bushe4": (7, True),
    "water-rocks-01": (10, True), "water-rocks-02": (10, True),
    "water-rocks-03": (10, True), "water-rocks-04": (10, True),
    "rubber-duck": (6, True),
}
DEFAULT = (12, True)

warnings: list[str] = []


def rel(p: Path) -> str:
    """
    Repo-root-relative, with no leading slash — the runtime resolves these
    against its own base URL. An absolute "/assets/..." would break anywhere the
    game isn't served from the domain root, GitHub Pages included.
    """
    return str(p.relative_to(ROOT)).replace(os.sep, "/")


def divisors(n: int) -> list[int]:
    return [d for d in range(1, n + 1) if n % d == 0]


def alpha_cols(img: Image.Image) -> list[int]:
    """Opaque pixel count per column."""
    a = img.getchannel("A")
    w, h = img.size
    px = a.load()
    return [sum(1 for y in range(h) if px[x, y] > 8) for x in range(w)]


def detect_frames(img: Image.Image) -> tuple[int, int]:
    """
    Returns (cell_w, frames).

    Two signals, because neither alone is sufficient:

    1. Square cells are the convention for characters and FX (a 1536x192 sheet
       is 8 frames of 192). This is the default whenever height divides width.
    2. Padding analysis: correctly sliced sprites leave transparent columns at
       both cell edges. This catches the props that break rule 1 — tree1.png is
       1536x256 but holds eight *192x256* frames, and slicing it by height cuts
       every tree in half.

    Rule 2 alone is not enough either: dust, fire and water-rock strips run
    their artwork right up to the cell edge and would be rejected outright. So
    the square-cell answer wins unless padding analysis finds a slicing with
    strictly MORE frames, which only happens when rule 1 is genuinely wrong.
    """
    w, h = img.size
    cols = alpha_cols(img)
    if sum(cols) == 0:
        return w, 1

    def padded(cw: int) -> bool:
        """Every cell non-empty, with transparent columns at both edges."""
        n = w // cw
        for i in range(n):
            seg = cols[i * cw:(i + 1) * cw]
            if sum(seg) == 0 or seg[0] > 1 or seg[-1] > 1:
                return False
        return True

    if w % h == 0 and h >= 8:
        n_base = w // h
        if padded(h):
            return h, n_base
        for cw in divisors(w):
            if cw < 16 or w // cw <= n_base:
                continue
            if padded(cw):
                return cw, w // cw
        return h, n_base

    # Non-square sheet (props): most frames that still leaves padding, else one.
    for cw in divisors(w):
        if cw < 16 or w // cw < 2:
            continue
        if padded(cw):
            return cw, w // cw
    return w, 1


def content_bbox(img: Image.Image, cw: int, ch: int, frame: int = 0):
    cell = img.crop((frame * cw, 0, (frame + 1) * cw, ch))
    bb = cell.getchannel("A").getbbox()
    if bb is None:
        return {"left": 0, "top": 0, "right": cw, "bottom": ch, "w": cw, "h": ch}
    return {"left": bb[0], "top": bb[1], "right": bb[2], "bottom": bb[3],
            "w": bb[2] - bb[0], "h": bb[3] - bb[1]}


def describe(path: Path, fps_table: dict, *, anchor: str | None = None) -> dict:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    cw, frames = detect_frames(img)
    name = path.stem
    fps, loop = fps_table.get(name, DEFAULT)
    bb = content_bbox(img, cw, h)
    out = {
        "file": rel(path),
        "cellW": cw, "cellH": h,
        "frames": frames,
        "fps": fps, "loop": loop,
        "bbox": bb,
    }
    if anchor == "foot":
        # Props stand on the bottom-centre of their artwork.
        out["anchor"] = {"x": (bb["left"] + bb["right"]) / 2, "y": bb["bottom"]}
    elif anchor == "centre":
        out["anchor"] = {"x": cw / 2, "y": h / 2}
    elif anchor == "content-centre":
        # Drop shadows key off the middle of their artwork, not the cell.
        out["anchor"] = {"x": (bb["left"] + bb["right"]) / 2,
                         "y": (bb["top"] + bb["bottom"]) / 2}
    return out


def pngs(d: Path) -> list[Path]:
    return sorted(p for p in d.glob("*.png")) if d.is_dir() else []


# ------------------------------------------------------------------ units ---
UNIT_DIR = ASSETS / "units"
palettes = sorted(p.name for p in UNIT_DIR.iterdir() if p.is_dir() and p.name != "source")

units: dict = {}
for unit_dir in sorted((UNIT_DIR / "blue").iterdir()):
    if not unit_dir.is_dir():
        continue
    unit = unit_dir.name
    anims, projectile, cell = {}, None, None
    for png in pngs(unit_dir):
        name = png.stem
        if name.startswith(unit + "-"):
            name = name[len(unit) + 1:]
        d = describe(png, UNIT_FPS)
        if name == "arrow":
            d["anchor"] = {"x": d["cellW"] / 2, "y": d["cellH"] / 2}
            projectile = d
            continue
        # Characters are foot-anchored; the anchor is identical across a unit's
        # sheets, so measure it once from the idle pose.
        if name == "idle":
            cell = d["cellW"]
        anims[name] = d
    if cell is None and anims:
        cell = next(iter(anims.values()))["cellW"]

    idle = anims.get("idle")
    foot = None
    if idle:
        foot = {"x": (idle["bbox"]["left"] + idle["bbox"]["right"]) / 2,
                "y": idle["bbox"]["bottom"]}
    for a in anims.values():
        a["anchor"] = foot
        if a["cellW"] != a["cellH"]:
            warnings.append(f"{unit}: non-square unit cell {a['cellW']}x{a['cellH']} ({a['file']})")
    units[unit] = {"cell": cell, "anchor": foot, "anims": anims}
    if projectile:
        units[unit]["projectile"] = projectile

# --------------------------------------------------------------------- fx ---
fx = {p.stem: describe(p, FX_FPS, anchor="centre") for p in pngs(ASSETS / "fx")}

# ---------------------------------------------------------------- terrain ---
TILE = 64
tileset = ASSETS / "terrain" / "tileset"
tm = Image.open(tileset / "tilemap-color1.png")
terrain = {
    "tile": TILE,
    "tilemaps": [rel(p) for p in pngs(tileset) if p.name.startswith("tilemap-")],
    "cols": tm.width // TILE,
    "rows": tm.height // TILE,
    # Established by rendering all 16 tiles of the block individually. Axes are
    # keyed on which neighbours are EMPTY; see World._tileFor.
    "blocks": {
        "grass": {"col": 0, "row": 0, "w": 4, "h": 4},
        "plateau": {"col": 5, "row": 0, "w": 4, "h": 4},
        "cliffFace": {"col": 5, "row": 4, "w": 4, "h": 2},
    },
    "slopes": {"left": {"col": 0, "row": 4}, "right": {"col": 3, "row": 4}},
    "water": rel(tileset / "water-background-color.png"),
    "foam": describe(tileset / "water-foam.png", {"water-foam": (8, True)}, anchor="centre"),
    "shadow": describe(tileset / "shadow.png", {}, anchor="content-centre"),
}

# ------------------------------------------------------------------ props ---
PROP_GROUPS = [
    "decorations/bushes", "decorations/clouds", "decorations/rocks",
    "decorations/rocks-in-the-water", "decorations/rubber-duck",
    "resources/wood/trees", "resources/gold/gold-stones",
]
props: dict = {}
for group in PROP_GROUPS:
    for png in pngs(ASSETS / "terrain" / Path(group)):
        d = describe(png, PROP_FPS, anchor="foot")
        d["animated"] = d["frames"] > 1
        props[png.stem] = d

# --------------------------------------------------------------------- ui ---
ui: dict = {}
for group_dir in sorted((ASSETS / "ui").iterdir()):
    if group_dir.is_dir():
        ui[group_dir.name] = [rel(p) for p in pngs(group_dir)]

avatar = ASSETS / "ui" / "human-avatars" / "avatars-01.png"
av = Image.open(avatar).convert("RGBA")
ui["avatar"] = {"file": rel(avatar), "bbox": content_bbox(av, av.width, av.height)}

# ------------------------------------------------------------------ write ---
manifest = {
    "generated": "tools/build_manifest.py",
    "palettes": palettes,
    "units": units,
    "fx": fx,
    "terrain": terrain,
    "props": props,
    "ui": ui,
}
(ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

print(f"palettes: {', '.join(palettes)}")
for name, u in units.items():
    a = u["anchor"]
    print(f"  {name:<8} cell {u['cell']:>3} anchor ({a['x']:.0f},{a['y']:.0f})  "
          + " ".join(f"{k}:{v['frames']}" for k, v in u["anims"].items()))
print("fx:    " + " ".join(f"{k}:{v['frames']}" for k, v in fx.items()))
print(f"terrain: {terrain['cols']}x{terrain['rows']} @{TILE}px, foam {terrain['foam']['frames']}f")
print("props:")
for k, v in props.items():
    print(f"  {k:<22} {v['cellW']:>4}x{v['cellH']:<4} x{v['frames']:<3} "
          f"anchor ({v['anchor']['x']:.0f},{v['anchor']['y']:.0f})")
if warnings:
    print("\nWARNINGS:")
    for w in warnings:
        print("  ! " + w)
else:
    print("\nno warnings")
