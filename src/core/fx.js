/**
 * The juice layer: hit-stop, trauma-based screen shake, one-shot sprite
 * particles and floating damage numbers.
 *
 * Hit-stop is deliberately global and blunt — when it's active the whole sim
 * stops, including animation. That total freeze is what makes an impact read.
 */

import { FEEL } from '../config.js';
import { Animator } from './sprite.js';

export class Fx {
  constructor(clips) {
    this.clips = clips;         // name -> clip (dust, explosion, splash…)
    this.particles = [];
    this.numbers = [];
    this.trauma = 0;
    this.stopMs = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this._seed = 1337;
  }

  // Deterministic noise so shake is reproducible in screenshot tests.
  _rand() {
    this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
    return this._seed / 0xffffffff;
  }

  hitStop(ms) {
    this.stopMs = Math.max(this.stopMs, ms);
  }

  addTrauma(v) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  /** True while the simulation should be frozen. */
  get frozen() {
    return this.stopMs > 0;
  }

  spawn(name, x, y, { flip = false, scale = 1, alpha = 1, rot = 0 } = {}) {
    const clip = this.clips[name];
    if (!clip) return;
    const anim = new Animator({ [name]: clip }, name);
    this.particles.push({ anim, x, y, flip, scale, alpha, rot });
  }

  number(x, y, value, { crit = false, color = null } = {}) {
    this.numbers.push({
      // Jitter the origin as well as the velocity — two hits landing in the
      // same frame otherwise stack into an unreadable smear.
      x: x + (this._rand() - 0.5) * 26,
      y: y + (this._rand() - 0.5) * 14,
      vx: (this._rand() - 0.5) * 90,
      vy: -104 - this._rand() * 26,
      life: 0,
      ttl: 0.78,
      value: Math.round(value),
      crit,
      color: color ?? (crit ? '#ffd76b' : '#fff4e0'),
    });
  }

  /**
   * Advances hit-stop on *real* time and everything else on sim time.
   * Returns the dt the rest of the game should use (0 while frozen).
   */
  update(realDt) {
    if (this.stopMs > 0) {
      this.stopMs -= realDt * 1000;
      // Shake keeps running during the freeze — the screen kicks while the
      // action is held still, which is exactly the effect we want.
      this._updateShake(realDt);
      return 0;
    }
    this._updateShake(realDt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.anim.update(realDt);
      if (p.anim.finished) this.particles.splice(i, 1);
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life += realDt;
      n.x += n.vx * realDt;
      n.y += n.vy * realDt;
      n.vy += 300 * realDt;
      if (n.life >= n.ttl) this.numbers.splice(i, 1);
    }
    return realDt;
  }

  _updateShake(dt) {
    this.trauma = Math.max(0, this.trauma - FEEL.shakeDecay * dt);
    const amt = this.trauma * this.trauma; // squared feels far better than linear
    this.shakeX = (this._rand() * 2 - 1) * amt * FEEL.shakeMax;
    this.shakeY = (this._rand() * 2 - 1) * amt * FEEL.shakeMax;
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      // FX clips carry a centre anchor from the manifest.
      p.anim.draw(ctx, p.x, p.y, {
        flip: p.flip,
        scaleX: p.scale,
        scaleY: p.scale,
        alpha: p.alpha,
        rotation: p.rot,
      });
    }
  }

  drawNumbers(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const t = n.life / n.ttl;
      const a = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.55) / 0.45);
      const pop = t < 0.16 ? 1 + (1 - t / 0.16) * 0.5 : 1;
      const size = (n.crit ? 22 : 17) * pop;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `900 ${size}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(20,28,20,0.92)';
      ctx.lineJoin = 'round';
      ctx.strokeText(String(n.value), n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(String(n.value), n.x, n.y);
    }
    ctx.restore();
  }
}

/** Small easing helpers used by the unit tweens. */
export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
  outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};
