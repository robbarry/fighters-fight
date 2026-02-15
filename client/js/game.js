import { PHASE_COUNTDOWN, PHASE_VICTORY, PHASE_ARMY_MARCH, PHASE_OPEN_BATTLE,
		         PHASE_CASTLE_ASSAULT, PHASE_FINAL_STAND,
		         STATE_SPECTATING, STATE_DEAD, TEAM_BLUE, TEAM_RED,
		         TYPE_GUNNER, TYPE_CATAPULT, CATAPULT_CHARGE_MS,
		         BLUE_CASTLE_X, RED_CASTLE_X, CASTLE_WIDTH } from '/shared/constants.js';
import * as MT from '/shared/message-types.js';
import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Interpolation } from './interpolation.js';
import { HUD } from './hud.js';
import { ParticleSystem } from './particles.js';
import { roleName } from './roles.js';

const SHOUT_TEXTS = ['I need help!', "Let's go!", 'Hi!', 'FIRING!', 'Throwing spears!'];
const PHASE_ANNOUNCE = {
  [PHASE_ARMY_MARCH]: 'MARCH!',
  [PHASE_OPEN_BATTLE]: 'FIGHT!',
  [PHASE_CASTLE_ASSAULT]: 'CHARGE THE CASTLE!',
  [PHASE_FINAL_STAND]: 'FINAL STAND!',
};

export class Game {
  constructor(canvas, network) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.network = network;
    this.camera = new Camera(canvas.width, canvas.height);
    this.renderer = new Renderer(canvas, this.camera);
    this.input = new Input(canvas);
    this.interpolation = new Interpolation();
    this.hud = new HUD(canvas);
    this.particles = new ParticleSystem();

    this.localPlayerId = null;
    this.running = false;
    this.lastInputSend = 0;
    this.lastFrameTime = 0;
    this.countdownSeconds = 0;
    this.spectateIndex = 0;
    this.winner = null;

    this._entityIndex = new Map(); // id -> { kind, type, isOnWall, isKing }
    this._localRole = null;
    this._controlsRoyalId = 0;
    this._localChargeMs = 0;
    this._lastDamageFrom = null;
    this._lastDamageAt = 0;

    // Render-only impact pause for "hit stop" (do not pause network input).
    this._hitStopMs = 0;
    this._hitStopSnap = null;
    this._hitStopLocalPlayer = null;

