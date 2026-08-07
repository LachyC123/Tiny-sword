/**
 * Tiny Swords — vertical slice.
 *
 * Proves out the whole chain on real assets: autotiled world, animated props,
 * two enemy archetypes (melee + ranged with a real projectile), and the feel
 * layer that actually makes a mobile action game read — hit-stop, trauma
 * shake, squash & stretch, damage numbers and a synthesised death reaction.
 */

import { VIEW_H, MIN_VIEW_W, FEEL, PLAYER, ENEMY, WAVES, TILE } from './config.js';
import { preload, loadManifest } from './core/loader.js';
import { clipsFrom, clipFrom } from './core/sprite.js';
import { Fx, ease } from './core/fx.js';
import { Camera } from './core/camera.js';
import { Input } from './core/input.js';
import { World } from './game/world.js';
import { Unit, STATE } from './game/unit.js';
import { Brain } from './game/ai.js';
import { Projectile } from './game/projectile.js';
import { Hud } from './game/hud.js';

const bootEl = document.getElementById('boot');
const bootFill = document.getElementById('bootfill');
const bootMsg = document.getElementById('bootmsg');

const PLAYER_PALETTE = 'blue';
const ENEMY_PALETTE = 'red';

boot().catch((err) => {
  console.error(err);
  bootMsg.className = 'err';
  bootMsg.textContent = String(err.message || err);
});

async function boot() {
  const manifest = await loadManifest();

  // Collect exactly the images the slice needs.
  const srcs = [];
  const unitSrcs = (unit, palette) => {
    const u = manifest.units[unit];
    for (const a of Object.values(u.anims)) srcs.push(rep(a.file, palette));
    if (u.projectile) srcs.push(rep(u.projectile.file, palette));
  };
  unitSrcs('warrior', PLAYER_PALETTE);
  unitSrcs('warrior', ENEMY_PALETTE);
  unitSrcs('archer', ENEMY_PALETTE);

  srcs.push(...manifest.terrain.tilemaps, manifest.terrain.water,
            manifest.terrain.shadow.file, manifest.terrain.foam.file);
  for (const f of Object.values(manifest.fx)) srcs.push(f.file);
  for (const p of Object.values(manifest.props)) srcs.push(p.file);
  for (const group of ['bars', 'banners', 'buttons', 'swords']) {
    srcs.push(...(manifest.ui[group] ?? []));
  }
  srcs.push(manifest.ui.avatar.file);

  const images = await preload(srcs.filter(Boolean), (p) => {
    bootFill.style.width = `${Math.round(p * 100)}%`;
    bootMsg.textContent = `loading ${Math.round(p * 100)}%`;
  });

  bootMsg.textContent = 'ready';
  const game = new Game(manifest, images);
  game.start();
  requestAnimationFrame(() => bootEl.classList.add('gone'));
  // Expose for the screenshot harness / debugging.
  window.__game = game;
}

function rep(file, palette) {
  return file.replace('/units/blue/', `/units/${palette}/`);
}

