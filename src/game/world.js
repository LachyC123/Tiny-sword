/**
 * The arena: an autotiled grass island ringed with animated foam, sitting on
 * scrolling water, dressed with swaying trees and bushes.
 *
 * Tile selection uses the 16-tile edge autotile block at (col 0, row 0) of
 * tilemap-color1.png. The layout was established by rendering every tile in
 * the block individually rather than assuming a convention — see `_tileFor`.
 */

import { TILE, ISLAND } from '../config.js';
import { Animator, clipFrom } from '../core/sprite.js';
import { mulberry32 } from '../core/rng.js';

export class World {
  constructor(manifest, images, seed = 20260807) {
    this.manifest = manifest;
    this.images = images;
    this.rng = mulberry32(seed);
    this.time = 0;

    this.w = ISLAND.w;
    this.h = ISLAND.h;
    this.solid = new Uint8Array(this.w * this.h);
    this._buildIsland();

    this.tilemap = images[manifest.terrain.tilemaps.find((t) => t.includes('color1'))];
    this.waterImg = images[manifest.terrain.water];
    this.foam = new Animator({ foam: clipFrom(manifest.terrain.foam, images) }, 'foam');
    this.shadowClip = clipFrom(manifest.terrain.shadow, images);

    this.props = [];
    this._placeProps();
    this.clouds = this._makeClouds();
  }

  // ------------------------------------------------------------- shape ----
  at(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.solid[y * this.w + x];
  }