    this._boundLoop = this._loop.bind(this);
  }

  onSnapshot(snap) {
    this.interpolation.push(snap);
    this._indexSnapshot(snap);
  }

  _indexSnapshot(snap) {
    this._entityIndex.clear();

    if (snap.soldiers) {
      for (const s of snap.soldiers) {
        this._entityIndex.set(s[0], { kind: 'soldier', type: s[1], isOnWall: !!s[8] });
      }
    }

    if (snap.players) {
      for (const p of snap.players) {
        this._entityIndex.set(p[0], { kind: 'player', type: p[1], isOnWall: !!p[9] });
      }
    }

    if (snap.royals) {
      for (const r of snap.royals) {
        this._entityIndex.set(r[0], { kind: 'royal', type: null, isOnWall: false, isKing: !!r[1] });
      }
    }

    // Cache local role for UI (charge meter, aim assist, etc.)
    if (this.localPlayerId != null && snap.players) {
      const lp = snap.players.find(p => p[0] === this.localPlayerId);
      if (lp) {
        this._localRole = lp[1];
        this._controlsRoyalId = lp[10] || 0;
      } else {
        this._controlsRoyalId = 0;
      }
    }
  }

  start(playerId) {
    this.localPlayerId = playerId;
    this.running = true;
    this.canvas.style.display = 'block';
    this.lastFrameTime = performance.now();
    this.hud.showToast('Press ? for controls', 2400);
    requestAnimationFrame(this._boundLoop);
  }

  _loop(timestamp) {
    if (!this.running) return;

    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    // Update camera shake timers even during hit stop.
    this.camera.update(dt);

    const liveSnap = this.interpolation.getInterpolated();
    const liveLocalPlayer = this._getLocalPlayer(liveSnap);

    // Freeze camera follow during hit stop so the frame truly "sticks".
    if (this._hitStopMs <= 0) {
      this._updateCamera(liveSnap, liveLocalPlayer);
    }

    // Always send input / aim updates; optionally freeze purely-visual timers.
    this._update(dt, timestamp, this._hitStopMs > 0);

    let snap = liveSnap;
    let localPlayer = liveLocalPlayer;
    if (this._hitStopMs > 0) {
      if (snap && !this._hitStopSnap) {
        this._hitStopSnap = snap;
        this._hitStopLocalPlayer = localPlayer;
      }
      snap = this._hitStopSnap || snap;
      localPlayer = this._hitStopLocalPlayer || localPlayer;

      this._hitStopMs -= dt;
      if (this._hitStopMs <= 0) {
        this._hitStopMs = 0;
        this._hitStopSnap = null;
        this._hitStopLocalPlayer = null;
      }
    } else {
      this._hitStopSnap = null;
      this._hitStopLocalPlayer = null;
    }

    this._render(snap, localPlayer);

    requestAnimationFrame(this._boundLoop);
  }

  _update(dt, now, freezeFx = false) {
    // Update mouse world coordinates every frame (for responsive aiming).
    const worldMouse = this.camera.screenToWorld(this.input.mouseX, this.input.mouseY);
    this.input.mouseWorldX = worldMouse.x;
    this.input.mouseWorldY = worldMouse.y;
    this.hud.setAim(this.input.mouseX, this.input.mouseY, worldMouse.x, worldMouse.y);

    // Send input at ~20Hz
    if (now - this.lastInputSend > 50) {
      this.network.send(this.input.toInputMessage());
      this.lastInputSend = now;

      // Check for shouts
      const shout = this.input.consumeShout();
      if (shout !== null) {
        this.network.send({ t: MT.MSG_SHOUT, s: shout });
      }
    }

    // Spectator Tab cycling
    if (this.input.consumeTab()) {
      this.spectateIndex++;
    }

    // Zoom out to a full battlefield overview (useful during long marches).
    if (this.input.consumeOverviewToggle && this.input.consumeOverviewToggle()) {
      const next = !this.camera.isOverview();
      this.camera.setOverview(next);
      this.hud.showToast(next ? 'Overview: ON (Z)' : 'Overview: OFF (Z)', 1200);
    }

    if (freezeFx) return;

    // Update particles
    this.particles.update(dt);

    // Update renderer FX (hit flashes, tracers)
    this.renderer.update(dt);

    // Update HUD
    this.hud.update(dt);

    // Catapult charge meter (client-side estimate)
    if (this._localRole === TYPE_CATAPULT && this.input.isAttacking()) {
      this._localChargeMs = Math.min(CATAPULT_CHARGE_MS, this._localChargeMs + dt);
    } else {
      this._localChargeMs = 0;
    }
    this.hud.setChargeMs(this._localChargeMs);

    // Countdown
    if (this.countdownSeconds > 0) {
      this.countdownSeconds -= dt / 1000;
    }
  }

  _getLocalPlayer(snap) {
    if (!snap) return;
    if (!snap.players) return null;
    return snap.players.find(p => p[0] === this.localPlayerId) || null;
  }

  _updateCamera(snap, localPlayer) {
    if (!snap) return;
    let followX = 3000; // default world center
    if (localPlayer) {
      const controlsRoyalId = localPlayer[10] || 0;
      if (controlsRoyalId && snap.royals) {
        const myRoyal = snap.royals.find(r => r[0] === controlsRoyalId);
        if (myRoyal) {
          followX = myRoyal[3];
        }
      } else if (localPlayer[6] === STATE_SPECTATING && snap.soldiers) {
        // Follow an ally soldier
        const team = localPlayer[2];
        const allies = snap.soldiers.filter(s => s[2] === team && s[6] !== STATE_DEAD);
        if (allies.length > 0) {
          const idx = this.spectateIndex % allies.length;
          followX = allies[idx][3];
        }
      } else {
        followX = localPlayer[3];
      }
    }

    const mouseRatio = Math.max(0, Math.min(1, this.input.mouseX / this.canvas.width));
    this.camera.follow(followX, mouseRatio);
  }

  _render(snap, localPlayer) {
    if (!snap) return;

    // Draw everything
    this.renderer.render(snap, this.localPlayerId);
    this.particles.render(this.ctx, this.camera);
    this.hud.render(snap, localPlayer, this.camera);

    // Countdown overlay
    if (this.countdownSeconds > 0) {
      this.hud.renderCountdown(this.countdownSeconds);
    }

    // Victory overlay
    if (snap.phase === PHASE_VICTORY && this.winner !== undefined && this.winner !== null) {
      this.hud.renderVictory(this.winner);
    }
  }

  _startHitStop(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    if (this._hitStopMs <= 0) {
      // Capture a freeze-frame on the next render tick.
      this._hitStopSnap = null;
      this._hitStopLocalPlayer = null;
    }
    this._hitStopMs = Math.max(this._hitStopMs, ms);
  }

  handleEvent(evt) {
    switch (evt.e) {
      case MT.EVT_HIT: {
        const victim = evt.victimId != null ? this._entityIndex.get(evt.victimId) : null;
        const attacker = evt.attackerId != null ? this._entityIndex.get(evt.attackerId) : null;

        const x = evt.x || 0;
        const y = evt.y || 0;
        const dmg = evt.dmg != null ? Math.max(0, Math.round(evt.dmg)) : 0;
        const isOnWall = !!victim?.isOnWall;
        const isCatapultImpact = attacker && attacker.type === TYPE_CATAPULT;
        const isRoyalVictim = victim && victim.kind === 'royal';
        const critical = !!(isCatapultImpact || isRoyalVictim || dmg >= 16);

        const shouldFx = this.camera.isOnScreen(x) || evt.victimId === this.localPlayerId;
        if (shouldFx) {
          this.particles.emit('hit_spark', x, y, isCatapultImpact ? 10 : 6, { isOnWall });
          this.particles.emit('blood', x, y, isCatapultImpact ? 10 : 7, { isOnWall });
          if (isCatapultImpact) {
            this.particles.emit('debris', x, y, 16, { isOnWall });
            this.particles.emit('shockwave', x, y, 1, { isOnWall, size: 100, color: 'rgba(255, 255, 255, 0.4)' });
          }
          this.hud.addDamageNumber(dmg, x, y, isOnWall, critical, evt.blocked);
        }

        if (critical) {
          this._startHitStop(isCatapultImpact ? 46 : 34);
          this.camera.shake(isCatapultImpact ? 12 : 6, isCatapultImpact ? 240 : 150);
        }

        if (evt.victimId != null) {
          this.renderer.flashHit(evt.victimId);
        }

        // Make hitscan kills readable even when you aren't the victim.
        if (attacker && attacker.type === TYPE_GUNNER && evt.victimId != null) {
          this.renderer.addTracer(evt.attackerId, evt.victimId);
        }

        const isLocalVictim = (
          evt.victimId === this.localPlayerId ||
          (this._controlsRoyalId && evt.victimId === this._controlsRoyalId)
        );
        if (isLocalVictim) {
          this._lastDamageFrom = attacker || null;
          this._lastDamageAt = performance.now();

          // Make it obvious why you took damage (especially for hitscan).
          this.hud.flashDamage();
          const who = attacker
            ? attacker.kind === 'royal' ? (attacker.isKing ? 'King' : 'Queen') : roleName(attacker.type)
            : 'Unknown';
          const victimLabel = victim && victim.kind === 'royal'
            ? (victim.isKing ? 'King' : 'Queen')
            : null;
          this.hud.showToast(
            victimLabel ? `${victimLabel} hit by ${who} (-${dmg})` : `Hit by ${who} (-${dmg})`,
            1200
          );
          if (evt.attackerId != null) {
            this.renderer.addTracer(evt.attackerId, evt.victimId);
          }
        }
        break;
      }
      case MT.EVT_DEATH:
        {
          const dead = evt.id != null ? this._entityIndex.get(evt.id) : null;
          const isRoyal = dead && dead.kind === 'royal';
          const isOnWall = !!dead?.isOnWall;

          const x = evt.x || 0;
          const y = evt.y || 0;

          if (this.camera.isOnScreen(x) || evt.id === this.localPlayerId || isRoyal) {
            this.particles.emit('death', x, y, 10, { isOnWall });
            this.particles.emit('blood', x, y, isRoyal ? 18 : 12, { isOnWall });
            if (isRoyal) this.particles.emit('debris', x, y, 16, { isOnWall });
          }

          if (isRoyal) {
            this._startHitStop(48);
            this.camera.shake(14, 320);
          }
        }
        if (evt.id === this.localPlayerId || (this._controlsRoyalId && evt.id === this._controlsRoyalId)) {
          const now = performance.now();
          const killer = (this._lastDamageFrom && (now - this._lastDamageAt) < 2000)
            ? (this._lastDamageFrom.kind === 'royal'
              ? (this._lastDamageFrom.isKing ? 'King' : 'Queen')
              : roleName(this._lastDamageFrom.type))
            : null;
          const dead = evt.id != null ? this._entityIndex.get(evt.id) : null;
          const deadLabel = dead && dead.kind === 'royal'
            ? (dead.isKing ? 'King died' : 'Queen died')
            : 'You died';
          this.hud.showToast(killer ? `${deadLabel} (by ${killer})` : deadLabel, 1600);
        }
        break;
      case MT.EVT_GATE_BREAK:
        {
          const team = evt.team;
          const gx = team === TEAM_BLUE ? (BLUE_CASTLE_X + CASTLE_WIDTH) : RED_CASTLE_X;
          const gy = 0;
          if (this.camera.isOnScreen(gx) || this._hitStopMs > 0) {
            this.particles.emit('gate_break', gx, gy, 34);
            this.particles.emit('debris', gx, gy, 28);
          }
          this._startHitStop(50);
          this.camera.shake(18, 520);
        }
        this.hud.showToast('Gate broken! Push in!', 2200);
        break;
      case MT.EVT_PHASE: {
        const text = PHASE_ANNOUNCE[evt.phase];
        if (text) this.hud.showPhaseText(text);
        break;
      }
      case MT.EVT_AIM: {
        if (evt.id == null) break;
        const tx = evt.tx;
        const ty = evt.ty;
        this.renderer.addAimLine(evt.id, tx, ty, !!evt.tw, evt.ms || 0);
        break;
      }
      case MT.EVT_SHOUT:
      case MT.EVT_CALLOUT: {
        const text = SHOUT_TEXTS[evt.s ?? evt.msg] || '!';
        this.hud.addChatBubble(
          evt.id,
          text,
          evt.x || 0,
          evt.y || 0,
          !!this._entityIndex.get(evt.id)?.isOnWall,
        );
        break;
      }
      case MT.EVT_GAMEOVER:
        this.winner = evt.winner;
        break;
    }
  }

  showCountdown(seconds) {
    this.countdownSeconds = seconds;
  }

  resize() {
    this.camera.resize(this.canvas.width, this.canvas.height);
  }

  stop() {
    this.running = false;
  }

  reset() {
    this.interpolation = new Interpolation();
    this.particles = new ParticleSystem();
    this.hud = new HUD(this.canvas);
    this.winner = null;
    this.countdownSeconds = 0;
    this.spectateIndex = 0;
    this._entityIndex.clear();
    this._localRole = null;
    this._controlsRoyalId = 0;
    this._localChargeMs = 0;
    this._lastDamageFrom = null;
    this._lastDamageAt = 0;
  }
}