class Game {
  constructor(manifest, images) {
    this.manifest = manifest;
    this.images = images;

    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.world = new World(manifest, images);
    this.fx = new Fx(
      Object.fromEntries(
        Object.entries(manifest.fx).map(([k, f]) => [k, clipFrom(f, images)])
      )
    );
    this.camera = new Camera();
    this.hud = new Hud(manifest.ui, images);
    this.input = new Input(this.canvas, (cx, cy) => this.clientToView(cx, cy));

    this.units = [];
    this.brains = new Map();
    this.projectiles = [];

    this.wave = 0;
    this.banner = null;
    this.bannerT = 0;
    this.state = 'playing';
    this.time = 0;
    this.comboIndex = 0;
    this.comboT = 0;

    this._spawnPlayer();
    this._startWave(0);

    this.viewW = MIN_VIEW_W;
    this.viewH = VIEW_H;
    this.scale = 1;
    this.dpr = 1;
    this._resize();
    addEventListener('resize', () => this._resize());
    addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));

    this.camera.snapTo(this.player.x, this.player.y);
  }

  // ------------------------------------------------------------- setup ----
  _clipsFor(unit, palette) {
    return clipsFrom(this.manifest.units[unit].anims, this.images, palette);
  }

  _spawnPlayer() {
    const c = this.world.centre();
    this.player = new Unit({
      clips: this._clipsFor('warrior', PLAYER_PALETTE),
      x: c.x,
      y: c.y + 30,
      hp: PLAYER.maxHp,
      team: 'player',
      kind: 'warrior',
      shadow: this.world.shadowClip,
    });
    this.player.onAttackHit = (u, spec) => this._resolveMelee(u, spec);
    this.units.push(this.player);
  }

  _startWave(i) {
    this.wave = i;
    const plan = WAVES[i];
    const c = this.world.centre();
    const ring = Math.min(this.world.pixelW, this.world.pixelH) * 0.36;
    let n = 0;
    const total = plan.warrior + plan.archer;

    const spawnOne = (kind) => {
      const spec = ENEMY[kind];
      const ang = (n / total) * Math.PI * 2 + i * 0.7;
      n += 1;
      const pos = this.world.clampToLand(
        c.x + Math.cos(ang) * ring,
        c.y + Math.sin(ang) * ring * 0.8,
        24
      );
      const u = new Unit({
        clips: this._clipsFor(spec.unit, ENEMY_PALETTE),
        x: pos.x,
        y: pos.y,
        hp: spec.maxHp,
        team: 'enemy',
        kind,
        shadow: this.world.shadowClip,
      });
      u.onAttackHit = (self) => this._resolveEnemyAttack(self, spec);
      this.units.push(u);
      this.brains.set(u, new Brain(u, spec));
      // Spawn puff so they don't just blink into existence.
      this.fx.spawn('dust-02', pos.x, pos.y, { scale: 0.9, alpha: 0.9 });
    };

    for (let k = 0; k < plan.warrior; k++) spawnOne('warrior');
    for (let k = 0; k < plan.archer; k++) spawnOne('archer');
  }

  get enemies() {
    return this.units.filter((u) => u.team === 'enemy' && u.alive);
  }

  // ------------------------------------------------------------ combat ----
  beginAttack(unit, spec) {
    unit.startAttack({
      anim: spec.anim,
      hitFrame: spec.hitFrame,
      damage: spec.damage,
      reach: spec.reach,
      arc: spec.arc,
    });
  }

  _resolveMelee(attacker, spec) {
    const targets = this.units.filter((u) => u.alive && u.team !== attacker.team);
    let connected = false;
    for (const t of targets) {
      const dx = (t.x - attacker.x) * attacker.facing;
      const dy = t.y - attacker.y;
      if (dx < -14 || dx > spec.reach) continue;
      if (Math.abs(dy) > spec.reach * 0.45 * (spec.arc ?? 1)) continue;

      const res = t.takeHit(spec.damage, attacker.x, {
        guardMul: PLAYER.guard.damageMul,
        knockback: FEEL.knockback,
      });
      if (res === 'ignored') continue;
      connected = true;

      const hx = (attacker.x + t.x) / 2;
      const hy = (attacker.y + t.y) / 2 - 44;

      if (res === 'blocked') {
        this.fx.spawn('dust-01', hx, hy, { scale: 0.8 });
        this.fx.number(hx, hy, spec.damage * PLAYER.guard.damageMul, { color: '#9fd8ff' });
        this.fx.hitStop(FEEL.hitStopMs * 0.6);
        this.fx.addTrauma(FEEL.shakeOnHit * 0.5);
      } else if (res === 'killed') {
        this.fx.spawn('explosion-01', t.x, t.y - 26, { scale: 0.62, alpha: 0.85 });
        this.fx.spawn('dust-02', t.x, t.y + 2, { scale: 1.0 });
        this.fx.number(hx, hy, spec.damage, { crit: true });
        this.fx.hitStop(FEEL.hitStopKillMs);
        this.fx.addTrauma(FEEL.shakeOnKill);
      } else {
        this.fx.spawn('dust-02', hx, hy, { scale: 0.7, alpha: 0.9, flip: attacker.facing < 0 });
        this.fx.number(hx, hy, spec.damage);
        this.fx.hitStop(FEEL.hitStopMs);
        this.fx.addTrauma(FEEL.shakeOnHit);
      }
    }
    if (!connected && attacker === this.player) {
      // Whiff: a small puff sells the swing without pretending it landed.
      this.fx.spawn('dust-01', attacker.x + attacker.facing * 34, attacker.y - 8, {
        scale: 0.5,
        alpha: 0.5,
        flip: attacker.facing < 0,
      });
    }
  }

  _resolveEnemyAttack(unit, spec) {
    if (unit.kind === 'archer') {
      const p = this.player;
      const dx = p.x - unit.x;
      const dy = p.y - 34 - (unit.y - 34);
      const d = Math.hypot(dx, dy) || 1;
      this.projectiles.push(
        new Projectile({
          img: this.images[rep(this.manifest.units.archer.projectile.file, ENEMY_PALETTE)],
          x: unit.x + unit.facing * 22,
          y: unit.y,
          vx: (dx / d) * spec.projectileSpeed,
          vy: (dy / d) * spec.projectileSpeed,
          damage: spec.damage,
          team: unit.team,
          owner: unit,
        })
      );
      return;
    }
    this._resolveMelee(unit, spec);
  }

  _onProjectileHit(proj, target) {
    const res = target.takeHit(proj.damage, proj.x, {
      guardMul: PLAYER.guard.damageMul,
      knockback: FEEL.knockback * 0.6,
    });
    if (res === 'ignored') return;
    const hy = target.y - 46;
    if (res === 'blocked') {
      this.fx.spawn('dust-01', proj.x, hy, { scale: 0.7 });
      this.fx.number(proj.x, hy, proj.damage * PLAYER.guard.damageMul, { color: '#9fd8ff' });
      this.fx.addTrauma(FEEL.shakeOnHit * 0.35);
    } else {
      this.fx.spawn('dust-02', proj.x, hy, { scale: 0.6 });
      this.fx.number(proj.x, hy, proj.damage);
      this.fx.hitStop(FEEL.hitStopMs * 0.7);
      this.fx.addTrauma(FEEL.shakeOnHit * 0.7);
    }
  }

  // ------------------------------------------------------------- loop -----
  start() {
    this.last = performance.now();
    const frame = (now) => {
      // Clamp dt so a backgrounded tab doesn't teleport everything.
      const realDt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(realDt);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  update(realDt) {
    this.time += realDt;
    this.input.update();

    const dt = this.fx.update(realDt);
    this.bannerT += realDt;

    if (dt === 0) return; // hit-stop: sim frozen, render still runs

    this.world.update(dt);
    this._updatePlayer(dt);

    for (const [u, brain] of this.brains) {
      if (u.alive) brain.update(dt, this.player, this);
    }

    for (const u of this.units) u.update(dt, this.world, this.units, this.fx);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, this.world, this.units, this.fx, (pr, t) => this._onProjectileHit(pr, t));
      if (p.dead) this.projectiles.splice(i, 1);
    }

    // Reap fully-faded corpses.
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].state === STATE.DEAD) {
        this.brains.delete(this.units[i]);
        this.units.splice(i, 1);
      }
    }

    this._updateFlow(dt);

    const lead = this.input.move;
    this.camera.update(dt, this.player, lead, this.fx);
  }

  _updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) {
      p.vx = p.vy = 0;
      return;
    }

    p.guarding = this.input.guardHeld && !p.busy;

    const mv = this.input.move;
    const mul = p.guarding ? PLAYER.guard.speedMul : 1;
    if (!p.busy) {
      p.vx = mv.x * PLAYER.speed * mul;
      p.vy = mv.y * PLAYER.speed * 0.74 * mul;
      if (Math.abs(mv.x) > 0.12) p.facing = Math.sign(mv.x);
    }

    // Two-hit combo with a chain window.
    this.comboT -= dt;
    if (this.comboT <= 0) this.comboIndex = 0;

    if (this.input.takeAttack() && !p.busy && p.alive) {
      const spec = PLAYER.attack.combo[this.comboIndex % PLAYER.attack.combo.length];
      // Snap toward the nearest enemy so attacks feel like they aim themselves.
      const near = this._nearestEnemy(120);
      if (near) p.facing = Math.sign(near.x - p.x) || p.facing;
      if (p.startAttack(spec)) {
        this.comboIndex = (this.comboIndex + 1) % PLAYER.attack.combo.length;
        this.comboT = PLAYER.attack.comboWindowMs / 1000;
        this.fx.addTrauma(0.05);
      }
    }
  }

  _nearestEnemy(maxDist) {
    let best = null;
    let bd = maxDist;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - this.player.x, (e.y - this.player.y) * 1.4);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  _updateFlow(dt) {
    void dt;
    if (this.state === 'playing') {
      if (!this.player.alive) {
        this.state = 'dead';
        this.bannerT = 0;
        this.banner = { title: 'DEFEATED', subtitle: 'tap / press R to retry' };
        return;
      }
      if (this.enemies.length === 0) {
        if (this.wave + 1 < WAVES.length) {
          this.state = 'clear';
          this.bannerT = 0;
          this.banner = { title: `WAVE ${this.wave + 1} CLEAR`, subtitle: 'next wave incoming' };
        } else {
          this.state = 'won';
          this.bannerT = 0;
          this.banner = { title: 'VICTORY', subtitle: 'tap / press R to play again' };
        }
      }
    } else if (this.state === 'clear' && this.bannerT > 1.6) {
      this.state = 'playing';
      this.banner = null;
      this._startWave(this.wave + 1);
    }
  }

  restart() {
    this.units.length = 0;
    this.projectiles.length = 0;
    this.brains.clear();
    this.fx.particles.length = 0;
    this.fx.numbers.length = 0;
    this.state = 'playing';
    this.banner = null;
    this.comboIndex = 0;
    this._spawnPlayer();
    this._startWave(0);
    this.camera.snapTo(this.player.x, this.player.y);
  }

  // ------------------------------------------------------------ render ----
  /** Display-cutout insets, converted from CSS px to viewport units. */
  _readSafeArea() {
    const probe = document.getElementById('safe-probe');
    if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
    const cs = getComputedStyle(probe);
    const px = (v) => parseFloat(v) || 0;
    return {
      top: px(cs.paddingTop) / this.scale,
      right: px(cs.paddingRight) / this.scale,
      bottom: px(cs.paddingBottom) / this.scale,
      left: px(cs.paddingLeft) / this.scale,
    };
  }

  _resize() {
    const cw = innerWidth;
    const ch = innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, 2.5);

    // Fix world-space height; width follows the device aspect so wide phones
    // see more arena instead of smaller characters.
    //
    // The MIN_VIEW_W floor has to change the *scale* too, not just the width —
    // clamping width alone made the world render wider than the canvas and
    // silently cropped everything off the right edge in portrait.
    const aspect = cw / ch;
    this.viewH = VIEW_H;
    this.viewW = VIEW_H * aspect;
    if (this.viewW < MIN_VIEW_W) {
      this.viewW = MIN_VIEW_W;
      this.viewH = MIN_VIEW_W / aspect; // zoom out rather than crop
    }
    this.scale = cw / this.viewW; // === ch / viewH by construction
    this.portrait = aspect < 0.95;

    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;

    this.camera.viewW = this.viewW;
    this.camera.viewH = this.viewH;
    this.camera.bounds = {
      minX: -TILE * 2,
      minY: -TILE * 2,
      maxX: this.world.pixelW + TILE * 2,
      maxY: this.world.pixelH + TILE * 2,
    };
    this.safe = this._readSafeArea();
    this.input.setViewport(this.viewW, this.viewH, this.safe);
  }

  clientToView(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (cx - r.left) / this.scale, y: (cy - r.top) / this.scale };
  }

  render() {
    const ctx = this.ctx;
    const { viewW, viewH } = this;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#12242e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    this.camera.apply(ctx);

    this.world.drawWater(ctx, this.camera);
    this.world.drawFoam(ctx);
    this.world.drawGround(ctx);

    // Shadows go under everything so they never darken a neighbour's sprite.
    for (const u of this.units) u.drawShadow(ctx);

    // Depth-sorted sprite pass: props and units interleave by feet Y.
    const drawables = this.world.drawables();
    for (const u of this.units) drawables.push({ y: u.depth, draw: (c) => u.draw(c), unit: u });
    for (const p of this.projectiles) drawables.push({ y: p.depth, draw: (c) => p.draw(c) });
    drawables.sort((a, b) => a.y - b.y);

    for (const d of drawables) {
      // Telegraph tint: winding-up enemies flush red so the attack is readable.
      const brain = d.unit ? this.brains.get(d.unit) : null;
      if (brain?.telegraphing) {
        const amt = 0.28 + Math.sin(this.time * 26) * 0.14 * brain.telegraphAmount;
        const base = { flip: d.unit.facing < 0, scaleX: d.unit.sx, scaleY: d.unit.sy };
        d.unit.anim.draw(ctx, d.unit.x, d.unit.y, base);
        d.unit.anim.draw(ctx, d.unit.x, d.unit.y, {
          ...base,
          tint: '#ff5a4a',
          tintAmt: Math.max(0, amt),
        });
        continue;
      }
      d.draw(ctx);
    }

    this.fx.drawParticles(ctx);
    this.world.drawClouds(ctx, this.camera);
    for (const u of this.units) u.drawBar(ctx, this.hud.bars);
    this.fx.drawNumbers(ctx);

    ctx.restore();

    // --- HUD (viewport space, no camera transform) ---
    let banner = null;
    if (this.banner) {
      const t = Math.min(1, this.bannerT / 0.36);
      banner = {
        ...this.banner,
        alpha: t,
        scale: 0.9 + ease.outBack(t) * 0.1,
      };
    }
    this.hud.draw(ctx, {
      viewW,
      viewH,
      player: this.player,
      wave: this.wave + 1,
      waveCount: WAVES.length,
      enemiesLeft: this.enemies.length,
      input: this.input,
      banner,
      safe: this.safe,
    });

    if (this.portrait) this.hud.drawRotateHint(ctx, viewW, viewH, this.time);
  }
}

// Restart binding.
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && window.__game) window.__game.restart();
});
addEventListener('pointerdown', () => {
  const g = window.__game;
  if (g && (g.state === 'dead' || g.state === 'won') && g.bannerT > 0.6) g.restart();
});
