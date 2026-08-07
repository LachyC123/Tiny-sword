/**
 * A combat unit.
 *
 * NOTE ON DEATH: the Tiny Swords free pack ships no death, hurt or hit-react
 * frames for any unit. Rather than fake sprite frames we synthesise the whole
 * reaction procedurally — white flash, knockback, stagger lockout, squash, and
 * on death a fall-over/fade tween with a dust puff. Done at the right timings
 * this reads better than a mediocre 4-frame death sheet, and it costs nothing.
 */

import { FEEL } from '../config.js';
import { Animator } from '../core/sprite.js';
import { ease } from '../core/fx.js';

export const STATE = {
  IDLE: 'idle',
  RUN: 'run',
  ATTACK: 'attack',
  GUARD: 'guard',
  STAGGER: 'stagger',
  DYING: 'dying',
  DEAD: 'dead',
};

const DEATH_MS = 560;
const STAGGER_MS = 175;

export class Unit {
  constructor({ clips, x, y, hp, team, kind, shadow }) {
    this.anim = new Animator(clips, 'idle');
    this.x = x;
    this.y = y;
    this.shadow = shadow;     // clip, content-centre anchored
    this.team = team;         // 'player' | 'enemy'
    this.kind = kind;         // 'warrior' | 'archer'
    this.maxHp = hp;
    this.hp = hp;
    this.facing = team === 'player' ? 1 : -1;

    this.state = STATE.IDLE;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0;              // knockback velocity
    this.ky = 0;

    this.sx = 1;              // squash & stretch
    this.sy = 1;
    this.flash = 0;
    this.invuln = 0;
    this.stateT = 0;
    this.deathT = 0;
    this.radius = 20;

    this.attackSpec = null;
    this.attackHasHit = false;
    this.onAttackHit = null;  // set by the owner to resolve damage
    this.guarding = false;
    this.dustT = 0;
  }

  get alive() {
    return this.state !== STATE.DYING && this.state !== STATE.DEAD;
  }

  get busy() {
    return this.state === STATE.ATTACK || this.state === STATE.STAGGER;
  }

  /** Feet position — used for depth sorting and shadow placement. */
  get depth() {
    return this.y;
  }

  // ------------------------------------------------------------- actions ----
  startAttack(spec) {
    if (!this.alive || this.busy) return false;
    this.attackSpec = spec;
    this.attackHasHit = false;
    this.state = STATE.ATTACK;
    this.stateT = 0;
    this.anim.play(spec.anim, { restart: true });
    // Anticipation: stretch forward, then settle.
    this.sx = 1.16;
    this.sy = 0.88;
    if (spec.lunge) {
      this.kx += this.facing * spec.lunge;
    }
    return true;
  }

  /**
   * @returns {'blocked'|'hit'|'killed'|'ignored'}
   */
  takeHit(damage, fromX, { guardMul = 1, knockback = FEEL.knockback } = {}) {
    if (!this.alive || this.invuln > 0) return 'ignored';

    const blocking = this.guarding && Math.sign(fromX - this.x) === this.facing;
    const dmg = blocking ? damage * guardMul : damage;

    this.hp -= dmg;
    this.flash = 1;
    this.invuln = blocking ? 0.12 : 0;

    const dir = Math.sign(this.x - fromX) || -this.facing;
    const kb = blocking ? knockback * 0.3 : knockback;
    this.kx += dir * kb;

    // Impact squash — wide and short, springs back.
    this.sx = 0.82;
    this.sy = 1.2;

    if (this.hp <= 0) {
      this.hp = 0;
      this.state = STATE.DYING;
      this.deathT = 0;
      this.facing = -dir; // face the blow as you go down
      return 'killed';
    }

    if (!blocking) {
      this.state = STATE.STAGGER;
      this.stateT = 0;
    }
    return blocking ? 'blocked' : 'hit';
  }

  // -------------------------------------------------------------- update ----
  update(dt, world, others, fx) {
    // Timers that run regardless of state.
    this.flash = Math.max(0, this.flash - dt / (FEEL.flashMs / 1000));
    this.invuln = Math.max(0, this.invuln - dt);

    // Springs: exponential settle is stable at any dt.
    const k = 1 - Math.exp(-16 * dt);
    this.sx += (1 - this.sx) * k;
    this.sy += (1 - this.sy) * k;

    if (this.state === STATE.DYING) {
      this.deathT += dt / (DEATH_MS / 1000);
      this._integrate(dt, world, others, /*canMove*/ false);
      if (this.deathT >= 1) this.state = STATE.DEAD;
      return;
    }
    if (this.state === STATE.DEAD) return;

    this.stateT += dt;

    if (this.state === STATE.STAGGER) {
      this.vx = 0;
      this.vy = 0;
      if (this.stateT >= STAGGER_MS / 1000) this.state = STATE.IDLE;
    }

    if (this.state === STATE.ATTACK) {
      this.vx = 0;
      this.vy = 0;
      const spec = this.attackSpec;
      if (!this.attackHasHit && this.anim.frame >= spec.hitFrame) {
        this.attackHasHit = true;
        this.onAttackHit?.(this, spec);
      }
      if (this.anim.finished) {
        this.state = STATE.IDLE;
        this.attackSpec = null;
      }
    }

    // Pick the locomotion clip when not doing something more specific.
    if (this.state === STATE.IDLE || this.state === STATE.RUN || this.state === STATE.GUARD) {
      const moving = Math.hypot(this.vx, this.vy) > 4;
      if (this.guarding && this.anim.clips.guard) {
        this.state = STATE.GUARD;
        this.anim.play('guard');
      } else {
        this.state = moving ? STATE.RUN : STATE.IDLE;
        this.anim.play(moving ? 'run' : 'idle');
      }
      if (moving) this._runDust(dt, fx);
    } else if (this.state === STATE.STAGGER) {
      this.anim.play('idle');
    }

    this._integrate(dt, world, others, this.state !== STATE.ATTACK && this.state !== STATE.STAGGER);
    this.anim.update(dt);
  }

