import { GROUND_Y_MAX } from '/shared/constants.js';

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.pool = [];
    this._gravity = 320; // world units / sec^2
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
      p.shape = 'square';
      p.rot = 0;
      p.vrot = 0;
      p.len = 0;
      p.bounce = false;

      switch (type) {
        case 'hit_spark':
          p.vx = (Math.random() - 0.5) * 200;
          p.vy = (Math.random() - 0.5) * 200;
          p.maxLife = 300 + Math.random() * 200;
          p.size = 2 + Math.random() * 2;
          p.color = Math.random() > 0.5 ? '#ffdd44' : '#ff8844';
          break;
        case 'blood': {
          // Directional streaks: draw a line aligned with velocity.
          p.shape = 'line';
          const dir = Math.random() * Math.PI * 2;
          const speed = 90 + Math.random() * 170;
          p.vx = Math.cos(dir) * speed;
          p.vy = Math.sin(dir) * speed - (60 + Math.random() * 120);
          p.maxLife = 420 + Math.random() * 280;
          p.size = 1.1 + Math.random() * 1.2; // stroke width at scale=1
          p.len = 10 + Math.random() * 16; // line length at scale=1
          p.color = Math.random() > 0.5 ? '#b03131' : '#7a2626';
          break;
        }
        case 'debris': {
          p.shape = 'chunk';
          p.vx = (Math.random() - 0.5) * 340;
          p.vy = -Math.random() * 220;
          p.maxLife = 900 + Math.random() * 600;
          p.size = 2 + Math.random() * 5;
          p.color = Math.random() > 0.55 ? '#777777' : '#8B7355';
          p.rot = Math.random() * Math.PI * 2;
          p.vrot = (Math.random() - 0.5) * 10; // rad/sec
          p.bounce = true;
          break;
        }
        case 'death':
          p.vx = (Math.random() - 0.5) * 150;
          p.vy = -Math.random() * 100 - 50;
          p.maxLife = 500 + Math.random() * 500;
          p.size = 3 + Math.random() * 3;
          p.color = Math.random() > 0.3 ? '#cc4444' : '#883333';
          break;
        case 'gate_break':
          p.shape = 'chunk';
          p.vx = (Math.random() - 0.5) * 380;
          p.vy = -Math.random() * 260;
          p.maxLife = 900 + Math.random() * 600;
          p.size = 3 + Math.random() * 6;
          p.color = Math.random() > 0.6 ? '#8B7355' : '#666666';
          p.rot = Math.random() * Math.PI * 2;
          p.vrot = (Math.random() - 0.5) * 8;
          p.bounce = true;
          break;
        case 'shockwave':
          p.shape = 'shockwave';
          p.vx = 0;
          p.vy = 0;
          p.maxLife = 500;
          p.size = 10;
          p.maxSize = opts.size || 100;
          p.color = opts.color || 'rgba(255, 255, 255, 0.5)';
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
      p.vy += this._gravity * dtSec; // gravity
      p.rot += p.vrot * dtSec;

      if (p.shape === 'shockwave') {
        p.size += (p.maxSize - p.size) * 5 * dtSec;
      }

      // Simple ground bounce for world-space particles.
      if (!p.isOnWall && p.bounce && p.y >= GROUND_Y_MAX) {
        p.y = GROUND_Y_MAX;
        if (p.vy > 0) p.vy *= -0.45;
        p.vx *= 0.78;
        // Settle quickly to avoid infinite micro-bounces.
        if (Math.abs(p.vy) < 45) {
          p.vy = 0;
          p.vrot *= 0.6;
        }
      }

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
        x = (p.x - camera.x) * camera.scale + camera.shakeX;
        y = camera.wallScreenY + camera.shakeY + p.y * yScale;
      } else {
        const pos = camera.worldToScreen(p.x, p.y);
        x = pos.x;
        y = pos.y;
      }
      const alpha = 1 - (p.life / p.maxLife);
      const size = p.size * camera.scale;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.shape === 'line') {
        const vxS = p.vx * camera.scale;
        const vyS = p.vy * yScale;
        const sp = Math.sqrt(vxS * vxS + vyS * vyS) || 1;
        const ux = vxS / sp;
        const uy = vyS / sp;
        const len = (p.len || 12) * camera.scale;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = (p.size || 1.5) * camera.scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - ux * len, y - uy * len);
        ctx.stroke();
      } else if (p.shape === 'shockwave') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * camera.scale;
        ctx.beginPath();
        ctx.ellipse(x, y, p.size * camera.scale, p.size * 0.4 * camera.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'chunk') {
        ctx.translate(x, y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-size / 2, -size / 2, size, size * 0.85);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-size / 2, -size / 2, size, size * 0.85);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }

      ctx.restore();
    }
  }
}
