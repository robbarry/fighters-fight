import { PHASE_COUNTDOWN, PHASE_VICTORY, PHASE_ARMY_MARCH, PHASE_OPEN_BATTLE,
         PHASE_CASTLE_ASSAULT, PHASE_FINAL_STAND,
         STATE_SPECTATING, STATE_DEAD, TEAM_BLUE, TEAM_RED } from '/shared/constants.js';
import * as MT from '/shared/message-types.js';
import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Interpolation } from './interpolation.js';
import { HUD } from './hud.js';
import { ParticleSystem } from './particles.js';

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

    this._boundLoop = this._loop.bind(this);
  }

  start(playerId) {
    this.localPlayerId = playerId;
    this.running = true;
    this.canvas.style.display = 'block';
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this._boundLoop);
  }

  _loop(timestamp) {
    if (!this.running) return;

    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    this._update(dt, timestamp);
    this._render();

    requestAnimationFrame(this._boundLoop);
  }

  _update(dt, now) {
    // Send input at ~20Hz
    if (now - this.lastInputSend > 50) {
      // Update mouse world coordinates
      const worldMouse = this.camera.screenToWorld(this.input.mouseX, this.input.mouseY);
      this.input.mouseWorldX = worldMouse.x;
      this.input.mouseWorldY = worldMouse.y;

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

    // Update HUD
    this.hud.update(dt);

    // Countdown
    if (this.countdownSeconds > 0) {
      this.countdownSeconds -= dt / 1000;
    }
  }

  _render() {
    const snap = this.interpolation.getInterpolated();
    if (!snap) return;

    // Find local player
    let localPlayer = null;
    if (snap.players) {
      localPlayer = snap.players.find(p => p[0] === this.localPlayerId);
    }

    // Determine camera follow target
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
      case MT.EVT_HIT:
        this.particles.emit('hit_spark', evt.x, evt.y, 6);
        break;
      case MT.EVT_DEATH:
        this.particles.emit('death', evt.x, evt.y, 12);
        break;
      case MT.EVT_GATE_BREAK:
        this.particles.emit('gate_break', evt.x || 3000, evt.y || 30, 30);
        break;
      case MT.EVT_PHASE: {
        const text = PHASE_ANNOUNCE[evt.phase];
        if (text) this.hud.showPhaseText(text);
        break;
      }
      case MT.EVT_SHOUT:
      case MT.EVT_CALLOUT: {
        const text = SHOUT_TEXTS[evt.s ?? evt.msg] || '!';
        this.hud.addChatBubble(evt.id, text, evt.x || 0, evt.y || 0);
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
  }
}
