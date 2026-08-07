/**
 * HUD built from the pack's own UI kit.
 *
 * The bar and banner assets are slice-kits laid out on a 64px grid with
 * spacer cells (verified by alpha-run analysis):
 *   bigbar-base 320x64  -> caps at x0 / x256, tileable middle at x128
 *   banner      448x448 -> 9-slice, columns at 0/192/320, rows at 0/192/320
 */

import { touchLayout, STICK_RADIUS, NO_SAFE } from '../core/input.js';
import { roundRect } from './unit.js';

const CELL = 64;

// Measured from smallbar-fill.png by tools/build_manifest.py's bbox pass.
const SMALL_FILL_SRC = { y: 30, h: 4 };

/** Draws a 3-slice horizontal bar frame of total width `w`. */
export function drawBarFrame(ctx, img, x, y, w, s) {
  const cap = CELL * s;
  ctx.drawImage(img, 0, 0, CELL, CELL, x, y, cap, cap);
  ctx.drawImage(img, 128, 0, CELL, CELL, x + cap, y, Math.max(0, w - cap * 2), cap);
  ctx.drawImage(img, 256, 0, CELL, CELL, x + w - cap, y, cap, cap);
}

/** Draws the bar's fill, clipped to `pct` of the inner span. */
export function drawBarFill(ctx, img, x, y, w, s, pct) {
  const inset = 56 * s;
  const innerX = x + inset;
  const innerW = Math.max(0, w - inset * 2);
  const fw = innerW * Math.max(0, Math.min(1, pct));
  if (fw <= 0.5) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerX, y, fw, CELL * s);
  ctx.clip();
  ctx.drawImage(img, 0, 0, CELL, CELL, innerX, y, innerW, CELL * s);
  ctx.restore();
}

/** 9-slice panel from banner.png. */
export function drawPanel(ctx, img, x, y, w, h, s) {
  const C = 128 * s;   // corner size
  const M = 64 * s;    // middle sample size
  const midW = Math.max(0, w - C * 2);
  const midH = Math.max(0, h - C * 2);
  const sx = [0, 192, 320];
  const sy = [0, 192, 320];
  const sw = [128, 64, 128];
  const sh = [128, 64, 128];
  const dx = [x, x + C, x + w - C];
  const dy = [y, y + C, y + h - C];
  const dw = [C, midW, C];
  const dh = [C, midH, C];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (dw[c] <= 0 || dh[r] <= 0) continue;
      ctx.drawImage(img, sx[c], sy[r], sw[c], sh[r], dx[c], dy[r], dw[c], dh[r]);
    }
  }
  void M;
}

export class Hud {
  constructor(ui, images) {
    this.barBase = images[ui.bars.find((p) => p.includes('bigbar-base'))];
    this.barFill = images[ui.bars.find((p) => p.includes('bigbar-fill'))];
    this.smallFill = images[ui.bars.find((p) => p.includes('smallbar-fill'))];
    this.banner = images[ui.banners.find((p) => p.includes('banner.png'))];
    this.avatar = images[ui.avatar.file];
    this.avatarBox = ui.avatar.bbox;
    this.btnAttack = images[ui.buttons.find((p) => p.includes('smallredroundbutton-regular'))];
    this.btnAttackDown = images[ui.buttons.find((p) => p.includes('smallredroundbutton-pressed'))];
    this.btnGuard = images[ui.buttons.find((p) => p.includes('smallblueroundbutton-regular'))];
    this.btnGuardDown = images[ui.buttons.find((p) => p.includes('smallblueroundbutton-pressed'))];
    this.sword = images[ui.swords?.[0]];
  }

  /**
   * Fill sub-rect for the floating enemy bars. smallbar-fill's artwork is only
   * rows 30..33 of its 64px cell, so sampling the whole cell into a 7px bar
   * would render it visually empty.
   */
  get bars() {
    this._barsRef ??= { fill: this.smallFill, fillSrc: SMALL_FILL_SRC };
    return this._barsRef;
  }

  draw(ctx, { viewW, viewH, player, wave, waveCount, enemiesLeft, input, banner, safe = NO_SAFE }) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    this._drawPlayerPlate(ctx, player, 14 + safe.left, 12 + safe.top);
    this._drawWave(ctx, viewW - safe.right, 14 + safe.top, wave, waveCount, enemiesLeft);
    this._drawTouch(ctx, viewW, viewH, input, safe);
    if (banner) this._drawBanner(ctx, viewW, viewH, banner);

