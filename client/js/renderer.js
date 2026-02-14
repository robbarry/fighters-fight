import { TEAM_BLUE, TEAM_RED, TYPE_SWORD, TYPE_SPEAR, TYPE_ARCHER, TYPE_GUNNER, TYPE_CATAPULT,
         STATE_DEAD, STATE_BLOCK, STATE_RESPAWNING, STATE_SPECTATING,
         BODY_WIDTH, BODY_HEIGHT, HEAD_RADIUS, ROYAL_SCALE,
         CASTLE_WIDTH, BLUE_CASTLE_X, RED_CASTLE_X, WORLD_WIDTH, GROUND_Y_MAX,
         GATE_HP, PROJ_ARROW, PROJ_ROCK } from '/shared/constants.js';

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
    const fullDetail = dist < 400;

    ctx.save();

    // Player glow
    if (d.isLocal) {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 15 * cam.scale;
    } else if (d.isPlayer) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8 * cam.scale;
    }

    // Royal glow
    if (d.isRoyal) {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 12 * cam.scale;
    }

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(pos.x - bw / 2, pos.y - bh, bw, bh);

    // Body outline
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(pos.x - bw / 2, pos.y - bh, bw, bh);

    ctx.shadowBlur = 0;

    // Head
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - bh - hr, hr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffddaa';
    ctx.fill();
    ctx.strokeStyle = '#cc9966';
    ctx.stroke();

    // Eyes (look in facing direction)
    if (fullDetail) {
      const eyeOffset = (d.facing === 0 ? 1 : -1) * hr * 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(pos.x + eyeOffset, pos.y - bh - hr, hr * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Weapon
    if (fullDetail) {
      const weaponDir = d.facing === 0 ? 1 : -1;
      const weaponX = pos.x + weaponDir * bw / 2;
      const weaponY = pos.y - bh * 0.6;

      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2 * cam.scale;

      switch (d.type) {
        case TYPE_SWORD:
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX + weaponDir * 15 * cam.scale, weaponY - 5 * cam.scale);
          ctx.stroke();
          break;
        case TYPE_SPEAR:
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX + weaponDir * 25 * cam.scale, weaponY - 3 * cam.scale);
          ctx.stroke();
          // Spear tip
          ctx.fillStyle = '#aaa';
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 25 * cam.scale, weaponY - 6 * cam.scale);
          ctx.lineTo(weaponX + weaponDir * 30 * cam.scale, weaponY - 3 * cam.scale);
          ctx.lineTo(weaponX + weaponDir * 25 * cam.scale, weaponY);
          ctx.fill();
          break;
        case TYPE_ARCHER:
          ctx.beginPath();
          ctx.arc(
            weaponX + weaponDir * 5 * cam.scale, weaponY, 8 * cam.scale,
            d.facing === 0 ? -Math.PI / 2 : Math.PI / 2,
            d.facing === 0 ? Math.PI / 2 : -Math.PI / 2
          );
          ctx.stroke();
          break;
        case TYPE_GUNNER:
          ctx.lineWidth = 3 * cam.scale;
          ctx.beginPath();
          ctx.moveTo(weaponX, weaponY);
          ctx.lineTo(weaponX + weaponDir * 20 * cam.scale, weaponY);
          ctx.stroke();
          break;
        case TYPE_CATAPULT:
          ctx.lineWidth = 3 * cam.scale;
          ctx.beginPath();
          ctx.moveTo(pos.x, weaponY);
          ctx.lineTo(pos.x + weaponDir * 12 * cam.scale, weaponY - 15 * cam.scale);
          ctx.stroke();
          break;
      }

      // Shield for sword type when blocking
      if (d.type === TYPE_SWORD && d.state === STATE_BLOCK) {
        const shieldDir = d.facing === 0 ? 1 : -1;
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(
          pos.x + shieldDir * bw / 2 - (shieldDir > 0 ? 0 : 6 * cam.scale),
          pos.y - bh * 0.8,
          6 * cam.scale,
          bh * 0.6
        );
      }
    }

    // Royal crown and cape
    if (d.isRoyal) {
      // Crown
      ctx.fillStyle = '#ffdd00';
      const crownY = pos.y - bh - hr * 2 - 4 * cam.scale;
      const crownW = hr * 2;
      const crownH = 6 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(pos.x - crownW / 2, crownY + crownH);
      ctx.lineTo(pos.x - crownW / 2, crownY + crownH / 2);
      ctx.lineTo(pos.x - crownW / 4, crownY + crownH);
      ctx.lineTo(pos.x, crownY);
      ctx.lineTo(pos.x + crownW / 4, crownY + crownH);
      ctx.lineTo(pos.x + crownW / 2, crownY + crownH / 2);
      ctx.lineTo(pos.x + crownW / 2, crownY + crownH);
      ctx.closePath();
      ctx.fill();

      // Cape
      const capeDir = d.facing === 0 ? -1 : 1;
      ctx.fillStyle = d.team === TEAM_BLUE ? '#2255aa' : '#aa2222';
      ctx.beginPath();
      ctx.moveTo(pos.x + capeDir * bw * 0.3, pos.y - bh);
      ctx.lineTo(pos.x + capeDir * bw * 0.3, pos.y);
      ctx.lineTo(pos.x + capeDir * bw, pos.y + 5 * cam.scale);
      ctx.closePath();
      ctx.fill();
    }

    // Health bar (only if damaged)
    if (d.hp < d.maxHp && d.hp > 0) {
      const barW = 20 * cam.scale * scale;
      const barH = 3 * cam.scale;
      const barX = pos.x - barW / 2;
      const barY = pos.y - bh - hr * 2 - (d.isRoyal ? 12 : 6) * cam.scale;
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
    const pos = cam.worldToScreen(d.x, d.y, false);
    const color = d.team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    const bw = BODY_WIDTH * cam.scale;
    const bh = BODY_HEIGHT * cam.scale;

    // Fallen body (rotated 90 degrees)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(pos.x - bh / 2, pos.y - bw / 2, bh, bw);
    ctx.restore();
  }

  drawProjectile(p) {
    // p: [id, type, team, x, y, ownerId]
    const ctx = this.ctx;
    const cam = this.camera;
    const pos = cam.worldToScreen(p[3], p[4], false);

    // Slight upward offset for visual arc feel
    const arcOffset = -20 * cam.scale;

    if (p[1] === PROJ_ARROW) {
      ctx.fillStyle = '#8B4513';
      ctx.save();
      ctx.translate(pos.x, pos.y + arcOffset);
      ctx.beginPath();
      ctx.moveTo(-6 * cam.scale, 0);
      ctx.lineTo(6 * cam.scale, 0);
      ctx.lineTo(0, -3 * cam.scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // Rock
      ctx.fillStyle = '#777';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y + arcOffset, 4 * cam.scale, 0, Math.PI * 2);
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