  _runDust(dt, fx) {
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.19;
      fx?.spawn('dust-01', this.x - this.facing * 8, this.y + 2, {
        scale: 0.55,
        alpha: 0.75,
        flip: this.facing < 0,
      });
    }
  }

  _integrate(dt, world, others, canMove) {
    // Knockback decays exponentially and is applied regardless of state.
    const decay = Math.exp(-FEEL.knockbackDecay * dt);
    const nx = this.x + (canMove ? this.vx : 0) * dt + this.kx * dt;
    const ny = this.y + (canMove ? this.vy : 0) * dt + this.ky * dt;
    this.kx *= decay;
    this.ky *= decay;
    if (Math.abs(this.kx) < 2) this.kx = 0;
    if (Math.abs(this.ky) < 2) this.ky = 0;

    // Axis-separated so sliding along a shoreline feels smooth.
    if (world.walkable(nx, this.y, this.radius)) this.x = nx;
    else this.kx = 0;
    if (world.walkable(this.x, ny, this.radius)) this.y = ny;
    else this.ky = 0;

    // Soft separation from other units and from tree trunks.
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x;
      const dy = (this.y - o.y) * 1.6; // squashed — the view is pseudo-top-down
      const d = Math.hypot(dx, dy);
      const min = this.radius + o.radius;
      if (d > 0.001 && d < min) {
        const push = ((min - d) / min) * 90 * dt;
        this.x += (dx / d) * push;
        this.y += (dy / d) * push * 0.6;
      }
    }
    for (const b of world.blockers()) {
      const dx = this.x - b.x;
      const dy = (this.y - b.y) * 1.8;
      const d = Math.hypot(dx, dy);
      const min = this.radius + b.radius;
      if (d > 0.001 && d < min) {
        this.x += (dx / d) * (min - d);
        this.y += (dy / d) * (min - d) * 0.5;
      }
    }

    const safe = world.clampToLand(this.x, this.y, this.radius);
    this.x = safe.x;
    this.y = safe.y;
  }

  // ---------------------------------------------------------------- draw ----
  drawShadow(ctx) {
    if (this.state === STATE.DEAD || !this.shadow) return;
    const fade = this.state === STATE.DYING ? 1 - ease.outQuad(this.deathT) : 1;
    const s = 0.7 * this.sx;
    const c = this.shadow;
    const a = c.anchor; // content-centre, so the ellipse lands on the feet
    ctx.save();
    ctx.globalAlpha = 0.4 * fade;
    ctx.translate(this.x, this.y - 2);
    ctx.scale(s, s);
    ctx.drawImage(c.img, 0, 0, c.cellW, c.cellH, -a.x, -a.y, c.cellW, c.cellH);
    ctx.restore();
  }

  draw(ctx) {
    if (this.state === STATE.DEAD) return;

    let alpha = 1;
    let rotation = 0;
    let yOff = 0;
    let flash = this.flash;
    let sx = this.sx;
    let sy = this.sy;

    if (this.state === STATE.DYING) {
      const t = Math.min(1, this.deathT);
      // Fall away from the killing blow, hop slightly, then fade.
      rotation = ease.outCubic(t) * (Math.PI / 2) * 0.92 * -this.facing;
      yOff = -Math.sin(t * Math.PI) * 9;
      alpha = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;
      flash = Math.max(flash, t < 0.14 ? 1 - t / 0.14 : 0);
      sy = 1 - t * 0.12;
      sx = 1 + t * 0.06;
    }

    this.anim.draw(ctx, this.x, this.y + yOff, {
      flip: this.facing < 0,
      scaleX: sx,
      scaleY: sy,
      rotation,
      alpha,
      flash,
    });
  }

  /** Floating health bar, drawn after all sprites so nothing occludes it. */
  drawBar(ctx, bars) {
    if (!this.alive || this.hp >= this.maxHp) return;
    const w = 46;
    const h = 7;
    const x = Math.round(this.x - w / 2);
    const y = Math.round(this.y - 104);
    const pct = Math.max(0, this.hp / this.maxHp);

    ctx.save();
    ctx.fillStyle = 'rgba(24,32,26,0.85)';
    ctx.strokeStyle = 'rgba(12,18,14,0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 3);
    ctx.fill();
    ctx.stroke();
    if (bars?.fill) {
      // smallbar-fill's content is only rows 30..33 of its 64px cell — sampling
      // the whole cell into a 7px bar would leave it visually empty.
      const s = bars.fillSrc;
      ctx.drawImage(bars.fill, 0, s.y, 64, s.h, x, y, Math.max(1, w * pct), h);
    } else {
      ctx.fillStyle = '#d94f4f';
      ctx.fillRect(x, y, Math.max(1, w * pct), h);
    }
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
