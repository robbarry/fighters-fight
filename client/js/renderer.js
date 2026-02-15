import { TEAM_BLUE, TEAM_RED, TYPE_SWORD, TYPE_SPEAR, TYPE_ARCHER, TYPE_GUNNER, TYPE_CATAPULT,
	         STATE_DEAD, STATE_BLOCK, STATE_ATTACK, STATE_RESPAWNING, STATE_SPECTATING,
	         BODY_WIDTH, BODY_HEIGHT, HEAD_RADIUS, ROYAL_SCALE,
	         CASTLE_WIDTH, BLUE_CASTLE_X, RED_CASTLE_X, WORLD_WIDTH, GROUND_Y_MAX,
	         GATE_HP, PROJ_ARROW, PROJ_ROCK, PROJ_BULLET,
	         ARROW_RANGE, ROCK_RANGE, BULLET_RANGE,
           DEATH_ANIM_MS,
           PHASE_COUNTDOWN, PHASE_ARMY_MARCH, PHASE_OPEN_BATTLE,
           PHASE_CASTLE_ASSAULT, PHASE_FINAL_STAND, PHASE_VICTORY } from '/shared/constants.js';

const BLUE_COLOR = '#4488ff';
const BLUE_DARK = '#2266cc';
const RED_COLOR = '#ff4444';
const RED_DARK = '#cc2222';
const CASTLE_COLOR = '#888888';
const CASTLE_DARK = '#666666';
const GATE_COLOR = '#554433';

