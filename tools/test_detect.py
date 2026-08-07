#!/usr/bin/env python3
"""
Regression tests for build_manifest.py.

1. Frame detection — every expectation was established by rendering the sheet
   and counting frames by eye.
2. Playback metadata in the generated manifest. A mis-keyed fps/loop lookup
   once made attacks loop, which froze units mid-swing forever: they never left
   their attack state, so they could not move or act. Screenshots cannot catch
   that (a stuck swing looks like a swing), so assert it here.

Run from the repo root:  python3 tools/test_detect.py
"""
import sys
sys.path.insert(0, "tools")
from PIL import Image
src = open("tools/build_manifest.py").read()
head = src.split("# ------------------------------------------------------------------ units ---")[0]
ns = {"__file__": "tools/build_manifest.py", "__name__": "bm"}
exec(compile(head, "bm", "exec"), ns)
detect = ns["detect_frames"]

EXPECT = {
 "assets/units/blue/warrior/warrior-idle.png":8,
 "assets/units/blue/warrior/warrior-attack1.png":4,
 "assets/units/blue/warrior/warrior-guard.png":6,
 "assets/units/blue/archer/archer-shoot.png":8,
 "assets/units/blue/archer/archer-run.png":4,
 "assets/units/blue/archer/arrow.png":1,
 "assets/units/blue/lancer/lancer-idle.png":12,
 "assets/units/blue/lancer/lancer-right-attack.png":3,
 "assets/units/blue/monk/heal.png":11,
 "assets/units/blue/pawn/pawn-run.png":6,
 "assets/units/blue/pawn/pawn-interact-hammer.png":3,
 "assets/fx/dust-01.png":8, "assets/fx/dust-02.png":10,
 "assets/fx/explosion-01.png":8, "assets/fx/explosion-02.png":10,
 "assets/fx/fire-01.png":8, "assets/fx/fire-03.png":12,
 "assets/fx/water-splash.png":9,
 "assets/terrain/tileset/water-foam.png":16,
 "assets/terrain/tileset/shadow.png":1,
 "assets/terrain/tileset/water-background-color.png":1,
 "assets/terrain/resources/wood/trees/tree1.png":8,
 "assets/terrain/resources/wood/trees/tree2.png":8,
 "assets/terrain/resources/wood/trees/tree3.png":8,
 "assets/terrain/resources/wood/trees/tree4.png":8,
 "assets/terrain/resources/wood/trees/stump-1.png":1,
 "assets/terrain/decorations/bushes/bushe1.png":8,
 "assets/terrain/decorations/bushes/bushe3.png":8,
 "assets/terrain/decorations/rocks/rock1.png":1,
 "assets/terrain/decorations/rocks-in-the-water/water-rocks-01.png":16,
 "assets/terrain/decorations/rocks-in-the-water/water-rocks-04.png":16,
 "assets/terrain/decorations/rubber-duck/rubber-duck.png":3,
 "assets/terrain/decorations/clouds/clouds-01.png":1,
 "assets/terrain/decorations/clouds/clouds-04.png":1,
 "assets/terrain/decorations/clouds/clouds-05.png":1,
 "assets/terrain/decorations/clouds/clouds-08.png":1,
 "assets/terrain/resources/meat/sheep/sheep-idle.png":6,

}
bad = 0
for p, exp in EXPECT.items():
    im = Image.open(p).convert("RGBA")
    cw, n = detect(im)
    ok = n == exp
    bad += 0 if ok else 1
    print(f"{'ok  ' if ok else 'FAIL'} {n:>3} (want {exp:>3})  cell {cw}x{im.size[1]:<4}  {p.split('/')[-1]}")
print(f"\n{len(EXPECT)-bad}/{len(EXPECT)} frame counts correct")

# --- playback metadata ------------------------------------------------------
import json

MANIFEST = "assets/manifest.json"
try:
    man = json.load(open(MANIFEST))
except FileNotFoundError:
    print(f"SKIP playback checks — run tools/build_manifest.py first")
    sys.exit(1 if bad else 0)

# One-shot clips MUST NOT loop, or the unit state machine never advances.
ONE_SHOT = {"attack1", "attack2", "shoot", "heal", "heal-effect"}
LOOPING = {"idle", "run", "guard"}

print()
pbad = 0
for uname, u in man["units"].items():
    for cname, clip in u["anims"].items():
        base = cname.split("-")[0] if cname.startswith(("up", "down", "right")) else cname
        want_loop = None
        if cname in ONE_SHOT or cname.endswith("-attack"):
            want_loop = False
        elif cname in LOOPING:
            want_loop = True
        if want_loop is None:
            continue
        ok = clip["loop"] == want_loop
        pbad += 0 if ok else 1
        if not ok:
            print(f"FAIL {uname}.{cname}: loop={clip['loop']}, want {want_loop}")
        if clip["frames"] < 1:
            print(f"FAIL {uname}.{cname}: frames={clip['frames']}")
            pbad += 1
        if not (1 <= clip["fps"] <= 60):
            print(f"FAIL {uname}.{cname}: fps={clip['fps']} out of range")
            pbad += 1

# Anchors must exist, or sprites render from the cell corner.
for uname, u in man["units"].items():
    if not u.get("anchor"):
        print(f"FAIL {uname}: missing foot anchor")
        pbad += 1

