/**
 * Unified input: floating touch stick + on-screen buttons, with a keyboard
 * fallback for desktop.
 *
 * Controls are laid out in *virtual viewport* coordinates so the HUD and the
 * hit-testing agree by construction — `touchLayout()` is the single source of
 * truth for both.
 */

const KEY_MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};
const KEY_ATTACK = new Set(['Space', 'KeyJ', 'Enter']);
const KEY_GUARD = new Set(['ShiftLeft', 'ShiftRight', 'KeyK']);

export const STICK_RADIUS = 58;

export const NO_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Button/stick placement for a given virtual viewport size.
 * `safe` are display-cutout insets in viewport units — on a notched phone in
 * landscape the buttons must not sit under the rounded corner or home bar.
 */
export function touchLayout(viewW, viewH, safe = NO_SAFE) {
  const pad = 30;
  const r = 46;
  const right = viewW - safe.right;
  const bottom = viewH - safe.bottom;
  return {
    attack: { x: right - pad - r, y: bottom - pad - r, r },
    guard: { x: right - pad - r * 2 - 42, y: bottom - pad - r * 0.72, r: r * 0.72 },
    stickZoneW: viewW * 0.5,
  };
}

export class Input {
  /**
   * @param canvas  the game canvas
   * @param toView  fn(clientX, clientY) -> {x,y} in virtual viewport space
   */
  constructor(canvas, toView) {
    this.canvas = canvas;
    this.toView = toView;
    this.viewW = 0;
    this.viewH = 0;
    this.safe = { ...NO_SAFE };

    this.move = { x: 0, y: 0 };
    this.guardHeld = false;
    // Seeded from the pointer type so a touch device shows its controls before
    // the first tap; a real touch flips it on regardless.
    this.usingTouch =
      typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    this._attackQueued = false;
    this._keys = new Set();
    this._stick = null;   // {id, ox, oy, x, y}
    this._touchBtn = { attack: null, guard: null };

    this._bindKeyboard();
    this._bindPointer();
  }

  /** Consumes a queued attack press (edge-triggered). */
  takeAttack() {
    const v = this._attackQueued;
    this._attackQueued = false;
    return v;
  }

  get stick() {
    return this._stick;
  }

  setViewport(w, h, safe = NO_SAFE) {
    this.viewW = w;
    this.viewH = h;
    this.safe = safe;
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (KEY_MOVE[e.code] || KEY_ATTACK.has(e.code) || KEY_GUARD.has(e.code)) e.preventDefault();
      this._keys.add(e.code);
      if (KEY_ATTACK.has(e.code)) this._attackQueued = true;
    });
    addEventListener('keyup', (e) => this._keys.delete(e.code));
    addEventListener('blur', () => this._keys.clear());
  }

  _bindPointer() {
    const c = this.canvas;
    const opts = { passive: false };

    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      if (e.pointerType === 'touch') this.usingTouch = true;
      const p = this.toView(e.clientX, e.clientY);
      const L = touchLayout(this.viewW, this.viewH, this.safe);

      if (hits(p, L.attack)) {
        this._touchBtn.attack = e.pointerId;
        this._attackQueued = true;
        return;
      }
      if (hits(p, L.guard)) {
        this._touchBtn.guard = e.pointerId;
        return;
      }
      if (p.x < L.stickZoneW && this._stick === null) {
        this._stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    }, opts);

    c.addEventListener('pointermove', (e) => {
      if (this._stick && this._stick.id === e.pointerId) {
        e.preventDefault();
        const p = this.toView(e.clientX, e.clientY);
        this._stick.x = p.x;
        this._stick.y = p.y;
      }
    }, opts);

    const release = (e) => {
      if (this._stick && this._stick.id === e.pointerId) this._stick = null;
      if (this._touchBtn.attack === e.pointerId) this._touchBtn.attack = null;
      if (this._touchBtn.guard === e.pointerId) this._touchBtn.guard = null;
    };
    c.addEventListener('pointerup', release, opts);
    c.addEventListener('pointercancel', release, opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Folds keyboard + touch into `move` / `guardHeld`. Call once per frame. */
  update() {
    let mx = 0;
    let my = 0;

    for (const code of this._keys) {
      const d = KEY_MOVE[code];
      if (d) {
        mx += d[0];
        my += d[1];
      }
    }

    if (this._stick) {
      const dx = this._stick.x - this._stick.ox;
      const dy = this._stick.y - this._stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 6) {
        const clamped = Math.min(len, STICK_RADIUS) / STICK_RADIUS;
        mx += (dx / len) * clamped;
        my += (dy / len) * clamped;
      }
    }

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = mx;
    this.move.y = my;

    this.guardHeld =
      this._touchBtn.guard !== null || [...this._keys].some((k) => KEY_GUARD.has(k));
  }

  get attackHeld() {
    return this._touchBtn.attack !== null || [...this._keys].some((k) => KEY_ATTACK.has(k));
  }
}

function hits(p, btn) {
  return Math.hypot(p.x - btn.x, p.y - btn.y) <= btn.r * 1.25;
}
