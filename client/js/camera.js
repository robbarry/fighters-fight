import { WORLD_WIDTH, GROUND_Y_MAX } from '/shared/constants.js';

export class Camera {
  constructor(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.worldViewWidth = 1600;
    this._baseWorldViewWidth = this.worldViewWidth;
    this._overview = false;
    this.x = 0;
    this.targetX = 0;
    this.lookOffset = 0; // Dynamic offset based on mouse
    this.scale = canvasWidth / this.worldViewWidth;

    this.groundScreenY = canvasHeight * 0.65;
    this.groundBandHeight = canvasHeight * 0.15;
    this.wallScreenY = canvasHeight * 0.35;
    this.skyHeight = this.groundScreenY;

    // Screen-space shake offsets (pixels).
    this.shakeX = 0;
    this.shakeY = 0;
    this._shakeMs = 0;
    this._shakeTotalMs = 0;
    this._shakeIntensity = 0;
  }

  setOverview(enabled) {
    this._overview = !!enabled;
    this.worldViewWidth = this._overview ? WORLD_WIDTH : this._baseWorldViewWidth;
    this.scale = this.canvasWidth / this.worldViewWidth;

    if (this._overview) {
      this.x = 0;
      this.targetX = 0;
      this.lookOffset = 0;
    }
    this.clamp();
  }

  isOverview() {
    return this._overview;
  }

  resize(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.scale = canvasWidth / this.worldViewWidth;
    this.groundScreenY = canvasHeight * 0.65;
    this.groundBandHeight = canvasHeight * 0.15;
    this.wallScreenY = canvasHeight * 0.35;
    this.skyHeight = this.groundScreenY;
  }

  update(dtMs) {
    if (this._shakeMs > 0) {
      this._shakeMs -= dtMs;
      if (this._shakeMs < 0) this._shakeMs = 0;

      const denom = this._shakeTotalMs > 0 ? this._shakeTotalMs : 1;
      const k = this._shakeMs / denom;
      const intensity = this._shakeIntensity * k;

      // Fresh random each frame keeps it punchy.
      this.shakeX = (Math.random() * 2 - 1) * intensity;
      this.shakeY = (Math.random() * 2 - 1) * intensity * 0.65;

      if (this._shakeMs === 0) {
        this.shakeX = 0;
        this.shakeY = 0;
        this._shakeTotalMs = 0;
        this._shakeIntensity = 0;
      }
    }
  }

  shake(intensityPx, durationMs) {
    if (!Number.isFinite(intensityPx) || !Number.isFinite(durationMs)) return;
    if (intensityPx <= 0 || durationMs <= 0) return;

    // If multiple shakes happen close together, keep the stronger/longer one.
    this._shakeIntensity = Math.max(this._shakeIntensity, intensityPx);
    this._shakeMs = Math.max(this._shakeMs, durationMs);
    this._shakeTotalMs = Math.max(this._shakeTotalMs, durationMs);
  }

  follow(worldX, mouseXRatio = 0.5) {
    // worldX is the player's center.
    // mouseXRatio is 0..1 (0=left edge, 1=right edge).
    
    // Shift camera target based on mouse position (Look Ahead)
    // Max shift is 40% of view width in either direction.
    const shift = (mouseXRatio - 0.5) * this.worldViewWidth * 0.8;
    this.lookOffset += (shift - this.lookOffset) * 0.1; // Smooth it out
    
    this.targetX = worldX - this.worldViewWidth / 2 + this.lookOffset;
    
    // Soft follow
    this.x += (this.targetX - this.x) * 0.1;
    this.clamp();
  }

  clamp() {
    // Ensure we don't show "void" outside world bounds
    const minX = -100; 
    const maxX = WORLD_WIDTH - this.worldViewWidth + 100;
    this.x = Math.max(minX, Math.min(this.x, maxX));
  }

  worldToScreen(wx, wy, isOnWall = false) {
    const sx = (wx - this.x) * this.scale + this.shakeX;
    let sy;
    if (isOnWall) {
      sy = this.wallScreenY + this.shakeY;
    } else {
      sy = this.groundScreenY + (wy / GROUND_Y_MAX) * this.groundBandHeight + this.shakeY;
    }
    return { x: sx, y: sy };
  }

  screenToWorld(sx, sy) {
    const ux = sx - this.shakeX;
    const uy = sy - this.shakeY;

    // Linear mapping allowing aiming above/below horizon.
    // uy at groundScreenY => wy = 0.
    // uy above groundScreenY => wy < 0 (Sky).
    // uy below groundScreenY => wy > 0 (Ground).
    const t = (uy - this.groundScreenY) / this.groundBandHeight;
    const wy = t * GROUND_Y_MAX;

    const wx = ux / this.scale + this.x;
    return { x: wx, y: wy };
  }

  isOnScreen(wx) {
    const sx = (wx - this.x) * this.scale;
    return sx > -50 && sx < this.canvasWidth + 50;
  }

  distFromCenter(wx) {
    const center = this.x + this.worldViewWidth / 2;
    return Math.abs(wx - center);
  }
}
