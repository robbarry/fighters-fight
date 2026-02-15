import { GROUND_Y_MAX } from '/shared/constants.js';

const GRAVITY = 800;

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(type, x, y, count = 1, opts = {}) {
    for (let i = 0; i < count; i++) {
      this.particles.push(this._createParticle(type, x, y, opts));
    }
  }

  _createParticle(type, x, y, opts) {
    const p = {
      type,
      x,
      y: opts.isOnWall ? 0 : y, // local Y for wall, world Y for ground
      isOnWall: !!opts.isOnWall,
      vx: 0,
      vy: 0,
      life: 1.0, // 0..1
      decay: 1.0, // per second
      size: 1.0,
      color: '#fff',
      rot: Math.random() * Math.PI * 2,
      vrot: 0,
      ...opts
    };

    switch (type) {
      case 'blood':
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2;
        const speed = 100 + Math.random() * 200;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.decay = 2.0 + Math.random(); // Fast decay
        p.size = 3 + Math.random() * 4;
        p.color = Math.random() > 0.5 ? '#b03131' : '#8a1c1c';
        p.gravity = GRAVITY;
        break;

      case 'spark':
        p.vx = (Math.random() - 0.5) * 300;
        p.vy = (Math.random() - 0.5) * 300;
        p.decay = 4.0;
        p.size = 2 + Math.random() * 2;
        p.color = '#ffeba1';
        break;

      case 'debris':
        p.vx = (Math.random() - 0.5) * 200;
        p.vy = -100 - Math.random() * 200;
        p.decay = 1.0;
        p.size = 4 + Math.random() * 4;
        p.color = Math.random() > 0.5 ? '#555' : '#444';
        p.gravity = GRAVITY;
        p.vrot = (Math.random() - 0.5) * 10;
        break;

      case 'text':
        p.vx = 0;
        p.vy = -60; // Float up
        p.decay = 0.8;
        p.text = opts.text || '';
        p.color = opts.color || '#fff';
        p.size = opts.size || 20; // font size
        break;
        
      case 'shockwave':
        p.decay = 2.0;
        p.size = 10; // Start small
        p.maxSize = opts.size || 100;
        p.color = opts.color || 'rgba(255, 255, 255, 0.5)';
        break;
    }
    return p;
  }

  update(dt) {
    const dtSec = dt / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * dtSec;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.rot += p.vrot * dtSec;

      if (p.gravity) {
        p.vy += p.gravity * dtSec;
      }

      if (p.type === 'shockwave') {
         p.size += (p.maxSize - p.size) * 5 * dtSec;
      }

      // Ground collision
      if (!p.isOnWall && p.gravity && p.y > GROUND_Y_MAX) {
        p.y = GROUND_Y_MAX;
        p.vy *= -0.5;
        p.vx *= 0.8;
      }
    }
  }

  render(ctx, camera) {
    for (const p of this.particles) {
      let x, y;
      if (p.isOnWall) {
        x = (p.x - camera.x) * camera.scale + camera.shakeX;
        y = camera.wallScreenY + camera.shakeY + p.y * (camera.groundBandHeight / GROUND_Y_MAX);
      } else {
        const pos = camera.worldToScreen(p.x, p.y);
        x = pos.x;
        y = pos.y;
      }

      if (x < -50 || x > camera.width + 50) continue;

      ctx.save();
      ctx.globalAlpha = p.life;
      
      if (p.type === 'text') {
        ctx.fillStyle = p.color;
        ctx.font = `bold ${Math.round(p.size * camera.scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, x, y);
        // Stroke
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2 * camera.scale;
        ctx.strokeText(p.text, x, y);
      } else if (p.type === 'shockwave') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * camera.scale;
        ctx.beginPath();
        ctx.ellipse(x, y, p.size * camera.scale, p.size * 0.4 * camera.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        const s = p.size * camera.scale;
        ctx.fillRect(-s / 2, -s / 2, s, s);
      }
      
      ctx.restore();
    }
  }
}
