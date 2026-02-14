import { PHASE_COUNTDOWN, PHASE_VICTORY, PHASE_ARMY_MARCH, PHASE_OPEN_BATTLE,
	         PHASE_CASTLE_ASSAULT, PHASE_FINAL_STAND,
	         STATE_SPECTATING, STATE_DEAD, TEAM_BLUE, TEAM_RED,
	         TYPE_GUNNER, TYPE_CATAPULT, CATAPULT_CHARGE_MS } from '/shared/constants.js';
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
    this._localChargeMs = 0;
    this._lastDamageFrom = null;
    this._lastDamageAt = 0;

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
      if (lp) this._localRole = lp[1];
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

    const snap = this.interpolation.getInterpolated();
    const localPlayer = this._getLocalPlayer(snap);

    this._updateCamera(snap, localPlayer);
    this._update(dt, timestamp);
    this._render(snap, localPlayer);

    requestAnimationFrame(this._boundLoop);
  }

  _update(dt, now) {
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
      if (localPlayer[6] === STATE_SPECTATING && snap.soldiers) {
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

    this.camera.follow(followX);
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

  handleEvent(evt) {
    switch (evt.e) {
      case MT.EVT_HIT: {
        const victim = evt.victimId != null ? this._entityIndex.get(evt.victimId) : null;
        const attacker = evt.attackerId != null ? this._entityIndex.get(evt.attackerId) : null;

        this.particles.emit('hit_spark', evt.x, evt.y, 6, { isOnWall: !!victim?.isOnWall });

        if (evt.victimId != null) {
          this.renderer.flashHit(evt.victimId);
        }

        // Make hitscan kills readable even when you aren't the victim.
        if (attacker && attacker.type === TYPE_GUNNER && evt.victimId != null) {
          this.renderer.addTracer(evt.attackerId, evt.victimId);
        }

        if (evt.victimId === this.localPlayerId) {
          this._lastDamageFrom = attacker || null;
          this._lastDamageAt = performance.now();

          // Make it obvious why you took damage (especially for hitscan).
          this.hud.flashDamage();
          const who = attacker
            ? attacker.kind === 'royal' ? (attacker.isKing ? 'King' : 'Queen') : roleName(attacker.type)
            : 'Unknown';
          const dmg = evt.dmg != null ? Math.round(evt.dmg) : 0;
          this.hud.showToast(`Hit by ${who} (-${dmg})`, 1200);
          if (evt.attackerId != null) {
            this.renderer.addTracer(evt.attackerId, evt.victimId);
          }
        }
        break;
      }
      case MT.EVT_DEATH:
        this.particles.emit('death', evt.x, evt.y, 12, {
          isOnWall: !!this._entityIndex.get(evt.id)?.isOnWall,
        });
        if (evt.id === this.localPlayerId) {
          const now = performance.now();
          const killer = (this._lastDamageFrom && (now - this._lastDamageAt) < 2000)
            ? (this._lastDamageFrom.kind === 'royal'
              ? (this._lastDamageFrom.isKing ? 'King' : 'Queen')
              : roleName(this._lastDamageFrom.type))
            : null;
          this.hud.showToast(killer ? `Killed by ${killer}` : 'You died', 1600);
        }
        break;
      case MT.EVT_GATE_BREAK:
        this.particles.emit('gate_break', evt.x || 3000, evt.y || 30, 30);
        this.hud.showToast('Gate broken! Push in!', 2200);
        break;
      case MT.EVT_PHASE: {
        const text = PHASE_ANNOUNCE[evt.phase];
        if (text) this.hud.showPhaseText(text);
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
    this._localChargeMs = 0;
    this._lastDamageFrom = null;
    this._lastDamageAt = 0;
  }
}