    ctx.restore();
  }

  _drawPlayerPlate(ctx, player, x, y) {
    const s = 0.5;
    const barW = 210;
    const av = 46;

    // Portrait, circular-masked, with a dark plate behind.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + av / 2, y + av / 2, av / 2 + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24,34,28,0.9)';
    ctx.fill();
    ctx.strokeStyle = '#2b3f2f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + av / 2, y + av / 2, av / 2, 0, Math.PI * 2);
    ctx.clip();
    // Crop to the portrait's actual content so it fills the medallion instead
    // of floating inside 256px of mostly-empty canvas.
    const bb = this.avatarBox;
    const side = Math.max(bb.w, bb.h);
    const k = (av * 1.12) / side;
    ctx.drawImage(
      this.avatar,
      bb.left, bb.top, bb.w, bb.h,
      x + av / 2 - (bb.w * k) / 2,
      y + av / 2 - (bb.h * k) / 2 - av * 0.06,
      bb.w * k, bb.h * k
    );
    ctx.restore();

    const bx = x + av + 8;
    const by = y + 4;
    drawBarFrame(ctx, this.barBase, bx, by, barW, s);
    drawBarFill(ctx, this.barFill, bx, by, barW, s, player.hp / player.maxHp);

    ctx.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(18,26,20,0.9)';
    ctx.fillStyle = '#e7f0d8';
    const label = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    ctx.strokeText(label, bx + 30, by + 34);
    ctx.fillText(label, bx + 30, by + 34);
  }

  _drawWave(ctx, right, y, wave, waveCount, enemiesLeft) {
    ctx.font = '800 13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(18,26,20,0.92)';
    ctx.fillStyle = '#f2e6c8';
    const a = `WAVE ${wave} / ${waveCount}`;
    const b = `${enemiesLeft} LEFT`;
    ctx.strokeText(a, right - 16, y);
    ctx.fillText(a, right - 16, y);
    ctx.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#c9d8b4';
    ctx.strokeText(b, right - 16, y + 18);
    ctx.fillText(b, right - 16, y + 18);
  }

  _drawTouch(ctx, viewW, viewH, input, safe = NO_SAFE) {
    const L = touchLayout(viewW, viewH, safe);

    // Floating stick — only rendered while a finger is down.
    if (input.stick) {
      const st = input.stick;
      const dx = st.x - st.ox;
      const dy = st.y - st.oy;
      const len = Math.hypot(dx, dy);
      const cl = Math.min(len, STICK_RADIUS);
      const nx = len > 0.001 ? st.ox + (dx / len) * cl : st.ox;
      const ny = len > 0.001 ? st.oy + (dy / len) * cl : st.oy;

      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#0d1a12';
      ctx.beginPath();
      ctx.arc(st.ox, st.oy, STICK_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#cfe3c8';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#e7f0d8';
      ctx.beginPath();
      ctx.arc(nx, ny, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // On a mouse-driven device the on-screen buttons are dead weight — show the
    // key hints instead of translucent controls nobody can press usefully.
    if (!input.usingTouch) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#cfe3c8';
      ctx.fillText('WASD move · J/SPACE attack · K/SHIFT guard', viewW - 16 - safe.right, viewH - 10 - safe.bottom);
      ctx.restore();
      return;
    }

    const btn = (b, img, imgDown, held, glyph) => {
      const d = b.r * 2 * 1.42;
      const src = held ? imgDown : img;
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.drawImage(src, b.x - d / 2, b.y - d / 2 + (held ? 2 : 0), d, d);
      ctx.globalAlpha = 1;
      ctx.font = '800 12px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(18,26,20,0.85)';
      ctx.fillStyle = '#fdf3dd';
      ctx.strokeText(glyph, b.x, b.y + (held ? 2 : 0));
      ctx.fillText(glyph, b.x, b.y + (held ? 2 : 0));
      ctx.restore();
    };

    btn(L.attack, this.btnAttack, this.btnAttackDown, input.attackHeld, 'ATK');
    btn(L.guard, this.btnGuard, this.btnGuardDown, input.guardHeld, 'DEF');
  }

  /**
   * The arena is framed for landscape. Rather than letting portrait render a
   * tall, badly-composed view, ask for a rotate — the sim keeps running
   * underneath so turning the device resumes seamlessly.
   */
  drawRotateHint(ctx, viewW, viewH, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,20,24,0.82)';
    ctx.fillRect(0, 0, viewW, viewH);

    const cx = viewW / 2;
    const cy = viewH / 2;
    const w = 74;
    const h = 124;
    const tilt = Math.sin(t * 2) * 0.34 - 0.34;

    ctx.translate(cx, cy - 26);
    ctx.rotate(tilt);
    ctx.strokeStyle = '#cfe3c8';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    roundRect(ctx, -w / 2, -h / 2, w, h, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(207,227,200,0.18)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e7f0d8';
    ctx.font = '800 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('ROTATE YOUR DEVICE', cx, cy + 74);
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#93ab8e';
    ctx.fillText('this one wants landscape', cx, cy + 96);
    ctx.restore();
  }

  _drawBanner(ctx, viewW, viewH, banner) {
    const { title, subtitle, alpha = 1, scale = 1 } = banner;
    const w = 300 * scale;
    const h = 168 * scale;
    const x = viewW / 2 - w / 2;
    const y = viewH / 2 - h / 2 - 10;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8,14,12,0.45)';
    ctx.fillRect(0, 0, viewW, viewH);
    drawPanel(ctx, this.banner, x, y, w, h, 0.42);

    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(26 * scale)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(60,40,22,0.55)';
    ctx.fillStyle = '#5a3d21';
    ctx.strokeText(title, viewW / 2, y + h * 0.45);
    ctx.fillText(title, viewW / 2, y + h * 0.45);

    if (subtitle) {
      ctx.font = `700 ${Math.round(12 * scale)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.lineWidth = 4;
      ctx.fillStyle = '#7a5a34';
      ctx.strokeText(subtitle, viewW / 2, y + h * 0.66);
      ctx.fillText(subtitle, viewW / 2, y + h * 0.66);
    }
    ctx.restore();
  }
}

export { roundRect };
