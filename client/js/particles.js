import { GROUND_Y_MAX } from '/shared/constants.js';

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.pool = [];
  }

  _getParticle() {
    if (this.pool.length > 0) return this.pool.pop();
    return {};
  }

  emit(type, x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const p = this._getParticle();
      p.isOnWall = !!opts.isOnWall;
      p.x = x;
      // For wall particles, treat y as a local offset around the battlements.
      p.y = p.isOnWall ? 0 : y;
      p.life = 0;

      switch (type) {
        case 'hit_spark':
          p.vx = (Math.random() - 0.5) * 200;
          p.vy = (Math.random() - 0.5) * 200;
          p.maxLife = 300 + Math.random() * 200;
          p.size = 2 + Math.random() * 2;
          p.color = Math.random() > 0.5 ? '#ffdd44' : '#ff8844';
          break;
        case 'death':
          p.vx = (Math.random() - 0.5) * 150;
          p.vy = -Math.random() * 100 - 50;
          p.maxLife = 500 + Math.random() * 500;
          p.size = 3 + Math.random() * 3;
          p.color = Math.random() > 0.3 ? '#cc4444' : '#883333';
          break;
        case 'gate_break':
          p.vx = (Math.random() - 0.5) * 300;
          p.vy = -Math.random() * 200;
          p.maxLife = 800 + Math.random() * 400;
          p.size = 3 + Math.random() * 5;
          p.color = Math.random() > 0.5 ? '#8B7355' : '#666666';
          break;
        default:
          p.vx = (Math.random() - 0.5) * 50;
          p.vy = -Math.random() * 50;
          p.maxLife = 400;
          p.size = 2;
          p.color = '#ffffff';
      }

      this.particles.push(p);
    }
  }

  update(dt) {
    const dtSec = dt / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += 300 * dtSec; // gravity
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        this.pool.push(p);
      }
    }
  }

  render(ctx, camera) {
    const yScale = camera.groundBandHeight / GROUND_Y_MAX;
    for (const p of this.particles) {
      let x, y;
      if (p.isOnWall) {
        x = (p.x - camera.x) * camera.scale;
        y = camera.wallScreenY + p.y * yScale;
      } else {
        const pos = camera.worldToScreen(p.x, p.y);
        x = pos.x;
        y = pos.y;
      }
      const alpha = 1 - (p.life / p.maxLife);
      const size = p.size * camera.scale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.restore();
    }
  }
}
