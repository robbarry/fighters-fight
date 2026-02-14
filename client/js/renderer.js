import { TEAM_BLUE, TEAM_RED, TYPE_SWORD, TYPE_SPEAR, TYPE_ARCHER, TYPE_GUNNER, TYPE_CATAPULT,
	         STATE_DEAD, STATE_BLOCK, STATE_RESPAWNING, STATE_SPECTATING,
	         BODY_WIDTH, BODY_HEIGHT, HEAD_RADIUS, ROYAL_SCALE,
	         CASTLE_WIDTH, BLUE_CASTLE_X, RED_CASTLE_X, WORLD_WIDTH, GROUND_Y_MAX,
	         GATE_HP, PROJ_ARROW, PROJ_ROCK,
	         ARROW_RANGE, ROCK_RANGE } from '/shared/constants.js';

const BLUE_COLOR = '#4488ff';
const BLUE_DARK = '#2266cc';
const RED_COLOR = '#ff4444';
const RED_DARK = '#cc2222';
const CASTLE_COLOR = '#888888';
const CASTLE_DARK = '#666666';
const GATE_COLOR = '#554433';
const GROUND_COLOR = '#4a8c3f';
const GROUND_DARK = '#3a7c2f';
const SKY_TOP = '#4a90d9';
const SKY_BOTTOM = '#87ceeb';

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;

    // FX state (purely client-side)
    this._hitFlashMs = 140;
    this._tracerMs = 120;
    this._hitTimers = new Map(); // entityId -> ms remaining
    this._tracers = []; // { attackerId, victimId, ms }
  }

  update(dtMs) {
    // Hit flashes
    for (const [id, ms] of this._hitTimers) {
      const next = ms - dtMs;
      if (next <= 0) this._hitTimers.delete(id);
      else this._hitTimers.set(id, next);
    }

    // Tracers
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      this._tracers[i].ms -= dtMs;
      if (this._tracers[i].ms <= 0) this._tracers.splice(i, 1);
    }
  }

  flashHit(entityId) {
    if (entityId == null) return;
    this._hitTimers.set(entityId, this._hitFlashMs);
  }

  addTracer(attackerId, victimId) {
    if (attackerId == null || victimId == null) return;
    this._tracers.push({ attackerId, victimId, ms: this._tracerMs });
  }

  render(snapshot, localPlayerId) {
    if (!snapshot) return;
    const ctx = this.ctx;
    const cam = this.camera;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawSky();
    this.drawHills();
    this.drawGround();
    this.drawCastle(TEAM_BLUE, BLUE_CASTLE_X);
    this.drawCastle(TEAM_RED, RED_CASTLE_X);
    this.drawGates(snapshot.gates);

    // Collect all drawable entities and sort by y for depth
    const drawables = [];

    // Soldiers: [id, type, team, x, y, hp, state, facing, isOnWall]
    if (snapshot.soldiers) {
      for (const s of snapshot.soldiers) {
        drawables.push({
          kind: 'soldier', id: s[0], type: s[1], team: s[2],
          x: s[3], y: s[4], hp: s[5], state: s[6], facing: s[7],
          isOnWall: !!s[8],
          maxHp: (s[1] === TYPE_ARCHER || s[1] === TYPE_GUNNER) ? 30 : 40
        });
      }
    }

    // Players: [id, role, team, x, y, hp, state, facing, lives, isOnWall]
    if (snapshot.players) {
      for (const p of snapshot.players) {
        drawables.push({
          kind: 'player', id: p[0], type: p[1], team: p[2],
          x: p[3], y: p[4], hp: p[5], state: p[6], facing: p[7],
          lives: p[8], isPlayer: true, isLocal: p[0] === localPlayerId,
          isOnWall: !!p[9],
          maxHp: 40
        });
      }
    }

    // Royals: [id, isKing, team, x, y, hp, state, facing]
    if (snapshot.royals) {
      for (const r of snapshot.royals) {
        drawables.push({
          kind: 'royal', id: r[0], isKing: r[1], team: r[2],
          x: r[3], y: r[4], hp: r[5], state: r[6], facing: r[7],
          isRoyal: true, isOnWall: false, maxHp: 60
        });
      }
    }

    // Sort: wall units behind ground units, then by y for depth
    drawables.sort((a, b) => {
      if (a.isOnWall !== b.isOnWall) return a.isOnWall ? -1 : 1;
      return a.y - b.y;
    });

    // Fast lookup for FX rendering
    const byId = new Map();
    for (const d of drawables) byId.set(d.id, d);

    // Tracers (ex: hitscan feedback)
    this.drawTracers(byId);

    // Draw entities
    for (const d of drawables) {
      if (!cam.isOnScreen(d.x)) continue;
      if (d.state === STATE_DEAD) {
        this.drawDeadEntity(d);
        continue;
      }
      if (d.state === STATE_RESPAWNING || d.state === STATE_SPECTATING) continue;
      this.drawEntity(d);
    }

    // Draw projectiles on top
    if (snapshot.projectiles) {
      for (const p of snapshot.projectiles) {
        if (!cam.isOnScreen(p[3])) continue;
        this.drawProjectile(p);
	  }
	}
  }

  drawTracers(byId) {
    if (this._tracers.length === 0) return;
    const ctx = this.ctx;
    const cam = this.camera;

    ctx.save();
    ctx.lineCap = 'round';

    for (const tr of this._tracers) {
      const a = byId.get(tr.attackerId);
      const v = byId.get(tr.victimId);
      if (!a || !v) continue;

      // If both ends are far off screen, skip.
      if (!cam.isOnScreen(a.x) && !cam.isOnScreen(v.x)) continue;

      const pa = cam.worldToScreen(a.x, a.y, a.isOnWall);
      const pv = cam.worldToScreen(v.x, v.y, v.isOnWall);

      const aScale = a.isRoyal ? ROYAL_SCALE : 1;
      const vScale = v.isRoyal ? ROYAL_SCALE : 1;
      const aY = pa.y - BODY_HEIGHT * cam.scale * aScale * 0.7;
      const vY = pv.y - BODY_HEIGHT * cam.scale * vScale * 0.7;

      const alpha = Math.max(0, Math.min(1, tr.ms / this._tracerMs));

      // Glow pass
      ctx.globalAlpha = 0.20 * alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(pa.x, aY);
      ctx.lineTo(pv.x, vY);
      ctx.stroke();

      // Core pass
      ctx.globalAlpha = 0.75 * alpha;
      ctx.strokeStyle = '#ffdd44';
      ctx.lineWidth = 2.2 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(pa.x, aY);
      ctx.lineTo(pv.x, vY);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawEntity(d) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pos = cam.worldToScreen(d.x, d.y, d.isOnWall);
    const scale = d.isRoyal ? ROYAL_SCALE : 1;
    const bw = BODY_WIDTH * cam.scale * scale;
    const bh = BODY_HEIGHT * cam.scale * scale;
    const hr = HEAD_RADIUS * cam.scale * scale;
    const color = d.team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    const darkColor = d.team === TEAM_BLUE ? BLUE_DARK : RED_DARK;

    // Animation tier: near camera center gets full detail
    const dist = cam.distFromCenter(d.x);
    const fullDetail = d.isLocal || d.isRoyal || dist < 520;

    const now = performance.now() / 1000;
    const walkT = now * 7 + d.id * 0.23;
    const moving = !d.isOnWall && d.state !== STATE_BLOCK;
    const walk = moving ? Math.sin(walkT) : 0;
    const bob = moving ? Math.abs(Math.sin(walkT)) * 1.5 * cam.scale : 0;

    const feetX = pos.x;
    const feetY = pos.y + bob;

    const legH = bh * 0.45;
    const torsoH = bh * 0.62;
    const torsoW = bw * 0.95;

    const hipY = feetY;
    const torsoBottomY = hipY - legH;
    const torsoTopY = torsoBottomY - torsoH;

    const skin = '#f2c9a0';
    const skinStroke = '#c48f6a';
    const pants = '#2b2e3a';
    const boots = '#1e1b18';
    const metal = '#b7b7b7';
    const metalDark = '#8a8a8a';

    const weaponDir = d.facing === 0 ? 1 : -1;

    const flashMs = this._hitTimers.get(d.id) || 0;
    const flashA = flashMs > 0 ? Math.max(0, Math.min(1, flashMs / this._hitFlashMs)) : 0;

    function roundRectPath(ctx2, x, y, w, h, r) {
      ctx2.beginPath();
      if (ctx2.roundRect) {
        ctx2.roundRect(x, y, w, h, r);
        return;
      }
      const rr = Math.min(r, w / 2, h / 2);
      ctx2.moveTo(x + rr, y);
      ctx2.lineTo(x + w - rr, y);
      ctx2.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx2.lineTo(x + w, y + h - rr);
      ctx2.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx2.lineTo(x + rr, y + h);
      ctx2.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx2.lineTo(x, y + rr);
      ctx2.quadraticCurveTo(x, y, x + rr, y);
      ctx2.closePath();
    }

    ctx.save();

    // Shadow (ground units only)
    if (!d.isOnWall) {
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(feetX, feetY + 2 * cam.scale, bw * 0.55, bw * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Glow (players + royals)
    if (d.isLocal) {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 16 * cam.scale;
    } else if (d.isPlayer) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 9 * cam.scale;
    }
    if (d.isRoyal) {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 14 * cam.scale;
    }

    // Legs (skip for wall units to keep the illusion they're on battlements)
    if (!d.isOnWall) {
      const legSwing = fullDetail ? walk * 0.7 : 0;
      const legSpread = bw * 0.18;
      const kneeLift = Math.max(0, walk) * legH * 0.15;

      ctx.lineCap = 'round';
      ctx.lineWidth = 3.2 * cam.scale * scale;
      ctx.strokeStyle = pants;

      // Left leg
      ctx.beginPath();
      ctx.moveTo(feetX - legSpread, torsoBottomY);
      ctx.lineTo(feetX - legSpread + legSwing * 6 * cam.scale, hipY - kneeLift);
      ctx.stroke();
      // Right leg
      ctx.beginPath();
      ctx.moveTo(feetX + legSpread, torsoBottomY);
      ctx.lineTo(feetX + legSpread - legSwing * 6 * cam.scale, hipY);
      ctx.stroke();

      // Boots
      ctx.strokeStyle = boots;
      ctx.lineWidth = 4.2 * cam.scale * scale;
      ctx.beginPath();
      ctx.moveTo(feetX - legSpread - 2 * cam.scale, hipY);
      ctx.lineTo(feetX - legSpread + 4 * cam.scale, hipY);
      ctx.moveTo(feetX + legSpread - 4 * cam.scale, hipY);
      ctx.lineTo(feetX + legSpread + 2 * cam.scale, hipY);
      ctx.stroke();
    }

    // Torso (tunic/armor)
    const torsoX = feetX - torsoW / 2;
    const torsoY = torsoTopY;
    const torsoR = 4 * cam.scale * scale;

    // Underlayer for depth
    roundRectPath(ctx, torsoX, torsoY + 1 * cam.scale, torsoW, torsoH, torsoR);
    ctx.fillStyle = darkColor;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;

    roundRectPath(ctx, torsoX, torsoY, torsoW, torsoH, torsoR);
    ctx.fillStyle = color;
    ctx.fill();

    // Belt
    if (fullDetail) {
      ctx.fillStyle = '#3b2a1a';
      ctx.fillRect(torsoX, torsoY + torsoH * 0.62, torsoW, 3 * cam.scale * scale);
      ctx.fillStyle = '#d1b07a';
      ctx.fillRect(
        feetX - 2 * cam.scale * scale,
        torsoY + torsoH * 0.60,
        4 * cam.scale * scale,
        6 * cam.scale * scale
      );
    }

    // Arms (full detail only)
    if (fullDetail) {
      const shoulderY = torsoY + torsoH * 0.25;
      const armLen = torsoH * 0.55;
      const armSwing = moving ? walk * 0.6 : 0;

      ctx.lineCap = 'round';
      ctx.lineWidth = 3.0 * cam.scale * scale;
      ctx.strokeStyle = metalDark;

      // Back arm
      ctx.beginPath();
      ctx.moveTo(feetX - weaponDir * torsoW * 0.35, shoulderY);
      ctx.lineTo(
        feetX - weaponDir * torsoW * 0.35 + (-weaponDir) * armLen * 0.35,
        shoulderY + armLen * 0.55 + Math.abs(armSwing) * 2 * cam.scale
      );
      ctx.stroke();

      // Front arm (weapon arm)
      ctx.strokeStyle = metal;
      ctx.beginPath();
      ctx.moveTo(feetX + weaponDir * torsoW * 0.35, shoulderY);
      ctx.lineTo(
        feetX + weaponDir * torsoW * 0.35 + weaponDir * armLen * 0.55,
        shoulderY + armLen * 0.30 - armSwing * 3 * cam.scale
      );
      ctx.stroke();
    }

    // Head
    const headX = feetX;
    const headY = torsoY - hr * 0.9;
    ctx.beginPath();
    ctx.arc(headX, headY, hr, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = skinStroke;
    ctx.lineWidth = 1.5 * cam.scale * scale;
    ctx.stroke();

    // Helmet for non-archers (slightly more "real")
    if (fullDetail && !d.isRoyal && d.type !== TYPE_ARCHER) {
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.arc(headX, headY - hr * 0.2, hr * 1.05, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = metalDark;
      ctx.stroke();
    }

    // Face
    if (fullDetail) {
      const eyeDir = weaponDir;
      const ex = headX + eyeDir * hr * 0.25;
      const ey = headY - hr * 0.15;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(ex, ey, hr * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + eyeDir * hr * 0.35, ey, hr * 0.14, 0, Math.PI * 2);
      ctx.fill();
      // Mouth
      ctx.strokeStyle = 'rgba(20, 10, 10, 0.5)';
      ctx.lineWidth = 1.2 * cam.scale * scale;
      ctx.beginPath();
      ctx.arc(headX, headY + hr * 0.25, hr * 0.35, 0, Math.PI);
      ctx.stroke();
    }

    // Weapon + shield (full detail)
    if (fullDetail) {
      const weaponX = feetX + weaponDir * torsoW * 0.55;
      const weaponY = torsoY + torsoH * 0.45;

      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2.2 * cam.scale * scale;
      ctx.lineCap = 'round';

      // Default weapon for royals: sword
      const weaponType = d.isRoyal ? TYPE_SWORD : d.type;

      switch (weaponType) {
        case TYPE_SWORD: {
          // Blade
          ctx.strokeStyle = metal;
          ctx.lineWidth = 2.6 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX + weaponDir * 16 * cam.scale * scale, weaponY - 8 * cam.scale * scale);
          ctx.stroke();
          // Hilt
          ctx.strokeStyle = '#6b4a2a';
          ctx.lineWidth = 3.2 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX - weaponDir * 4 * cam.scale * scale, weaponY + 2 * cam.scale * scale);
          ctx.stroke();
          break;
        }
        case TYPE_SPEAR: {
          ctx.strokeStyle = '#6b4a2a';
          ctx.lineWidth = 2.6 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX + weaponDir * 34 * cam.scale * scale, weaponY - 4 * cam.scale * scale);
          ctx.stroke();
          // Tip
          ctx.fillStyle = metal;
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 34 * cam.scale * scale, weaponY - 7 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 42 * cam.scale * scale, weaponY - 4 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 34 * cam.scale * scale, weaponY - 1 * cam.scale * scale);
          ctx.fill();
          break;
        }
        case TYPE_ARCHER: {
          ctx.strokeStyle = '#6b4a2a';
          ctx.lineWidth = 2.4 * cam.scale * scale;
          ctx.beginPath();
          ctx.arc(
            weaponX + weaponDir * 6 * cam.scale * scale,
            weaponY,
            10 * cam.scale * scale,
            weaponDir > 0 ? -Math.PI / 2 : Math.PI / 2,
            weaponDir > 0 ? Math.PI / 2 : -Math.PI / 2
          );
          ctx.stroke();
          // String
          ctx.strokeStyle = '#ddd';
          ctx.lineWidth = 1.2 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 6 * cam.scale * scale, weaponY - 10 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 6 * cam.scale * scale, weaponY + 10 * cam.scale * scale);
          ctx.stroke();
          break;
        }
        case TYPE_GUNNER: {
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 4.0 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX + weaponDir * 22 * cam.scale * scale, weaponY - 1 * cam.scale * scale);
          ctx.stroke();
          // Barrel highlight
          ctx.strokeStyle = '#777';
          ctx.lineWidth = 2.0 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 4 * cam.scale * scale, weaponY - 1 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 22 * cam.scale * scale, weaponY - 2 * cam.scale * scale);
          ctx.stroke();
          break;
        }
        case TYPE_CATAPULT: {
          // Stylized lever / sling
          ctx.strokeStyle = '#6b4a2a';
          ctx.lineWidth = 4.0 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(feetX, weaponY + 8 * cam.scale * scale);
          ctx.lineTo(feetX + weaponDir * 14 * cam.scale * scale, weaponY - 16 * cam.scale * scale);
          ctx.stroke();
          ctx.fillStyle = '#444';
          ctx.beginPath();
          ctx.arc(feetX + weaponDir * 14 * cam.scale * scale, weaponY - 16 * cam.scale * scale, 4 * cam.scale * scale, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }

      // Shield (sword+shield only, and big/obvious when blocking)
      if (weaponType === TYPE_SWORD) {
        const shieldX = feetX - weaponDir * torsoW * 0.65;
        const shieldY = torsoY + torsoH * 0.55;
        const sw = 10 * cam.scale * scale;
        const sh = 14 * cam.scale * scale;
        const showShield = d.state === STATE_BLOCK || d.isPlayer || d.isRoyal;

        if (showShield) {
          roundRectPath(ctx, shieldX - sw / 2, shieldY - sh / 2, sw, sh, 4 * cam.scale * scale);
          ctx.fillStyle = '#7a5a3a';
          ctx.fill();
          ctx.strokeStyle = '#3b2a1a';
          ctx.lineWidth = 2 * cam.scale * scale;
          ctx.stroke();
          ctx.fillStyle = '#d1b07a';
          ctx.beginPath();
          ctx.arc(shieldX, shieldY, 2.2 * cam.scale * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Royal crown and cape
    if (d.isRoyal) {
      // Crown
      ctx.fillStyle = '#ffdd00';
      const crownY = torsoTopY - hr * 1.6;
      const crownW = hr * 2;
      const crownH = 6 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(feetX - crownW / 2, crownY + crownH);
      ctx.lineTo(feetX - crownW / 2, crownY + crownH / 2);
      ctx.lineTo(feetX - crownW / 4, crownY + crownH);
      ctx.lineTo(feetX, crownY);
      ctx.lineTo(feetX + crownW / 4, crownY + crownH);
      ctx.lineTo(feetX + crownW / 2, crownY + crownH / 2);
      ctx.lineTo(feetX + crownW / 2, crownY + crownH);
      ctx.closePath();
      ctx.fill();

      // Cape
      const capeDir = d.facing === 0 ? -1 : 1;
      ctx.fillStyle = d.team === TEAM_BLUE ? '#2255aa' : '#aa2222';
      ctx.beginPath();
      ctx.moveTo(feetX + capeDir * bw * 0.2, torsoY);
      ctx.lineTo(feetX + capeDir * bw * 0.25, feetY);
      ctx.lineTo(feetX + capeDir * bw * 0.9, feetY + 6 * cam.scale);
      ctx.closePath();
      ctx.fill();
    }

    // Hit flash overlay (make damage obvious)
    if (flashA > 0) {
      ctx.save();
      ctx.globalAlpha = 0.20 * flashA;
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, torsoX - 3 * cam.scale, torsoY - 3 * cam.scale, torsoW + 6 * cam.scale, torsoH + 6 * cam.scale, torsoR + 3 * cam.scale);
      ctx.fill();
      ctx.restore();
    }

    // Health bar (only if damaged)
    if (d.hp < d.maxHp && d.hp > 0) {
      const barW = 20 * cam.scale * scale;
      const barH = 3 * cam.scale;
      const barX = pos.x - barW / 2;
      const barY = torsoTopY - hr * 2 - (d.isRoyal ? 12 : 6) * cam.scale;
      const pct = d.hp / d.maxHp;

      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = pct > 0.5 ? '#44cc44' : pct > 0.25 ? '#cccc44' : '#cc4444';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }

    ctx.restore();
  }

  drawDeadEntity(d) {
    const ctx = this.ctx;
    const cam = this.camera;
    const pos = cam.worldToScreen(d.x, d.y, d.isOnWall);
    const color = d.team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    const bw = BODY_WIDTH * cam.scale;
    const bh = BODY_HEIGHT * cam.scale;

    // Fallen body (simple, but readable)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(pos.x - bh / 2, pos.y - bw / 2, bh, bw);
    ctx.restore();
  }

  drawProjectile(p) {
    // p: [id, type, team, x, y, ownerId, dist]
    const ctx = this.ctx;
    const cam = this.camera;
    const pos = cam.worldToScreen(p[3], p[4], false);

    const dist = p[6] || 0;
    const maxRange = p[1] === PROJ_ARROW ? ARROW_RANGE : ROCK_RANGE;
    const progress = maxRange > 0 ? Math.max(0, Math.min(1, dist / maxRange)) : 0;
    const maxArc = (p[1] === PROJ_ARROW ? 35 : 55) * cam.scale;
    const arc = Math.sin(progress * Math.PI) * maxArc;

    if (p[1] === PROJ_ARROW) {
      const dir = p[2] === TEAM_BLUE ? 1 : -1;
      const y = pos.y - arc;
      ctx.save();
      ctx.translate(pos.x, y);

      // Shaft
      ctx.strokeStyle = '#6b3f1e';
      ctx.lineWidth = 2.2 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(-10 * cam.scale * dir, 0);
      ctx.lineTo(10 * cam.scale * dir, 0);
      ctx.stroke();

      // Head
      ctx.fillStyle = '#d8d8d8';
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(10 * cam.scale * dir, 0);
      ctx.lineTo(4 * cam.scale * dir, -4 * cam.scale);
      ctx.lineTo(4 * cam.scale * dir, 4 * cam.scale);
      ctx.closePath();
      ctx.fill();

      // Fletching
      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth = 1.5 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(-10 * cam.scale * dir, 0);
      ctx.lineTo(-14 * cam.scale * dir, -3 * cam.scale);
      ctx.moveTo(-10 * cam.scale * dir, 0);
      ctx.lineTo(-14 * cam.scale * dir, 3 * cam.scale);
      ctx.stroke();

      ctx.restore();
    } else {
      // Rock
      const y = pos.y - arc;
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.arc(pos.x, y, 5 * cam.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.stroke();
    }
  }

  drawSky() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.camera.groundScreenY);
    gradient.addColorStop(0, SKY_TOP);
    gradient.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.camera.groundScreenY);
  }

  drawHills() {
    const ctx = this.ctx;
    const cam = this.camera;
    const groundY = cam.groundScreenY;

    // Parallax: hills move at 0.3x camera speed
    const parallaxOffset = -cam.x * 0.3 * cam.scale;

    ctx.fillStyle = '#5a9c4f';
    for (let i = 0; i < 5; i++) {
      const hillX = parallaxOffset + i * 400 * cam.scale;
      const hillW = 300 * cam.scale;
      const hillH = 40 + (i % 3) * 20;
      ctx.beginPath();
      ctx.arc(hillX + hillW / 2, groundY, hillW / 2, Math.PI, 0);
      ctx.fill();
    }
  }

  drawGround() {
    const ctx = this.ctx;
    const cam = this.camera;

    // Main ground
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, cam.groundScreenY, this.canvas.width, this.canvas.height - cam.groundScreenY);

    // Darker band for the lower area
    ctx.fillStyle = GROUND_DARK;
    ctx.fillRect(0, cam.groundScreenY + cam.groundBandHeight,
      this.canvas.width, this.canvas.height - cam.groundScreenY - cam.groundBandHeight);

    // Ground texture lines
    ctx.strokeStyle = '#3a7c2f';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = cam.groundScreenY + i * (cam.groundBandHeight / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.globalAlpha = 0.3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawCastle(team, worldX) {
    const ctx = this.ctx;
    const cam = this.camera;

    const castleLeft = (worldX - cam.x) * cam.scale;
    const castleRight = (worldX + CASTLE_WIDTH - cam.x) * cam.scale;
    const castleW = CASTLE_WIDTH * cam.scale;
    const groundY = cam.groundScreenY;
    const wallHeight = groundY - cam.wallScreenY + 30 * cam.scale;
    const wallTop = groundY - wallHeight;

    // Off-screen check
    if (castleRight < -50 || castleLeft > this.canvas.width + 50) return;

    // Castle wall
    ctx.fillStyle = CASTLE_COLOR;
    ctx.fillRect(castleLeft, wallTop, castleW, wallHeight);

    // Brick pattern
    ctx.strokeStyle = CASTLE_DARK;
    ctx.lineWidth = 1;
    const brickH = 10 * cam.scale;
    const brickW = 20 * cam.scale;
    for (let row = 0; row < wallHeight / brickH; row++) {
      const y = wallTop + row * brickH;
      const offset = (row % 2) * brickW / 2;
      for (let col = 0; col < castleW / brickW + 1; col++) {
        const x = castleLeft + col * brickW + offset;
        ctx.strokeRect(x, y, brickW, brickH);
      }
    }

    // Crenellations
    const crenW = 12 * cam.scale;
    const crenH = 10 * cam.scale;
    const crenGap = 8 * cam.scale;
    for (let x = castleLeft + crenGap; x < castleRight - crenW; x += crenW + crenGap) {
      ctx.fillStyle = CASTLE_COLOR;
      ctx.fillRect(x, wallTop - crenH, crenW, crenH);
      ctx.strokeRect(x, wallTop - crenH, crenW, crenH);
    }

    // Flag
    const flagX = team === TEAM_BLUE ? castleLeft + castleW * 0.3 : castleLeft + castleW * 0.7;
    const flagY = wallTop - crenH;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(flagX, flagY);
    ctx.lineTo(flagX, flagY - 30 * cam.scale);
    ctx.stroke();

    ctx.fillStyle = team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    ctx.beginPath();
    ctx.moveTo(flagX, flagY - 30 * cam.scale);
    ctx.lineTo(flagX + 15 * cam.scale, flagY - 25 * cam.scale);
    ctx.lineTo(flagX, flagY - 20 * cam.scale);
    ctx.fill();
  }

  drawGates(gates) {
    if (!gates) return;
    const ctx = this.ctx;
    const cam = this.camera;
    const groundY = cam.groundScreenY;
    const gateH = 35 * cam.scale;
    const gateW = 25 * cam.scale;

    // Blue gate (right side of blue castle)
    const blueGateX = (CASTLE_WIDTH - cam.x) * cam.scale - gateW / 2;
    if (gates[0] > 0) {
      ctx.fillStyle = GATE_COLOR;
      ctx.fillRect(blueGateX, groundY - gateH, gateW, gateH);
      // Iron bands
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(blueGateX, groundY - gateH * 0.3);
      ctx.lineTo(blueGateX + gateW, groundY - gateH * 0.3);
      ctx.moveTo(blueGateX, groundY - gateH * 0.7);
      ctx.lineTo(blueGateX + gateW, groundY - gateH * 0.7);
      ctx.stroke();

      // Gate HP bar if damaged
      if (gates[0] < GATE_HP) {
        this._drawGateHpBar(blueGateX, groundY - gateH - 10 * cam.scale, gateW, gates[0]);
      }
    }

    // Red gate (left side of red castle)
    const redGateX = (RED_CASTLE_X - cam.x) * cam.scale - gateW / 2;
    if (gates[1] > 0) {
      ctx.fillStyle = GATE_COLOR;
      ctx.fillRect(redGateX, groundY - gateH, gateW, gateH);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(redGateX, groundY - gateH * 0.3);
      ctx.lineTo(redGateX + gateW, groundY - gateH * 0.3);
      ctx.moveTo(redGateX, groundY - gateH * 0.7);
      ctx.lineTo(redGateX + gateW, groundY - gateH * 0.7);
      ctx.stroke();

      if (gates[1] < GATE_HP) {
        this._drawGateHpBar(redGateX, groundY - gateH - 10 * cam.scale, gateW, gates[1]);
      }
    }
  }

  _drawGateHpBar(x, y, w, hp) {
    const ctx = this.ctx;
    const barH = 4 * this.camera.scale;
    const pct = hp / GATE_HP;
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, barH);
    ctx.fillStyle = pct > 0.5 ? '#44cc44' : pct > 0.25 ? '#cccc44' : '#cc4444';
    ctx.fillRect(x, y, w * pct, barH);
  }
}
