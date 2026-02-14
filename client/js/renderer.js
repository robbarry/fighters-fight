import { TEAM_BLUE, TEAM_RED, TYPE_SWORD, TYPE_SPEAR, TYPE_ARCHER, TYPE_GUNNER, TYPE_CATAPULT,
	         STATE_DEAD, STATE_BLOCK, STATE_ATTACK, STATE_RESPAWNING, STATE_SPECTATING,
	         BODY_WIDTH, BODY_HEIGHT, HEAD_RADIUS, ROYAL_SCALE,
	         CASTLE_WIDTH, BLUE_CASTLE_X, RED_CASTLE_X, WORLD_WIDTH, GROUND_Y_MAX,
	         GATE_HP, PROJ_ARROW, PROJ_ROCK,
	         ARROW_RANGE, ROCK_RANGE,
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
const GROUND_COLOR = '#4a8c3f';
const GROUND_DARK = '#3a7c2f';

function hashU32(n) {
  // Fast-ish 32-bit mix for deterministic per-entity/per-tile variation.
  n |= 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return n >>> 0;
}

function rand01(id, salt) {
  const h = hashU32((id | 0) ^ Math.imul(salt | 0, 0x9e3779b1));
  return (h & 0xffff) / 0xffff;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(a, b, t) {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function rgbCss(rgb, a = 1) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

const SKY_PALETTES = {
  dawn:   { top: [64, 82, 170], bottom: [255, 173, 122] },
  noon:   { top: [62, 152, 222], bottom: [156, 220, 255] },
  sunset: { top: [96, 52, 160], bottom: [255, 124, 72] },
  night:  { top: [10, 14, 34], bottom: [22, 28, 56] },
};

function skyKeyForPhase(phase) {
  switch (phase) {
    case PHASE_COUNTDOWN:
    case PHASE_ARMY_MARCH:
      return 'dawn';
    case PHASE_OPEN_BATTLE:
      return 'noon';
    case PHASE_CASTLE_ASSAULT:
      return 'sunset';
    case PHASE_FINAL_STAND:
    case PHASE_VICTORY:
      return 'night';
    default:
      return 'noon';
  }
}

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

    // Better death visuals without changing the network contract.
    this._deathFxMs = Math.min(1300, DEATH_ANIM_MS);
    this._deathTimers = new Map(); // entityId -> ms remaining

    // Environment FX
    this._projLast = new Map(); // projId -> { type, x, y }
    this._craters = []; // { x, y, r, ageMs }
    this._maxCraters = 60;

    // Sky transition (phase-driven, blended)
    const baseSky = SKY_PALETTES.noon;
    this._skyFrom = { top: [...baseSky.top], bottom: [...baseSky.bottom] };
    this._skyTo = { top: [...baseSky.top], bottom: [...baseSky.bottom] };
    this._skyBlend = 1; // 0..1
    this._lastPhase = null;
    this._lastSnapshotTick = null;

    // Procedural clouds (stable, drift slowly)
    this._clouds = [];
    const cloudCount = 16;
    for (let i = 0; i < cloudCount; i++) {
      const r = 28 + Math.random() * 70;
      this._clouds.push({
        x: Math.random() * WORLD_WIDTH,
        y: 0.10 + Math.random() * 0.45, // fraction of sky height
        r,
        speed: 6 + Math.random() * 14, // world units / sec
        alpha: 0.08 + Math.random() * 0.12,
        parallax: 0.16 + Math.random() * 0.10,
      });
    }

    // Foreground silhouettes for speed/depth
    this._foreground = [];
    const fgCount = 26;
    for (let i = 0; i < fgCount; i++) {
      this._foreground.push({
        x: Math.random() * WORLD_WIDTH,
        s: 14 + Math.random() * 40,
        kind: Math.random() < 0.65 ? 'bush' : 'rock',
        parallax: 1.18 + Math.random() * 0.22,
        alpha: 0.14 + Math.random() * 0.18,
      });
    }

    // Animation clock driven by update(dt) so we can "hit stop" by skipping updates.
    this._animTime = 0;

    // Deterministic per-entity variety.
    this._variants = new Map(); // entityId -> { sx, sy, skin, skinStroke, pants, hair, metalTint }
  }

  update(dtMs) {
    this._animTime += dtMs / 1000;

    // Sky blend
    if (this._skyBlend < 1) {
      this._skyBlend += dtMs / 1600;
      if (this._skyBlend > 1) this._skyBlend = 1;
    }

    // Clouds drift
    const dtSec = dtMs / 1000;
    for (const c of this._clouds) {
      c.x += c.speed * dtSec;
      if (c.x > WORLD_WIDTH + 400) c.x = -400;
    }

    // Crater aging (keep them mostly persistent, but cap count).
    for (const cr of this._craters) cr.ageMs += dtMs;

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

    // Death FX timers
    for (const [id, ms] of this._deathTimers) {
      const next = ms - dtMs;
      if (next <= 0) this._deathTimers.delete(id);
      else this._deathTimers.set(id, next);
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

  _resetMatchFx() {
    this._projLast.clear();
    this._craters = [];
    this._deathTimers.clear();
  }

  _setSkyTargetForPhase(phase) {
    const key = skyKeyForPhase(phase);
    const pal = SKY_PALETTES[key] || SKY_PALETTES.noon;

    // If no phase yet, snap.
    if (this._lastPhase == null) {
      this._skyFrom = { top: [...pal.top], bottom: [...pal.bottom] };
      this._skyTo = { top: [...pal.top], bottom: [...pal.bottom] };
      this._skyBlend = 1;
      this._lastPhase = phase;
      return;
    }

    if (phase !== this._lastPhase) {
      // Blend from current -> new target.
      const cur = {
        top: lerpRgb(this._skyFrom.top, this._skyTo.top, this._skyBlend),
        bottom: lerpRgb(this._skyFrom.bottom, this._skyTo.bottom, this._skyBlend),
      };
      this._skyFrom = { top: [...cur.top], bottom: [...cur.bottom] };
      this._skyTo = { top: [...pal.top], bottom: [...pal.bottom] };
      this._skyBlend = 0;
      this._lastPhase = phase;
    }
  }

  _addCrater(wx, wy) {
    const r = 16 + rand01(wx | 0, wy | 0) * 20;
    this._craters.push({ x: wx, y: wy, r, ageMs: 0 });
    if (this._craters.length > this._maxCraters) {
      this._craters.shift();
    }
  }

  _trackProjectileImpacts(projectiles) {
    const seen = new Set();
    if (projectiles) {
      for (const p of projectiles) {
        const id = p[0];
        seen.add(id);
        this._projLast.set(id, { type: p[1], x: p[3], y: p[4] });
      }
    }

    for (const [id, last] of this._projLast) {
      if (seen.has(id)) continue;
      if (last.type === PROJ_ROCK) {
        this._addCrater(last.x, last.y);
      }
      this._projLast.delete(id);
    }
  }

  _variantFor(entityId) {
    const cached = this._variants.get(entityId);
    if (cached) return cached;

    // Size ±5%
    const sx = 0.95 + rand01(entityId, 1001) * 0.10;
    const sy = 0.95 + rand01(entityId, 1002) * 0.10;

    // Skin tones (warm hue spread, varied lightness)
    const sh = Math.round(24 + rand01(entityId, 1101) * 14);
    const ss = Math.round(34 + rand01(entityId, 1102) * 22);
    const sl = Math.round(38 + rand01(entityId, 1103) * 34);
    const skin = `hsl(${sh} ${ss}% ${sl}%)`;
    const skinStroke = `hsl(${sh} ${Math.max(18, ss - 6)}% ${Math.max(16, sl - 18)}%)`;

    // Pants vary a bit so the army doesn't look like clones.
    const pl = Math.round(16 + rand01(entityId, 1201) * 14);
    const pants = `hsl(228 18% ${pl}%)`;

    // Hair (used for non-helmet roles)
    const hl = Math.round(10 + rand01(entityId, 1301) * 22);
    const hair = `hsl(28 28% ${hl}%)`;

    // Slight metal tint variance for helmet/weapon shine.
    const metalTint = 0.90 + rand01(entityId, 1401) * 0.18;

    const v = { sx, sy, skin, skinStroke, pants, hair, metalTint };
    this._variants.set(entityId, v);
    return v;
  }

  render(snapshot, localPlayerId) {
    if (!snapshot) return;
    const ctx = this.ctx;
    const cam = this.camera;

    // New match detection (tick resets)
    if (this._lastSnapshotTick != null && snapshot.tick < this._lastSnapshotTick) {
      this._resetMatchFx();
    }
    this._lastSnapshotTick = snapshot.tick;

    this._setSkyTargetForPhase(snapshot.phase);
    this._trackProjectileImpacts(snapshot.projectiles);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawSky();
    this.drawClouds();
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
        if (!this._deathTimers.has(d.id)) this._deathTimers.set(d.id, this._deathFxMs);
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

    this.drawForeground();
    this.drawVignette();
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
    const v = d.isRoyal ? null : this._variantFor(d.id);
    const vSx = v ? v.sx : 1;
    const vSy = v ? v.sy : 1;
    const bw = BODY_WIDTH * cam.scale * scale * vSx;
    const bh = BODY_HEIGHT * cam.scale * scale * vSy;
    const hr = HEAD_RADIUS * cam.scale * scale * ((vSx + vSy) / 2);
    const color = d.team === TEAM_BLUE ? BLUE_COLOR : RED_COLOR;
    const darkColor = d.team === TEAM_BLUE ? BLUE_DARK : RED_DARK;

    // Animation tier: near camera center gets full detail
    const dist = cam.distFromCenter(d.x);
    const fullDetail = d.isLocal || d.isRoyal || dist < 520;

    const now = this._animTime;
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

    const skin = v ? v.skin : '#f2c9a0';
    const skinStroke = v ? v.skinStroke : '#c48f6a';
    const pants = v ? v.pants : '#2b2e3a';
    const boots = '#1e1b18';
    const metal = '#b7b7b7';
    const metalDark = '#8a8a8a';

    const weaponDir = d.facing === 0 ? 1 : -1;

    const flashMs = this._hitTimers.get(d.id) || 0;
    const flashA = flashMs > 0 ? Math.max(0, Math.min(1, flashMs / this._hitFlashMs)) : 0;
    const squashX = 1 + flashA * 0.06;
    const squashY = 1 - flashA * 0.08;
    const attackPush = (d.state === STATE_ATTACK && !d.isOnWall) ? weaponDir * 1.2 * cam.scale : 0;

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

    // Impact squash/stretch + slight forward shove when attacking.
    if (flashA > 0 || attackPush !== 0) {
      ctx.translate(feetX, feetY);
      ctx.scale(squashX, squashY);
      ctx.translate(-feetX, -feetY);
      if (attackPush !== 0) ctx.translate(attackPush, 0);
    }

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
    const headLag = moving
      ? (Math.abs(Math.sin(walkT - 0.45)) - Math.abs(Math.sin(walkT))) * 2.0 * cam.scale
      : 0;
    const headY = torsoY - hr * 0.9 + headLag;
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

      // Subtle metal shine streak
      ctx.save();
      ctx.globalAlpha = 0.12 * (v ? v.metalTint : 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2 * cam.scale * scale;
      ctx.beginPath();
      ctx.arc(headX - weaponDir * hr * 0.15, headY - hr * 0.45, hr * 0.78, Math.PI * 1.10, Math.PI * 1.40);
      ctx.stroke();
      ctx.restore();
    } else if (fullDetail && !d.isRoyal && v && d.type === TYPE_ARCHER) {
      // Archers show a bit of hair (no helmet).
      ctx.save();
      ctx.fillStyle = v.hair;
      ctx.globalAlpha = 0.70;
      ctx.beginPath();
      ctx.arc(headX - weaponDir * hr * 0.25, headY - hr * 0.30, hr * 0.72, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.restore();
    }

    // Face
    if (fullDetail) {
      const eyeDir = weaponDir;
      const ex = headX + eyeDir * hr * 0.25;
      const ey = headY - hr * 0.15;

      // Occasional blink (deterministic per entity).
      const blinkPeriod = 3.2 + rand01(d.id, 2001) * 3.6;
      const blinkOffset = rand01(d.id, 2002) * blinkPeriod;
      const bt = (now + blinkOffset) % blinkPeriod;
      const blinking = bt < 0.12;

      if (blinking) {
        ctx.strokeStyle = 'rgba(20, 10, 10, 0.65)';
        ctx.lineWidth = 1.4 * cam.scale * scale;
        ctx.beginPath();
        ctx.moveTo(ex - hr * 0.18, ey);
        ctx.lineTo(ex + hr * 0.18, ey);
        ctx.moveTo(ex + eyeDir * hr * 0.35 - hr * 0.16, ey);
        ctx.lineTo(ex + eyeDir * hr * 0.35 + hr * 0.16, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(ex, ey, hr * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + eyeDir * hr * 0.35, ey, hr * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }

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
          // Shine
          ctx.save();
          ctx.globalAlpha = 0.14 * (v ? v.metalTint : 1);
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 1.2 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 1.5 * cam.scale * scale, weaponY - 1.0 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 15.5 * cam.scale * scale, weaponY - 9.0 * cam.scale * scale);
          ctx.stroke();
          ctx.restore();
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
          // Shine
          ctx.save();
          ctx.globalAlpha = 0.14 * (v ? v.metalTint : 1);
          ctx.strokeStyle = 'rgba(255,255,255,0.70)';
          ctx.lineWidth = 1.1 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 34 * cam.scale * scale, weaponY - 6.5 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 41 * cam.scale * scale, weaponY - 4.8 * cam.scale * scale);
          ctx.stroke();
          ctx.restore();
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
          // Shine
          ctx.save();
          ctx.globalAlpha = 0.12 * (v ? v.metalTint : 1);
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
          ctx.lineWidth = 1.2 * cam.scale * scale;
          ctx.beginPath();
          ctx.moveTo(weaponX + weaponDir * 10 * cam.scale * scale, weaponY - 3.2 * cam.scale * scale);
          ctx.lineTo(weaponX + weaponDir * 22 * cam.scale * scale, weaponY - 3.8 * cam.scale * scale);
          ctx.stroke();
          ctx.restore();
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
        const blocking = d.state === STATE_BLOCK;
        const shieldY = torsoY + torsoH * (blocking ? 0.48 : 0.55);
        const shieldScale = blocking ? 1.18 : 1;
        const sw = 10 * cam.scale * scale * shieldScale;
        const sh = 14 * cam.scale * scale * shieldScale;
        const showShield = d.state === STATE_BLOCK || d.isPlayer || d.isRoyal;

        if (showShield) {
          roundRectPath(ctx, shieldX - sw / 2, shieldY - sh / 2, sw, sh, 4 * cam.scale * scale);
          ctx.fillStyle = blocking ? '#8b6a45' : '#7a5a3a';
          ctx.fill();
          ctx.strokeStyle = blocking ? 'rgba(255, 221, 68, 0.85)' : '#3b2a1a';
          ctx.lineWidth = (blocking ? 2.6 : 2) * cam.scale * scale;
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
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.26 * flashA;
      ctx.fillStyle = 'rgba(255, 250, 240, 1)';
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

    // Local player marker
    if (d.isLocal) {
      const t = performance.now() / 1000;
      const bounce = Math.sin(t * 5) * 2 * cam.scale;
      const my = torsoTopY - hr * 2.1 - 16 * cam.scale + bounce;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#ffdd44';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 2 * cam.scale;
      ctx.beginPath();
      ctx.moveTo(feetX, my);
      ctx.lineTo(feetX - 7 * cam.scale, my - 11 * cam.scale);
      ctx.lineTo(feetX + 7 * cam.scale, my - 11 * cam.scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
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

    const ms = this._deathTimers.get(d.id) ?? 0;
    const t = this._deathFxMs > 0 ? Math.max(0, Math.min(1, 1 - (ms / this._deathFxMs))) : 1;
    const alpha = 0.65 * (1 - t);
    const fall = t * t * 10 * cam.scale;
    const rotDir = d.facing === 0 ? 1 : -1;
    const rot = rotDir * lerp(0, 1.10, t);

    ctx.save();
    ctx.translate(pos.x, pos.y + fall);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    // Crumble into a couple chunks.
    for (let i = 0; i < 3; i++) {
      const ox = (rand01(d.id, 70 + i * 13) - 0.5) * 14 * cam.scale;
      const oy = (rand01(d.id, 90 + i * 17)) * 8 * cam.scale;
      const pw = bh * (0.30 + rand01(d.id, 110 + i * 19) * 0.28);
      const ph = bw * (0.35 + rand01(d.id, 140 + i * 23) * 0.25);
      ctx.globalAlpha = alpha * (0.85 - i * 0.15);
      ctx.fillRect(-pw / 2 + ox, -ph / 2 + oy, pw, ph);
    }

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
    const cam = this.camera;

    const top = lerpRgb(this._skyFrom.top, this._skyTo.top, this._skyBlend);
    const bottom = lerpRgb(this._skyFrom.bottom, this._skyTo.bottom, this._skyBlend);

    const gradient = ctx.createLinearGradient(0, 0, 0, cam.groundScreenY);
    gradient.addColorStop(0, rgbCss(top, 1));
    gradient.addColorStop(1, rgbCss(bottom, 1));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, cam.groundScreenY);

    // Subtle sun glow (skip at night).
    const skyKey = skyKeyForPhase(this._lastPhase ?? PHASE_OPEN_BATTLE);
    if (skyKey !== 'night') {
      const w = this.canvas.width;
      const h = cam.groundScreenY;
      const sunX = w * (skyKey === 'sunset' ? 0.72 : 0.80);
      const sunY = h * (skyKey === 'dawn' ? 0.42 : 0.30);
      const r = Math.min(w, h) * (skyKey === 'sunset' ? 0.38 : 0.30);
      const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
      const warm = skyKey === 'sunset' ? [255, 156, 90] : [255, 220, 160];
      sun.addColorStop(0, rgbCss(warm, 0.18));
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, cam.groundScreenY);
    }
  }

  drawClouds() {
    const ctx = this.ctx;
    const cam = this.camera;
    const w = this.canvas.width;
    const skyH = cam.groundScreenY;

    const top = lerpRgb(this._skyFrom.top, this._skyTo.top, this._skyBlend);
    const bottom = lerpRgb(this._skyFrom.bottom, this._skyTo.bottom, this._skyBlend);
    const tint = lerpRgb(top, bottom, 0.55);
    const cloudRgb = lerpRgb(tint, [255, 255, 255], 0.70);

    ctx.save();
    ctx.fillStyle = rgbCss(cloudRgb, 1);

    for (const c of this._clouds) {
      const sx = (c.x - cam.x * c.parallax) * cam.scale;
      if (sx < -400 || sx > w + 400) continue;

      const sy = c.y * skyH;
      const r = c.r * cam.scale;

      ctx.globalAlpha = c.alpha;
      ctx.beginPath();
      ctx.ellipse(sx - r * 0.55, sy + r * 0.08, r * 0.85, r * 0.44, 0, 0, Math.PI * 2);
      ctx.ellipse(sx - r * 0.05, sy - r * 0.10, r * 1.05, r * 0.52, 0, 0, Math.PI * 2);
      ctx.ellipse(sx + r * 0.55, sy + r * 0.06, r * 0.90, r * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();

      // Soft highlight pass
      ctx.globalAlpha = c.alpha * 0.45;
      ctx.beginPath();
      ctx.ellipse(sx, sy - r * 0.16, r * 0.72, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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
    const w = this.canvas.width;

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

    // Persistent craters/scorch marks (rocks)
    for (const cr of this._craters) {
      if (!cam.isOnScreen(cr.x)) continue;
      const pos = cam.worldToScreen(cr.x, cr.y, false);
      const r = cr.r * cam.scale;

      ctx.save();
      ctx.globalAlpha = 0.50;

      const burn = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 1.4);
      burn.addColorStop(0, 'rgba(0,0,0,0.28)');
      burn.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = burn;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, r * 1.6, r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.65;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, r * 1.25, r * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cracks
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      const spokes = 5;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + (cr.x * 0.001);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x + Math.cos(a) * r * (1.1 + (i % 2) * 0.3), pos.y + Math.sin(a) * r * 0.55);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Procedural grass tufts (deterministic per world-x tile)
    const step = 55;
    const startX = Math.floor(cam.x / step) * step - step * 2;
    const endX = cam.x + cam.worldViewWidth + step * 2;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;

    for (let wx = startX; wx <= endX; wx += step) {
      const tile = (wx / step) | 0;
      const h = hashU32(tile);
      const wy = ((h & 1023) / 1023) * GROUND_Y_MAX;
      const pos = cam.worldToScreen(wx, wy, false);
      if (pos.x < -30 || pos.x > w + 30) continue;

      const height = 4 + ((h >>> 10) & 7);
      const spread = 2 + ((h >>> 13) & 3);
      const sway = ((h >>> 16) & 15) / 15 * 2 - 1;

      ctx.strokeStyle = ((h >>> 20) & 1) ? 'rgba(60, 150, 70, 0.55)' : 'rgba(70, 170, 80, 0.45)';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - spread, pos.y - height);
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + sway, pos.y - height - 1);
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + spread, pos.y - height + 1);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawForeground() {
    const ctx = this.ctx;
    const cam = this.camera;
    const w = this.canvas.width;
    const baseY = cam.groundScreenY + cam.groundBandHeight + 30 * cam.scale;

    ctx.save();
    ctx.filter = 'blur(1.2px)';
    ctx.fillStyle = '#0b120c';

    for (const fg of this._foreground) {
      const sx = (fg.x - cam.x * fg.parallax) * cam.scale;
      if (sx < -120 || sx > w + 120) continue;
      const r = fg.s * cam.scale;

      ctx.globalAlpha = fg.alpha;
      if (fg.kind === 'bush') {
        ctx.beginPath();
        ctx.arc(sx - r * 0.5, baseY + r * 0.2, r * 0.65, Math.PI, 0);
        ctx.arc(sx, baseY, r * 0.85, Math.PI, 0);
        ctx.arc(sx + r * 0.55, baseY + r * 0.25, r * 0.60, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        // rock
        ctx.beginPath();
        ctx.moveTo(sx - r * 0.7, baseY + r * 0.35);
        ctx.lineTo(sx - r * 0.2, baseY - r * 0.2);
        ctx.lineTo(sx + r * 0.6, baseY - r * 0.05);
        ctx.lineTo(sx + r * 0.85, baseY + r * 0.35);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawVignette() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h * 0.55;
    const inner = Math.min(w, h) * 0.28;
    const outer = Math.max(w, h) * 0.80;

    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.50)');

    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
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