  _buildIsland() {
    // Superellipse island: flat, usable edges with soft corners. n=4 keeps the
    // shoreline's stair-stepping shallow enough that the foam band reads as one
    // continuous ring rather than jogging in and out at the corners.
    const a = this.w / 2;
    const b = this.h / 2;
    const n = 4.0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - a) / (a - 0.6);
        const dy = (y + 0.5 - b) / (b - 0.6);
        const d = Math.pow(Math.abs(dx), n) + Math.pow(Math.abs(dy), n);
        this.solid[y * this.w + x] = d <= 1 ? 1 : 0;
      }
    }
  }

  /**
   * 4-bit edge autotile. Classified by rendering all 16 tiles individually
   * (tools note: see the block layout comment at the top of this file) — the
   * axes are keyed on which neighbours are EMPTY, and each axis has a
   * "both sides open" case for corridors and single tiles:
   *
   *   col: L&R -> 3 | L -> 0 | R -> 2 | neither -> 1
   *   row: U&D -> 3 | U -> 0 | D -> 2 | neither -> 1
   *
   * r1c1 is the only seamless fill tile; r3c3 is a lone 1x1 island.
   */
  _tileFor(x, y) {
    const L = !this.at(x - 1, y);
    const R = !this.at(x + 1, y);
    const U = !this.at(x, y - 1);
    const D = !this.at(x, y + 1);
    const cx = L && R ? 3 : L ? 0 : R ? 2 : 1;
    const cy = U && D ? 3 : U ? 0 : D ? 2 : 1;
    const b = this.manifest.terrain.blocks.grass;
    return { sx: (b.col + cx) * TILE, sy: (b.row + cy) * TILE };
  }

  // --------------------------------------------------------- world geo ----
  get pixelW() { return this.w * TILE; }
  get pixelH() { return this.h * TILE; }

  /** Is this world-space point on walkable land (with an inset margin)? */
  walkable(px, py, margin = 18) {
    for (const [ox, oy] of [[-margin, 0], [margin, 0], [0, -margin * 0.5], [0, margin * 0.5]]) {
      const tx = Math.floor((px + ox) / TILE);
      const ty = Math.floor((py + oy) / TILE);
      if (!this.at(tx, ty)) return false;
    }
    return true;
  }

  /** Nearest walkable point to (px,py) — used to spawn and to unstick. */
  clampToLand(px, py, margin = 18) {
    if (this.walkable(px, py, margin)) return { x: px, y: py };
    let best = null;
    let bestD = Infinity;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.at(x, y)) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        const d = (cx - px) ** 2 + (cy - py) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best ?? { x: this.pixelW / 2, y: this.pixelH / 2 };
  }

  centre() {
    return { x: this.pixelW / 2, y: this.pixelH / 2 };
  }

  // ----------------------------------------------------------- dressing ----
  _prop(name) {
    const p = this.manifest.props[name];
    if (!p || !this.images[p.file]) return null;
    const anim = new Animator({ [name]: clipFrom(p, this.images) }, name);
    // Desync identical props so the whole forest doesn't sway in lockstep.
    if (p.frames > 1) anim.frame = Math.floor(this.rng() * p.frames);
    return { anim, animated: p.frames > 1 };
  }

  _placeProps() {
    const edgeTiles = [];
    const innerTiles = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.at(x, y)) continue;
        const edge = !this.at(x - 1, y) || !this.at(x + 1, y) || !this.at(x, y - 1) || !this.at(x, y + 1);
        const cx = Math.abs(x - this.w / 2);
        const cy = Math.abs(y - this.h / 2);
        // Keep the middle of the arena clear so combat always has room.
        if (edge) edgeTiles.push([x, y]);
        else if (cx > this.w * 0.24 || cy > this.h * 0.26) innerTiles.push([x, y]);
      }
    }

    const place = (list, names, count, opts = {}) => {
      const pool = [...list];
      for (let i = 0; i < count && pool.length; i++) {
        const idx = Math.floor(this.rng() * pool.length);
        const [tx, ty] = pool.splice(idx, 1)[0];
        const name = names[Math.floor(this.rng() * names.length)];
        const p = this._prop(name);
        if (!p) continue;
        this.props.push({
          ...p,
          name,
          x: tx * TILE + TILE / 2 + (this.rng() - 0.5) * 22,
          y: ty * TILE + TILE * 0.72 + (this.rng() - 0.5) * 14,
          flip: this.rng() < 0.5,
          blocking: opts.blocking ?? false,
          radius: opts.radius ?? 0,
        });
      }
    };

    place(innerTiles, ['tree1', 'tree2', 'tree3', 'tree4'], 9, { blocking: true, radius: 20 });
    place(innerTiles, ['bushe1', 'bushe2', 'bushe3', 'bushe4'], 7);
    place(edgeTiles, ['rock1', 'rock2', 'rock3', 'rock4'], 6);
    place(innerTiles, ['stump-1', 'stump-2', 'stump-3', 'stump-4'], 3);

    // Water rocks + a duck, out in the surf.
    for (let i = 0; i < 7; i++) {
      const name = `water-rocks-0${1 + Math.floor(this.rng() * 4)}`;
      const p = this._prop(name);
      if (!p) continue;
      const pt = this._waterPoint();
      if (pt) this.props.push({ ...p, name, ...pt, flip: this.rng() < 0.5, water: true });
    }
    const duck = this._prop('rubber-duck');
    const dpt = this._waterPoint();
    if (duck && dpt) this.props.push({ ...duck, name: 'rubber-duck', ...dpt, flip: false, water: true });
  }

  _waterPoint() {
    for (let tries = 0; tries < 120; tries++) {
      const x = Math.floor(this.rng() * (this.w + 6)) - 3;
      const y = Math.floor(this.rng() * (this.h + 6)) - 3;
      if (this.at(x, y)) continue;
      // Just outside the shoreline, not miles out to sea.
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = -2; dx <= 2; dx++) if (this.at(x + dx, y + dy)) { near = true; break; }
      if (!near) continue;
      return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
    }
    return null;
  }

  _makeClouds() {
    const out = [];
    for (let i = 1; i <= 8; i++) {
      const name = `clouds-0${i}`;
      const p = this.manifest.props[name];
      if (!p) continue;
      out.push({
        img: this.images[p.file],
        x: this.rng() * (this.pixelW + 1200) - 600,
        y: this.rng() * (this.pixelH + 800) - 400,
        speed: 6 + this.rng() * 12,
        // Kept faint: clouds are an overhead haze pass, and at any higher
        // opacity they read as fog sitting on the grass rather than above it.
        alpha: 0.16 + this.rng() * 0.13,
        scale: 0.9 + this.rng() * 0.7,
      });
    }
    return out;
  }

  // ------------------------------------------------------------- update ----
  update(dt) {
    this.time += dt;
    this.foam.update(dt);
    for (const p of this.props) if (p.animated) p.anim.update(dt);
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.pixelW + 700) c.x = -700;
    }
  }

  // --------------------------------------------------------------- draw ----
  drawWater(ctx, cam) {
    const halfW = cam.viewW / 2 + TILE;
    const halfH = cam.viewH / 2 + TILE;
    const x0 = Math.floor((cam.x - halfW) / TILE) * TILE;
    const y0 = Math.floor((cam.y - halfH) / TILE) * TILE;
    const x1 = cam.x + halfW;
    const y1 = cam.y + halfH;
    // Gentle drift keeps the sea from looking like static wallpaper.
    const drift = Math.sin(this.time * 0.35) * 3;
    for (let y = y0; y < y1; y += TILE) {
      for (let x = x0; x < x1; x += TILE) {
        ctx.drawImage(this.waterImg, Math.round(x + drift), Math.round(y), TILE, TILE);
      }
    }
  }

  /**
   * Shoreline surf.
   *
   * A foam frame is a single 64px rounded square of shallow water centred in a
   * 192 cell — a per-tile sprite. Placed 1:1 the rounded corners leave gaps and
   * the ring reads as a quilt of separate squares, so we oversize each sprite
   * slightly and let neighbours union into one continuous band.
   */
  drawFoam(ctx) {
    const OVERLAP = 1.3;
    for (let y = -1; y <= this.h; y++) {
      for (let x = -1; x <= this.w; x++) {
        if (this.at(x, y)) continue;
        const touches =
          this.at(x - 1, y) || this.at(x + 1, y) || this.at(x, y - 1) || this.at(x, y + 1) ||
          this.at(x - 1, y - 1) || this.at(x + 1, y - 1) || this.at(x - 1, y + 1) || this.at(x + 1, y + 1);
        if (!touches) continue;
        this.foam.draw(ctx, x * TILE + TILE / 2, y * TILE + TILE / 2, {
          scaleX: OVERLAP,
          scaleY: OVERLAP,
        });
      }
    }
  }

  drawGround(ctx) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.at(x, y)) continue;
        const { sx, sy } = this._tileFor(x, y);
        ctx.drawImage(this.tilemap, sx, sy, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  /** Overhead haze. `cam` drives a parallax offset so they sit above the world. */
  drawClouds(ctx, cam) {
    const px = (cam?.x ?? 0) * 0.16;
    const py = (cam?.y ?? 0) * 0.16;
    ctx.save();
    for (const c of this.clouds) {
      ctx.globalAlpha = c.alpha;
      const w = c.img.width * c.scale;
      const h = c.img.height * c.scale;
      ctx.drawImage(c.img, Math.round(c.x + px), Math.round(c.y + py), w, h);
    }
    ctx.restore();
  }

  /** Props participate in depth sorting, so they're handed to the renderer. */
  drawables() {
    return this.props.map((p) => ({
      y: p.y,
      draw: (ctx) => p.anim.draw(ctx, p.x, p.y, { flip: p.flip }),
    }));
  }

  /** Circular blockers (tree trunks) for unit collision. */
  blockers() {
    return this.props.filter((p) => p.blocking);
  }
}
