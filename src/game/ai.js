/**
 * Enemy brains. Deliberately simple, but with a readable telegraph — the
 * windup phase is what makes a fight feel fair rather than random.
 */

import { STATE } from './unit.js';

export class Brain {
  constructor(unit, spec) {
    this.u = unit;
    this.spec = spec;
    this.phase = 'idle';   // idle | chase | windup | recover | reposition
    this.t = 0;
    // Stagger cooldowns a little so a pack doesn't attack in perfect unison.
    this.offset = Math.random() * 0.4;
  }

  update(dt, player, ctx) {
    const u = this.u;
    if (!u.alive) return;

    // Being hit interrupts whatever we were winding up.
    if (u.state === STATE.STAGGER) {
      this.phase = 'recover';
      this.t = 0.25;
      u.vx = u.vy = 0;
      return;
    }
    if (u.state === STATE.ATTACK) return;

    this.t -= dt;
    const dx = player.x - u.x;
    const dy = player.y - u.y;
    const dist = Math.hypot(dx, dy * 1.35);
    if (player.alive) u.facing = Math.sign(dx) || u.facing;

    if (!player.alive) {
      u.vx = u.vy = 0;
      return;
    }

    switch (this.phase) {
      case 'idle':
        u.vx = u.vy = 0;
        if (dist < this.spec.aggroRange) this.phase = 'chase';
        break;

      case 'chase': {
        const wantRange = this.spec.attackRange * 0.85;
        if (this.spec.keepAway && dist < this.spec.keepAway) {
          // Archers back off when crowded.
          this._moveTo(-dx, -dy, dist, this.spec.speed * 1.05);
        } else if (dist > wantRange) {
          this._moveTo(dx, dy, dist, this.spec.speed);
        } else {
          u.vx = u.vy = 0;
          this.phase = 'windup';
          this.t = this.spec.windupMs / 1000 + this.offset;
        }
        break;
      }

      case 'windup':
        u.vx = u.vy = 0;
        if (this.t <= 0) {
          if (dist <= this.spec.attackRange * 1.15) {
            ctx.beginAttack(u, this.spec);
            this.phase = 'recover';
            this.t = this.spec.recoverMs / 1000;
          } else {
            this.phase = 'chase';
          }
        }
        break;

      case 'recover':
        u.vx = u.vy = 0;
        if (this.t <= 0) this.phase = 'chase';
        break;
    }
  }

  _moveTo(dx, dy, dist, speed) {
    const u = this.u;
    if (dist < 0.001) return;
    u.vx = (dx / dist) * speed;
    u.vy = (dy / dist) * speed * 0.72; // vertical movement reads slower in this view
  }

  /** True while the telegraph is showing — the renderer tints the unit. */
  get telegraphing() {
    return this.phase === 'windup';
  }

  get telegraphAmount() {
    if (this.phase !== 'windup') return 0;
    const total = this.spec.windupMs / 1000 + this.offset;
    return Math.min(1, 1 - this.t / total);
  }
}
