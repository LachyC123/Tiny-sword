/** Follow camera with movement lead, smoothing, shake and world clamping. */

import { FEEL } from '../config.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.viewW = 0;
    this.viewH = 0;
    this.bounds = null; // {minX,minY,maxX,maxY} in world px
  }

  snapTo(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * @param target  the entity to follow
   * @param lead    normalised movement direction {x,y} to push ahead toward
   */
  update(dt, target, lead, fx) {
    const tx = target.x + lead.x * FEEL.cameraLead;
    const ty = target.y - 18 + lead.y * FEEL.cameraLead * 0.6;

    const k = 1 - Math.exp(-FEEL.cameraLerp * dt); // frame-rate independent lerp
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;

    if (this.bounds) {
      const halfW = this.viewW / 2;
      const halfH = this.viewH / 2;
      const { minX, minY, maxX, maxY } = this.bounds;
      // If the world is smaller than the view on an axis, centre on it.
      this.x = maxX - minX < this.viewW
        ? (minX + maxX) / 2
        : Math.min(Math.max(this.x, minX + halfW), maxX - halfW);
      this.y = maxY - minY < this.viewH
        ? (minY + maxY) / 2
        : Math.min(Math.max(this.y, minY + halfH), maxY - halfH);
    }

    this.shakeX = fx?.shakeX ?? 0;
    this.shakeY = fx?.shakeY ?? 0;
  }

  /** Applies the world transform to a context already scaled to the viewport. */
  apply(ctx) {
    ctx.translate(
      Math.round(this.viewW / 2 - this.x + (this.shakeX ?? 0)),
      Math.round(this.viewH / 2 - this.y + (this.shakeY ?? 0))
    );
  }

  /** Screen (virtual viewport) point -> world point. */
  toWorld(sx, sy) {
    return { x: sx - this.viewW / 2 + this.x, y: sy - this.viewH / 2 + this.y };
  }
}