# Paths must stay relative so the game works under a subdirectory (Pages).
raw = open(MANIFEST).read()
if '"/assets/' in raw:
    print("FAIL manifest contains absolute /assets/ paths")
    pbad += 1

print(f"playback metadata: {'ok' if pbad == 0 else str(pbad) + ' problems'}")
sys.exit(1 if (bad or pbad) else 0)
import sys
sys.path.insert(0, "tools")
from PIL import Image
src = open("tools/build_manifest.py").read()
head = src.split("# ------------------------------------------------------------------ units ---")[0]
ns = {"__file__": "tools/build_manifest.py", "__name__": "bm"}
exec(compile(head, "bm", "exec"), ns)
detect = ns["detect_frames"]

EXPECT = {
 "assets/units/blue/warrior/warrior-idle.png":8,
 "assets/units/blue/warrior/warrior-attack1.png":4,
 "assets/units/blue/warrior/warrior-guard.png":6,
 "assets/units/blue/archer/archer-shoot.png":8,
 "assets/units/blue/archer/archer-run.png":4,
 "assets/units/blue/archer/arrow.png":1,
 "assets/units/blue/lancer/lancer-idle.png":12,
 "assets/units/blue/lancer/lancer-right-attack.png":3,
 "assets/units/blue/monk/heal.png":11,
 "assets/units/blue/pawn/pawn-run.png":6,
 "assets/units/blue/pawn/pawn-interact-hammer.png":3,
 "assets/fx/dust-01.png":8, "assets/fx/dust-02.png":10,
 "assets/fx/explosion-01.png":8, "assets/fx/explosion-02.png":10,
 "assets/fx/fire-01.png":8, "assets/fx/fire-03.png":12,
 "assets/fx/water-splash.png":9,
 "assets/terrain/tileset/water-foam.png":16,
 "assets/terrain/tileset/shadow.png":1,
 "assets/terrain/tileset/water-background-color.png":1,
 "assets/terrain/resources/wood/trees/tree1.png":8,
 "assets/terrain/resources/wood/trees/tree2.png":8,
 "assets/terrain/resources/wood/trees/tree3.png":8,
 "assets/terrain/resources/wood/trees/tree4.png":8,
 "assets/terrain/resources/wood/trees/stump-1.png":1,
 "assets/terrain/decorations/bushes/bushe1.png":8,
 "assets/terrain/decorations/bushes/bushe3.png":8,
 "assets/terrain/decorations/rocks/rock1.png":1,
 "assets/terrain/decorations/rocks-in-the-water/water-rocks-01.png":16,
 "assets/terrain/decorations/rocks-in-the-water/water-rocks-04.png":16,
 "assets/terrain/decorations/rubber-duck/rubber-duck.png":3,
 "assets/terrain/decorations/clouds/clouds-01.png":1,
 "assets/terrain/decorations/clouds/clouds-04.png":1,
 "assets/terrain/decorations/clouds/clouds-05.png":1,
 "assets/terrain/decorations/clouds/clouds-08.png":1,
 "assets/terrain/resources/meat/sheep/sheep-idle.png":6,

}
bad = 0
for p, exp in EXPECT.items():
    im = Image.open(p).convert("RGBA")
    cw, n = detect(im)
    ok = n == exp
    bad += 0 if ok else 1
    print(f"{'ok  ' if ok else 'FAIL'} {n:>3} (want {exp:>3})  cell {cw}x{im.size[1]:<4}  {p.split('/')[-1]}")
print(f"\n{len(EXPECT)-bad}/{len(EXPECT)} frame counts correct")

# --- playback metadata ------------------------------------------------------
import json

MANIFEST = "assets/manifest.json"
try:
    man = json.load(open(MANIFEST))
except FileNotFoundError:
    print(f"SKIP playback checks — run tools/build_manifest.py first")
    sys.exit(1 if bad else 0)

# One-shot clips MUST NOT loop, or the unit state machine never advances.
ONE_SHOT = {"attack1", "attack2", "shoot", "heal", "heal-effect"}
LOOPING = {"idle", "run", "guard"}

print()
pbad = 0
for uname, u in man["units"].items():
    for cname, clip in u["anims"].items():
        base = cname.split("-")[0] if cname.startswith(("up", "down", "right")) else cname
        want_loop = None
        if cname in ONE_SHOT or cname.endswith("-attack"):
            want_loop = False
        elif cname in LOOPING:
            want_loop = True
        if want_loop is None:
            continue
        ok = clip["loop"] == want_loop
        pbad += 0 if ok else 1
        if not ok:
            print(f"FAIL {uname}.{cname}: loop={clip['loop']}, want {want_loop}")
        if clip["frames"] < 1:
            print(f"FAIL {uname}.{cname}: frames={clip['frames']}")
            pbad += 1
        if not (1 <= clip["fps"] <= 60):
            print(f"FAIL {uname}.{cname}: fps={clip['fps']} out of range")
            pbad += 1

# Anchors must exist, or sprites render from the cell corner.
for uname, u in man["units"].items():
    if not u.get("anchor"):
        print(f"FAIL {uname}: missing foot anchor")
        pbad += 1

# Paths must stay relative so the game works under a subdirectory (Pages).
raw = open(MANIFEST).read()
if '"/assets/' in raw:
    print("FAIL manifest contains absolute /assets/ paths")
    pbad += 1

print(f"playback metadata: {'ok' if pbad == 0 else str(pbad) + ' problems'}")
sys.exit(1 if (bad or pbad) else 0)
