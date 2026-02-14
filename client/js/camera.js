import { WORLD_WIDTH, GROUND_Y_MAX } from '/shared/constants.js';

export class Camera {
  constructor(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.worldViewWidth = 1200;
    this.x = 0;
    this.targetX = 0;
    this.scale = canvasWidth / this.worldViewWidth;

    this.groundScreenY = canvasHeight * 0.65;
    this.groundBandHeight = canvasHeight * 0.15;
    this.wallScreenY = canvasHeight * 0.35;
    this.skyHeight = this.groundScreenY;
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

  follow(worldX) {
    this.targetX = worldX - this.worldViewWidth / 2;
    this.x += (this.targetX - this.x) * 0.1;
    this.clamp();
  }

  clamp() {
    this.x = Math.max(0, Math.min(this.x, WORLD_WIDTH - this.worldViewWidth));
  }

  worldToScreen(wx, wy, isOnWall = false) {
    const sx = (wx - this.x) * this.scale;
    let sy;
    if (isOnWall) {
      sy = this.wallScreenY;
    } else {
      sy = this.groundScreenY + (wy / GROUND_Y_MAX) * this.groundBandHeight;
    }
    return { x: sx, y: sy };
  }

  screenToWorld(sx, sy) {
    const wx = sx / this.scale + this.x;
    const wy = Math.max(0, Math.min(GROUND_Y_MAX,
      ((sy - this.groundScreenY) / this.groundBandHeight) * GROUND_Y_MAX));
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
