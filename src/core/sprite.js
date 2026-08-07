/**
 * Sprite sheet playback and drawing.
 *
 * Every Tiny Swords sheet is a single horizontal strip of square cells, so a
 * "sheet" is just (image, cell, frames, fps, loop) straight off the manifest.
 */

// --- white-silhouette cache (hit flash) ------------------------------------
// Rebuilding this per frame would be brutal, so each source image gets one
// pre-rendered all-white copy that we composite on top at low alpha.
const flashCache = new WeakMap();

export function whiteMask(img) {
  let c = flashCache.get(img);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  flashCache.set(img, c);
  return c;
}

/** Same idea, but tinted — used for the enemy telegraph. */
const tintCache = new WeakMap();

export function tintMask(img, color) {
  let byColor = tintCache.get(img);
  if (!byColor) tintCache.set(img, (byColor = new Map()));
  let c = byColor.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  byColor.set(color, c);
  return c;
}

export class Animator {
  /** @param {Record<string, {img: HTMLImageElement, cell:number, frames:number, fps:number, loop:boolean}>} clips */
  constructor(clips, initial) {
    this.clips = clips;
    this.name = null;
    this.frame = 0;
    this.t = 0;
    this.finished = false;
    this.play(initial);
  }

  get clip() {
    return this.clips[this.name];
  }

  play(name, { restart = false } = {}) {
    if (!this.clips[name]) throw new Error(`no such clip: ${name}`);
    if (this.name === name && !restart) return;
    this.name = name;
    this.frame = 0;
    this.t = 0;
    this.finished = false;
  }

  update(dt) {
    const c = this.clip;
    if (!c) return;
    if (this.finished) return;
    this.t += dt;
    const step = 1 / c.fps;
    while (this.t >= step) {
      this.t -= step;
      this.frame += 1;
      if (this.frame >= c.frames) {
        if (c.loop) {
          this.frame = 0;
        } else {
          this.frame = c.frames - 1;
          this.finished = true;
          break;
        }
      }
    }
  }

  /** Progress through the current clip, 0..1. */
  get progress() {
    const c = this.clip;
    return c ? (this.frame + this.t * c.fps) / c.frames : 0;
  }

  /**
   * Draws the current frame, pivoted on the clip's anchor.
   *
   * Anchors come from the manifest (feet for characters, centre for FX,
   * bottom-centre of the artwork for props), so cells need not be square and
   * no caller has to know a sprite's internal offsets.
   *
   * @param opts.flip      mirror horizontally (units are authored facing right)
   * @param opts.scaleX/Y  squash & stretch
   * @param opts.rotation  radians, pivoted on the anchor
   * @param opts.alpha
   * @param opts.flash     0..1 white overlay
   * @param opts.tint      css colour for a tint overlay
   * @param opts.tintAmt   0..1
   */
  draw(ctx, x, y, opts = {}) {
    const c = this.clip;
    if (!c) return;
    const {
      flip = false,
      scaleX = 1,
      scaleY = 1,
      rotation = 0,
      alpha = 1,
      flash = 0,
      tint = null,
      tintAmt = 0,
      anchor = c.anchor,
    } = opts;

    const ax = anchor?.x ?? c.cellW / 2;
    const ay = anchor?.y ?? c.cellH;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    ctx.scale(flip ? -scaleX : scaleX, scaleY);
    const sx = this.frame * c.cellW;
    const dx = -ax;
    const dy = -ay;
    ctx.drawImage(c.img, sx, 0, c.cellW, c.cellH, dx, dy, c.cellW, c.cellH);

    if (flash > 0) {
      ctx.globalAlpha *= Math.min(1, flash);
      ctx.drawImage(whiteMask(c.img), sx, 0, c.cellW, c.cellH, dx, dy, c.cellW, c.cellH);
    } else if (tint && tintAmt > 0) {
      ctx.globalAlpha *= Math.min(1, tintAmt);
      ctx.drawImage(tintMask(c.img, tint), sx, 0, c.cellW, c.cellH, dx, dy, c.cellW, c.cellH);
    }
    ctx.restore();
  }
}

/** Turns one manifest sheet entry + the preloaded images into a clip. */
export function clipFrom(entry, images, palette = null) {
  const src = palette ? entry.file.replace('/units/blue/', `/units/${palette}/`) : entry.file;
  const img = images[src];
  if (!img) throw new Error(`missing image ${src}`);
  return {
    img,
    cellW: entry.cellW,
    cellH: entry.cellH,
    frames: entry.frames,
    fps: entry.fps,
    loop: entry.loop,
    anchor: entry.anchor ?? null,
  };
}

/** Builds an Animator clip table from a manifest anim map. */
export function clipsFrom(animEntries, images, palette = null) {
  const clips = {};
  for (const [name, e] of Object.entries(animEntries)) {
    clips[name] = clipFrom(e, images, palette);
  }
  return clips;
}