if (globalThis.CanvasRenderingContext2D && !globalThis.CanvasRenderingContext2D.prototype.roundRect) {
  globalThis.CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;

    this._animTime = 0;
    this._hitTimers = new Map(); // entityId -> ms remaining
    this._deathTimers = new Map(); // entityId -> ms remaining
    this._tracers = []; // { attackerId, victimId, ms }
    this._aimLines = []; // { shooterId, tx, ty, ms }

    // Background Layers (Parallax)
    this._bgSky = this._createSkyGradient();
    this._bgMountains = this._createMountains();
    this._bgTrees = this._createTrees();
  }

  update(dtMs) {
    this._animTime += dtMs / 1000;

    // Hit flashes
    for (const [id, ms] of this._hitTimers) {
      const next = ms - dtMs;
      if (next <= 0) this._hitTimers.delete(id);
      else this._hitTimers.set(id, next);
    }

    // Death timers
    for (const [id, ms] of this._deathTimers) {
      const next = ms - dtMs;
      if (next <= 0) this._deathTimers.delete(id);
      else this._deathTimers.set(id, next);
    }

    // Tracers
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      this._tracers[i].ms -= dtMs;
      if (this._tracers[i].ms <= 0) this._tracers.splice(i, 1);
    }

    // Aim Lines
    for (let i = this._aimLines.length - 1; i >= 0; i--) {
      this._aimLines[i].ms -= dtMs;
      if (this._aimLines[i].ms <= 0) this._aimLines.splice(i, 1);
    }
  }

  flashHit(entityId) {
    if (entityId == null) return;
    this._hitTimers.set(entityId, 150);
  }

  addTracer(attackerId, victimId) {
    if (attackerId == null || victimId == null) return;
    this._tracers.push({ attackerId, victimId, ms: 150 });
  }

  addAimLine(shooterId, tx, ty, targetOnWall = false, ms = 320) {
    this._aimLines.push({ shooterId, tx, ty, ms, total: ms });
  }

  // --- Background Generation ---

  _createSkyGradient() {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 600;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, '#87CEEB'); // Sky Blue
    g.addColorStop(1, '#E0F7FA'); // Light Cyan
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1, 600);
    return c;
  }

  _createMountains() {
    const w = 2000;
    const h = 400;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    
    ctx.fillStyle = '#a8b0c0';
    ctx.beginPath();
    ctx.moveTo(0, h);
    let x = 0;
    while(x < w) {
        const peakH = 100 + Math.random() * 200;
        const peakW = 100 + Math.random() * 200;
        ctx.lineTo(x + peakW/2, h - peakH);
        ctx.lineTo(x + peakW, h);
        x += peakW;
    }
    ctx.lineTo(w, h);
    ctx.fill();
    return c;
  }

  _createTrees() {
      const w = 1000;
      const h = 200;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      
      // Random trees
      for(let i=0; i<20; i++) {
          const x = Math.random() * w;
          const th = 40 + Math.random() * 60;
          
          // Trunk
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(x - 5, h - th, 10, th);
          
          // Leaves
          ctx.fillStyle = '#388E3C';
          ctx.beginPath();
          ctx.arc(x, h - th, 25, 0, Math.PI*2);
          ctx.fill();
      }
      return c;
  }

  // --- Main Render ---

  render(snapshot, localPlayerId) {
    if (!snapshot) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Sky
    ctx.drawImage(this._bgSky, 0, 0, w, h);

    // 2. Parallax Layers
    // Mountains (slow)
    const mtnX = -(cam.x * 0.1) % this._bgMountains.width;
    ctx.drawImage(this._bgMountains, mtnX, h - 350 - cam.wallScreenY*0.2); // Position relative to horizon
    ctx.drawImage(this._bgMountains, mtnX + this._bgMountains.width, h - 350 - cam.wallScreenY*0.2);

    // Trees (medium)
    const treeX = -(cam.x * 0.4) % this._bgTrees.width;
    const groundY = cam.groundScreenY + cam.shakeY;
    ctx.drawImage(this._bgTrees, treeX, groundY - 180);
    ctx.drawImage(this._bgTrees, treeX + this._bgTrees.width, groundY - 180);

    // 3. Ground
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, groundY, w, h - groundY);
    
    // Texture
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    const stripeW = 100 * cam.scale;
    const offX = -(cam.x * cam.scale) % stripeW;
    for(let x = offX; x < w; x+=stripeW) {
        ctx.fillRect(x, groundY, stripeW/2, h-groundY);
    }
    
    // 4. Castles
    this.drawCastle(ctx, cam, TEAM_BLUE, BLUE_CASTLE_X);
    this.drawCastle(ctx, cam, TEAM_RED, RED_CASTLE_X);
    this.drawGates(ctx, cam, snapshot.gates);

    // 5. Entities
    const drawables = [];
    const entityMap = new Map();

    // Soldiers
    if (snapshot.soldiers) {
      for (const s of snapshot.soldiers) {
        // [id, type, team, x, y, hp, state, facing, isOnWall]
        const d = {
          kind: 'soldier', id: s[0], type: s[1], team: s[2],
          x: s[3], y: s[4], hp: s[5], state: s[6], facing: s[7], isOnWall: !!s[8],
          maxHp: (s[1] === TYPE_ARCHER || s[1] === TYPE_GUNNER) ? 30 : 40
        };
        drawables.push(d);
        entityMap.set(d.id, d);
      }
    }

    // Players
    if (snapshot.players) {
      for (const p of snapshot.players) {
        // [id, role, team, x, y, hp, state, facing, lives, isOnWall]
        const d = {
          kind: 'player', id: p[0], type: p[1], team: p[2],
          x: p[3], y: p[4], hp: p[5], state: p[6], facing: p[7], isOnWall: !!p[9],
          lives: p[8], isPlayer: true, isLocal: p[0] === localPlayerId,
          maxHp: 40
        };
        drawables.push(d);
        entityMap.set(d.id, d);
      }
    }

    // Royals
    if (snapshot.royals) {
      for (const r of snapshot.royals) {
        // [id, isKing, team, x, y, hp, state, facing]
        const d = {
          kind: 'royal', id: r[0], type: 'royal', team: r[2],
          x: r[3], y: r[4], hp: r[5], state: r[6], facing: r[7], isOnWall: false,
          isRoyal: true, isKing: !!r[1], maxHp: 60
        };
        drawables.push(d);
        entityMap.set(d.id, d);
      }
    }

    // Sort by Y
    drawables.sort((a, b) => {
        if (a.isOnWall !== b.isOnWall) return a.isOnWall ? -1 : 1;
        return a.y - b.y;
    });

    // Draw Aim Lines
    let localTeam = null;
    if (localPlayerId) {
        const lp = entityMap.get(localPlayerId);
        if (lp) localTeam = lp.team;
    }
    this.drawAimLines(ctx, cam, entityMap, localTeam);

    // Draw Entities
    for (const d of drawables) {
        if (!cam.isOnScreen(d.x)) continue;
        
        if (d.state === STATE_DEAD) {
             if (!this._deathTimers.has(d.id)) this._deathTimers.set(d.id, DEATH_ANIM_MS);
             this.drawDeadEntity(ctx, cam, d);
        } else if (d.state !== STATE_RESPAWNING && d.state !== STATE_SPECTATING) {
             this.drawEntity(ctx, cam, d);
        }
    }
    
    // Draw Tracers
    this.drawTracers(ctx, cam, entityMap);

    // 6. Projectiles
    if (snapshot.projectiles) {
        for (const p of snapshot.projectiles) {
            // [id, type, team, x, y, ownerId, dist]
             if (!cam.isOnScreen(p[3])) continue;
             this.drawProjectile(ctx, cam, p);
        }
    }

    // 7. Vignette
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, h * 0.4, cx, cy, h * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // --- Entity Drawing ---

  drawEntity(ctx, cam, d) {
    const pos = cam.worldToScreen(d.x, d.y, d.isOnWall);
    const scale = (d.isRoyal ? 1.4 : 1.0) * cam.scale;
    const flash = this._hitTimers.get(d.id) > 0;
    
    ctx.save();
    ctx.translate(pos.x, pos.y);
    
    // Flip if facing left (FACING_LEFT = 1)
    const dir = d.facing === 1 ? -1 : 1;
    ctx.scale(dir * scale, scale);

    // Animation
    const walkCycle = Math.sin(this._animTime * 15 + d.id);
    const isMoving = (d.state === 1 || d.state === 3); // MARCH or ATTACK
    const bob = isMoving ? Math.abs(walkCycle) * 3 : 0;
    const rot = isMoving ? walkCycle * 0.1 : 0;
    
    ctx.translate(0, -bob);
    ctx.rotate(rot);

    // Colors
    const teamColor = d.team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    const bodyColor = flash ? '#fff' : teamColor;
    const skinColor = flash ? '#fff' : '#f1c27d';

    // 1. Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 8, 3, 0, 0, Math.PI*2);
    ctx.fill();

    // 2. Body (Rounded Rect)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(-9, -20, 18, 20, 6);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    // 3. Head (Circle)
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, -22, 11, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // 4. Eyes
    const blink = Math.random() < 0.01; // Simple blink
    if (!blink) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(4, -24, 3.5, 0, Math.PI*2); // Right eye (relative to facing)
        ctx.arc(-1, -24, 3.5, 0, Math.PI*2); // Left eye
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(5, -24, 1.5, 0, Math.PI*2);
        ctx.arc(0, -24, 1.5, 0, Math.PI*2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.moveTo(1, -24); ctx.lineTo(7, -24);
        ctx.moveTo(-4, -24); ctx.lineTo(2, -24);
        ctx.stroke();
    }

    // 5. Equipment / Hats
    this.drawEquipment(ctx, d.type, d.isRoyal, d.isKing);

    // 6. Weapon
    ctx.save();
    // Animate swing
    if (d.state === STATE_ATTACK) {
        const swing = Math.sin(this._animTime * 20) * 1.5;
        ctx.rotate(swing);
    }
    this.drawWeapon(ctx, d.type);
    ctx.restore();

    // 7. Shield (if applicable)
    if (d.type === TYPE_SWORD || d.state === STATE_BLOCK) {
         ctx.translate(-8, -10);
         if (d.state === STATE_BLOCK) ctx.translate(4, -4); // Raise shield
         ctx.fillStyle = '#8D6E63';
         ctx.beginPath();
         ctx.roundRect(-6, -6, 10, 14, 3);
         ctx.fill();
         ctx.stroke();
         
         ctx.fillStyle = '#FFD54F';
         ctx.beginPath();
         ctx.arc(-1, 1, 2, 0, Math.PI*2);
         ctx.fill();
    }

    // 8. Health Bar
    if (d.hp < d.maxHp) {
        ctx.fillStyle = '#333';
        ctx.fillRect(-10, -40, 20, 4);
        ctx.fillStyle = d.hp / d.maxHp > 0.5 ? '#4CAF50' : '#F44336';
        ctx.fillRect(-10, -40, 20 * (d.hp / d.maxHp), 4);
    }

    // 9. Local Player Indicator
    if (d.isLocal) {
        ctx.fillStyle = '#FFEB3B';
        ctx.beginPath();
        ctx.moveTo(0, -45);
        ctx.lineTo(-5, -55);
        ctx.lineTo(5, -55);
        ctx.fill();
    }

    ctx.restore();
  }

  drawEquipment(ctx, type, isRoyal, isKing) {
      if (isRoyal) {
          // Crown
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.moveTo(-11, -26);
          ctx.lineTo(-11, -34);
          ctx.lineTo(-6, -30);
          ctx.lineTo(0, -36);
          ctx.lineTo(6, -30);
          ctx.lineTo(11, -34);
          ctx.lineTo(11, -26);
          ctx.fill();
          ctx.stroke();
          return;
      }
      
      if (type === TYPE_ARCHER) {
          // Hood
          ctx.fillStyle = '#4E342E';
          ctx.beginPath();
          ctx.arc(0, -22, 11.5, Math.PI, 0); // Top half
          ctx.fill();
          ctx.stroke();
      } else if (type === TYPE_GUNNER) {
          // Bandana
          ctx.fillStyle = '#333';
          ctx.fillRect(-11, -28, 22, 6);
      } else {
          // Helmet
          ctx.fillStyle = '#B0BEC5';
          ctx.beginPath();
          ctx.arc(0, -24, 11.5, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
      }
  }

  drawWeapon(ctx, type) {
      ctx.fillStyle = '#cfd8dc'; // Steel
      ctx.strokeStyle = '#37474F';
      
      if (type === TYPE_SWORD) {
          ctx.fillRect(8, -15, 4, 16); // Blade
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(8, -2, 4, 6); // Hilt
          ctx.fillRect(6, -2, 8, 2); // Guard
      } else if (type === TYPE_SPEAR) {
          ctx.fillStyle = '#5D4037'; // Wood
          ctx.fillRect(10, -25, 2, 35); // Shaft
          ctx.fillStyle = '#cfd8dc';
          ctx.beginPath();
          ctx.moveTo(11, -30);
          ctx.lineTo(9, -25);
          ctx.lineTo(13, -25);
          ctx.fill();
      } else if (type === TYPE_ARCHER) {
          ctx.strokeStyle = '#5D4037';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(10, -10, 8, -Math.PI/2, Math.PI/2);
          ctx.stroke();
          ctx.lineWidth = 1;
      } else if (type === TYPE_GUNNER) {
          ctx.fillStyle = '#333';
          ctx.fillRect(6, -12, 12, 4); // Barrel
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(4, -10, 4, 6); // Stock
      }
  }

  drawDeadEntity(ctx, cam, d) {
      const pos = cam.worldToScreen(d.x, d.y, d.isOnWall);
      const scale = cam.scale;
      
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(scale, scale);
      
      // Simple gravestone or skull
      ctx.fillStyle = '#9E9E9E';
      ctx.beginPath();
      ctx.roundRect(-8, -15, 16, 15, 8);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('R.I.P', 0, -5);
      
      ctx.restore();
  }

  drawCastle(ctx, cam, team, worldX) {
    const x = (worldX - cam.x) * cam.scale + cam.shakeX;
    const w = CASTLE_WIDTH * cam.scale;
    const h = 200 * cam.scale;
    const groundY = cam.groundScreenY + cam.shakeY;
    
    if (x + w < 0 || x > ctx.canvas.width) return;
    
    ctx.fillStyle = team === TEAM_BLUE ? BLUE_DARK : RED_DARK;
    ctx.fillRect(x, groundY - h, w, h);
    
    // Battlements
    ctx.fillStyle = team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    const crenW = w / 5;
    for(let i=0; i<5; i+=2) {
        ctx.fillRect(x + i*crenW, groundY - h - 20*cam.scale, crenW, 20*cam.scale);
    }
  }

  drawGates(ctx, cam, gates) {
     if (!gates) return;
     // Blue Gate
     this._drawGate(ctx, cam, BLUE_CASTLE_X + CASTLE_WIDTH, gates[0]);
     // Red Gate
     this._drawGate(ctx, cam, RED_CASTLE_X, gates[1]);
  }
  
  _drawGate(ctx, cam, worldX, hp) {
      if (hp <= 0) return;
      const w = 20 * cam.scale;
      const h = 60 * cam.scale;
      const x = (worldX - cam.x) * cam.scale + cam.shakeX - w/2;
      const y = cam.groundScreenY + cam.shakeY - h;
      
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(x, y, w, h);
      
      // Iron bars
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y + h*0.2, w, 5);
      ctx.fillRect(x, y + h*0.8, w, 5);
  }

  drawProjectile(ctx, cam, p) {
    // p: [id, type, team, x, y, ownerId, dist, targetDist]
    const type = p[1];
    const dist = p[6] || 0;
    const targetDist = p[7] || 1000;
    
    let arc = 0;
    if (type === PROJ_ROCK || type === PROJ_ARROW) {
        const progress = Math.max(0, Math.min(1, dist / targetDist));
        // Dynamic height based on shot distance
        const maxHeight = targetDist * 0.3; 
        arc = Math.sin(progress * Math.PI) * maxHeight * cam.scale;
    }

    const pos = cam.worldToScreen(p[3], p[4], false);
    
    ctx.save();
    ctx.translate(pos.x, pos.y - arc);
    ctx.scale(cam.scale, cam.scale);
    
    if (type === PROJ_ARROW) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-5, 0); ctx.lineTo(5, 0);
        ctx.stroke();
    } else if (type === PROJ_ROCK) {
        ctx.fillStyle = '#5D4037'; // Darker rock color
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI*2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = '#8D6E63';
        ctx.beginPath();
        ctx.arc(-3, -3, 4, 0, Math.PI*2);
        ctx.fill();
    } else if (type === PROJ_BULLET) {
        // Bullet trail
        ctx.strokeStyle = 'rgba(255, 213, 79, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-15, 0); // Trail behind
        ctx.lineTo(0, 0);
        ctx.stroke();

        ctx.fillStyle = '#FFD54F';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI*2);
        ctx.fill();
    }
    
    ctx.restore();
  }

  drawTracers(ctx, cam, entityMap) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.6;
      
      for(const tr of this._tracers) {
          const a = entityMap.get(tr.attackerId);
          const v = entityMap.get(tr.victimId);
          if (!a || !v) continue;
          
          const p1 = cam.worldToScreen(a.x, a.y, a.isOnWall);
          const p2 = cam.worldToScreen(v.x, v.y, v.isOnWall);
          
          ctx.strokeStyle = '#FFD54F';
          ctx.lineWidth = 2 * cam.scale;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y - 20*cam.scale);
          ctx.lineTo(p2.x, p2.y - 20*cam.scale);
          ctx.stroke();
      }
      ctx.restore();
  }
  
  drawAimLines(ctx, cam, entityMap, localTeam) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      
      for(const al of this._aimLines) {
           const shooter = entityMap.get(al.shooterId);
           if (!shooter) continue;
           if (localTeam && shooter.team === localTeam) continue; // Only show enemy aim
           
           const p1 = cam.worldToScreen(shooter.x, shooter.y, shooter.isOnWall);
           const p2 = cam.worldToScreen(al.tx, al.ty, false); // Aim is always ground? No, could be wall
           
           ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
           ctx.beginPath();
           ctx.moveTo(p1.x, p1.y - 20*cam.scale);
           ctx.lineTo(p2.x, p2.y);
           ctx.stroke();
           
           // Target circle
           ctx.beginPath();
           ctx.arc(p2.x, p2.y, 10 * cam.scale * (1 - al.ms/al.total), 0, Math.PI*2);
           ctx.stroke();
      }
      ctx.restore();
  }
}
