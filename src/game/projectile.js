/**
 * Arrows. The pack ships `arrow.png` as a standalone 64x64 sprite (pointing
 * right, centred at 32,32) precisely so it can be its own entity — which gives
 * real travel time and lets the player read and dodge a shot.
 */

const ARROW_ANCHOR = { x: 32, y: 32 };

export class Projectile {
  constructor({ img, x, y, vx, vy, damage, team, owner }) {
    this.img = img;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.team = team;
    this.owner = owner;
    this.dead = false;
    this.life = 0;
    this.trailT = 0;
  }

  get depth() {
    return this.y;
  }

  update(dt, world, units, fx, onHit) {
    this.life += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.life > 4) this.dead = true;

    // Off the island entirely — splash and die.
    const tx = Math.floor(this.x / 64);
    const ty = Math.floor(this.y / 64);
    if (!world.at(tx, ty)) {
      if (this.life > 0.08) {
        fx.spawn('water-splash', this.x, this.y, { scale: 0.5, alpha: 0.9 });
        this.dead = true;
      }
      return;
    }

    for (const u of units) {
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - this.x;
      const dy = (u.y - this.y) * 1.5;
      if (Math.hypot(dx, dy) < u.radius + 8) {
        onHit(this, u);
        this.dead = true;
        return;
      }
    }
  }

  draw(ctx) {
    const rot = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y - 34); // arrows fly at chest height
    ctx.rotate(rot);
    ctx.drawImage(this.img, -ARROW_ANCHOR.x, -ARROW_ANCHOR.y);
    ctx.restore();
  }
}
