# Tiny Swords — mobile vertical slice

A playable combat slice built on the Tiny Swords (Free Pack) art, in vanilla
ES modules on a 2D canvas. No engine, no build step, no dependencies at
runtime — the point is to prove out game *feel* on the real assets before
committing to a stack.

## Run it

```bash
python3 -m http.server 8123      # any static server, from the repo root
# open http://localhost:8123
```

**Controls** — WASD/arrows move, `J`/`Space` attack, `K`/`Shift` guard, `R`
restart. On a touch device: drag anywhere on the left half for a floating
stick, `ATK`/`DEF` buttons bottom-right.

## What's in the slice

- Autotiled grass island on animated shoreline foam, swaying trees and bushes,
  drifting cloud haze, bobbing water rocks
- Player warrior with a two-hit combo (chain window), guard/block, and lunge
- Two enemy archetypes: melee warriors, and archers that fire a real arrow
  entity you can walk out of
- Telegraphed enemy windups (red flash) so fights are readable
- Four waves, wave-clear/defeat banners, restart

### The feel layer

This is where a mobile action game is won or lost, so it's the part that got
the attention:

| Effect | Where |
|---|---|
| Hit-stop (75ms / 130ms on kill) | `core/fx.js` — freezes the whole sim; render keeps running |
| Trauma-based screen shake | squared falloff, hard px cap so it never nauseates |
| Squash & stretch | anticipation on attack, impact squash on hit |
| Knockback + stagger lockout | `game/unit.js` |
| White hit-flash | pre-rendered silhouette cache in `core/sprite.js` |
| Arcing damage numbers | jittered origin so simultaneous hits stay readable |
| Camera lead + smoothing | pushes ahead of movement, frame-rate independent |
| Run dust, whiff puffs, kill burst | the pack's own Particle FX |

**On death:** the free pack ships **no death, hurt or hit-react frames for any
unit**. Rather than fake sprite frames, the whole reaction is synthesised —
white flash, knockback, stagger, then a fall-over/fade tween with a dust puff.
At the right timings this reads better than a mediocre 4-frame death sheet.

## Asset pipeline

```bash
pip install Pillow
python3 tools/build_manifest.py   # -> assets/manifest.json
python3 tools/test_detect.py      # regression test for frame detection
```

`assets/` is the pack, normalised to web-safe kebab-case paths with the macOS
junk stripped. `build_manifest.py` derives **frame size, frame count and
anchors from the pixels** — nothing downstream carries a hardcoded offset.

## What we learned about the pack

Findings worth keeping, because several of them are traps:

**Sheets are not uniformly square.** Characters and FX are square-celled
(`cell = height`), but props are not: `tree1.png` is 1536×256 holding eight
**192×256** frames. Slicing by height cuts every tree in half. The detector
therefore uses two signals — square-cell as the default, overridden only when
padding analysis proves *more* frames. `tools/test_detect.py` pins this against
37 hand-counted sheets.

**Several "props" are animations.** Trees (8f), bushes (8f), water rocks (16f)
and the rubber duck (3f) all sway or bob. Static props are only the clouds,
rocks and stumps.

**The tilemap is a 4-bit edge autotile**, keyed on which neighbours are
*empty*, with a "both sides open" case per axis:

```
col: L&R -> 3 | L -> 0 | R -> 2 | neither -> 1
row: U&D -> 3 | U -> 0 | D -> 2 | neither -> 1
```

`r1c1` is the only seamless fill tile and `r3c3` is a lone 1×1 island. The
inner 2×2 is *not* fill variants — assuming that produced a maze of seams.

**Foam is a per-tile sprite**, a 64px rounded square centred in a 192 cell.
Placed 1:1 its rounded corners leave gaps and the shoreline reads as a quilt;
drawn at 1.3× the neighbours union into one continuous band.

**UI assets are slice-kits on a 64px grid** with spacer cells:
`bigbar-base` is 3-slice at x0/x128/x256, `banner.png` is 9-slice at 0/192/320
on both axes. `smallbar-fill`'s artwork is only rows 30–33 of its cell.

**The Lancer is rigged differently from everyone else.** It's 8-directional on
a 320px cell with a full defence-stance set; Warrior, Archer, Monk and Pawn are
side-facing only on 192px cells. You cannot build 8-way movement as the
standard — the Warrior physically can't face up or down. This slice uses the
side-on standard; if you add the Lancer, use only its `right` / `upright` /
`downright` sheets and mirror them.

**The Pawn has no attack** — its `interact-*` sheets are work animations. It's
a worker, not a fighter.

## Layout

```
index.html            boot + loading screen
src/config.js         all tuning (feel, combat, waves) in one place
src/core/             loader, sprite/animator, fx, camera, input, rng
src/game/             world, unit, ai, projectile, hud
tools/                manifest builder + its regression test
assets/               normalised pack + generated manifest.json
```

`src/config.js` is the knob board — hit-stop, shake, knockback, reach, wave
composition. Tuning feel shouldn't require touching engine code.

## Not done yet

- No audio (the pack ships none — needs sourcing)
- One arena; no level progression or meta
- Enemy variety is palette-swapped warriors/archers, so silhouettes repeat.
  This is the strongest argument for buying the paid enemy pack — on a phone,
  recoloured humans read as the same unit mid-fight. Worth revisiting once the
  loop is proven.
- Waves spawn on a ring; no proper spawn director
