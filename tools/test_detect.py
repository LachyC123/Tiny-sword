#!/usr/bin/env python3
"""
Regression test for the frame detector in build_manifest.py.

Every expectation below was established by rendering the sheet and counting
frames by eye. Run from the repo root:  python3 tools/test_detect.py
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
print(f"\n{len(EXPECT)-bad}/{len(EXPECT)} correct")
sys.exit(1 if bad else 0)
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
print(f"\n{len(EXPECT)-bad}/{len(EXPECT)} correct")
sys.exit(1 if bad else 0)
