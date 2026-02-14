import { TEAM_BLUE, TEAM_RED, PHASE_LOBBY, PHASE_COUNTDOWN, PHASE_ARMY_MARCH,
         PHASE_OPEN_BATTLE, PHASE_CASTLE_ASSAULT, PHASE_FINAL_STAND, PHASE_VICTORY,
         STATE_RESPAWNING, STATE_SPECTATING, STATE_BLOCK,
         TYPE_ARCHER, TYPE_GUNNER, TYPE_CATAPULT,
         GATE_HP, CASTLE_WIDTH, BLUE_CASTLE_X, RED_CASTLE_X,
         ARROW_RANGE, BULLET_RANGE, ROCK_RANGE,
         CATAPULT_CHARGE_MS } from '/shared/constants.js';
import { roleName, roleUsesAim } from './roles.js';

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chatBubbles = [];
    this.countdownValue = 0;
    this.phaseText = '';
    this.phaseTextTimer = 0;
    this.winner = null;
    this.damageFlashTimer = 0;
    this.statusToast = '';
    this.statusToastTimer = 0;
    this.aim = { sx: 0, sy: 0, wx: 0, wy: 0 };
    this.chargeMs = 0;
  }

  setAim(sx, sy, wx, wy) {
    this.aim.sx = sx;
    this.aim.sy = sy;
    this.aim.wx = wx;
    this.aim.wy = wy;
  }

  setChargeMs(ms) {
    this.chargeMs = ms || 0;
  }

  showToast(text, ms = 1400) {
    this.statusToast = text;
    this.statusToastTimer = ms;
  }

  render(snapshot, localPlayer, camera) {
    if (!snapshot) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Army counts (top left)
    ctx.font = 'bold 18px system-ui';
    ctx.fillStyle = '#4488ff';
    ctx.textAlign = 'left';
    ctx.fillText(`Blue: ${snapshot.armyCounts ? snapshot.armyCounts[0] : 0}`, 20, 30);
    ctx.fillStyle = '#ff4444';
    ctx.fillText(`Red: ${snapshot.armyCounts ? snapshot.armyCounts[1] : 0}`, 20, 55);

    // Gate HP bars (top center, always visible)
    this._renderGateBars(snapshot.gates);

    // Phase text (top center)
    const phaseNames = ['', '', '', 'BATTLE!', 'CHARGE!', 'FINAL STAND!', ''];
    const phaseName = phaseNames[snapshot.phase] || '';
    if (phaseName) {
      ctx.font = 'bold 28px system-ui';
      ctx.fillStyle = '#ffdd44';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(phaseName, w / 2, 40);
      ctx.fillText(phaseName, w / 2, 40);
    }

    // Objective line (under phase)
    const objective = this._objectiveText(snapshot, localPlayer);
    if (objective) {
      ctx.font = 'bold 14px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 3;
      ctx.strokeText(objective, w / 2, 62);
      ctx.fillText(objective, w / 2, 62);
    }

    // Phase text animation (big announcement)
    if (this.phaseTextTimer > 0) {
      ctx.font = 'bold 48px system-ui';
      ctx.fillStyle = `rgba(255, 221, 68, ${Math.min(1, this.phaseTextTimer / 2)})`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      const text = this.phaseText;
      ctx.strokeText(text, w / 2, h * 0.35);
      ctx.fillText(text, w / 2, h * 0.35);
    }

    if (!localPlayer) return;

    // You (bottom left)
    const team = localPlayer[2];
    const role = localPlayer[1];
    const teamName = team === TEAM_BLUE ? 'BLUE' : 'RED';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = team === TEAM_BLUE ? '#a9c8ff' : '#ffb2b2';
    ctx.fillText(`You: ${teamName} ${roleName(role)}`, 20, h - 22);

    // Direction hint for objectives that might be off-screen
    this._renderObjectivePointer(snapshot, localPlayer, camera);

    // Player lives (top right)
    ctx.font = 'bold 18px system-ui';
    ctx.fillStyle = '#ff6666';
    ctx.textAlign = 'right';
    const lives = localPlayer[8];
    let heartsStr = '';
    for (let i = 0; i < Math.min(lives, 10); i++) heartsStr += '\u2665 ';
    ctx.fillText(heartsStr, w - 20, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Lives: ${lives}`, w - 20, 55);

    // Player health bar (bottom center)
    const hp = localPlayer[5];
    const maxHp = 40;
    const barW = 200;
    const barH = 20;
    const barX = w / 2 - barW / 2;
    const barY = h - 50;
    const hpPct = hp / maxHp;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';
    ctx.fillRect(barX, barY, barW * hpPct, barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(hp)} / ${maxHp}`, w / 2, barY + 15);

    // Block indicator
    if (localPlayer[6] === STATE_BLOCK) {
      ctx.font = 'bold 14px system-ui';
      ctx.fillStyle = '#ffdd44';
      ctx.textAlign = 'center';
      ctx.fillText('BLOCKING', w / 2, barY - 10);
    }

    // Catapult charge meter (client-side estimate, for feel)
    if (role === TYPE_CATAPULT) {
      const pct = CATAPULT_CHARGE_MS > 0 ? Math.max(0, Math.min(1, this.chargeMs / CATAPULT_CHARGE_MS)) : 0;
      const cw = 200;
      const ch = 8;
      const cx = w / 2 - cw / 2;
      const cy = barY - 18;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = pct > 0.98 ? '#ffdd44' : '#cbd8ff';
      ctx.fillRect(cx, cy, cw * pct, ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, cw, ch);
      if (pct > 0.98) {
        ctx.font = 'bold 12px system-ui';
        ctx.fillStyle = 'rgba(255, 221, 68, 0.95)';
        ctx.textAlign = 'center';
        ctx.fillText('RELEASE!', w / 2, cy - 2);
      }
    }

    // Aim assist (ranged roles)
    if (roleUsesAim(role) && !document.body.classList.contains('help-open')) {
      this._renderAimAssist(localPlayer, camera);
    }

    // Respawn overlay
    if (localPlayer[6] === STATE_RESPAWNING) {
      ctx.font = 'bold 36px system-ui';
      ctx.fillStyle = '#ff6666';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText('RESPAWNING...', w / 2, h / 2);
      ctx.fillText('RESPAWNING...', w / 2, h / 2);
    }

    // Spectator mode
    if (localPlayer[6] === STATE_SPECTATING) {
      ctx.font = 'bold 24px system-ui';
      ctx.fillStyle = '#aaa';
      ctx.textAlign = 'center';
      ctx.fillText('SPECTATING - Press Tab to switch', w / 2, h - 80);
    }

    // Chat bubbles
    this.renderChatBubbles(camera);

    // Toast line (hit feedback, tips, etc.)
    if (this.statusToastTimer > 0 && this.statusToast) {
      const a = Math.max(0, Math.min(1, this.statusToastTimer / 350));
      ctx.save();
      ctx.globalAlpha = 0.95 * a;
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.70)';
      ctx.lineWidth = 4;
      ctx.strokeText(this.statusToast, w / 2, h - 78);
      ctx.fillText(this.statusToast, w / 2, h - 78);
      ctx.restore();
    }

    // Damage flash (local player only)
    if (this.damageFlashTimer > 0) {
      const a = Math.min(1, this.damageFlashTimer / 250);
      ctx.save();
      ctx.fillStyle = `rgba(255, 60, 60, ${0.18 * a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  renderCountdown(seconds) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.font = 'bold 72px system-ui';
    ctx.fillStyle = '#ffdd44';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    const text = seconds > 0 ? String(Math.ceil(seconds)) : 'FIGHT!';
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillText(text, w / 2, h / 2);
  }

  renderVictory(winner) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Darken background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    const teamName = winner === TEAM_BLUE ? 'BLUE' : 'RED';
    const teamColor = winner === TEAM_BLUE ? '#4488ff' : '#ff4444';

    ctx.font = 'bold 64px system-ui';
    ctx.fillStyle = teamColor;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.strokeText(`${teamName} WINS!`, w / 2, h / 2 - 30);
    ctx.fillText(`${teamName} WINS!`, w / 2, h / 2 - 30);

    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = '#fff';
    ctx.fillText('Click to play again', w / 2, h / 2 + 30);
  }

  addChatBubble(id, text, x, y, isOnWall = false) {
    this.chatBubbles.push({ id, text, x, y, isOnWall: !!isOnWall, timer: 3000 });
  }

  renderChatBubbles(camera) {
    const ctx = this.ctx;
    for (let i = this.chatBubbles.length - 1; i >= 0; i--) {
      const b = this.chatBubbles[i];
      if (!camera) continue;
      const pos = camera.worldToScreen(b.x, b.y, b.isOnWall);
      const alpha = Math.min(1, b.timer / 500);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';

      // Bubble background
      const textW = ctx.measureText(b.text).width + 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      // roundRect may not exist in all browsers, use fallback
      const rx = pos.x - textW / 2;
      const ry = pos.y - 50;
      const rw = textW;
      const rh = 20;
      const radius = 5;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, radius);
      } else {
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.closePath();
      }
      ctx.fill();

      // Text
      ctx.fillStyle = '#fff';
      ctx.fillText(b.text, pos.x, pos.y - 35);
      ctx.restore();
    }
  }

  update(dt) {
    // Update chat bubble timers
    for (let i = this.chatBubbles.length - 1; i >= 0; i--) {
      this.chatBubbles[i].timer -= dt;
      if (this.chatBubbles[i].timer <= 0) {
        this.chatBubbles.splice(i, 1);
      }
    }

    // Phase text fade
    if (this.phaseTextTimer > 0) {
      this.phaseTextTimer -= dt / 1000;
    }

    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= dt;
      if (this.damageFlashTimer < 0) this.damageFlashTimer = 0;
    }

    if (this.statusToastTimer > 0) {
      this.statusToastTimer -= dt;
      if (this.statusToastTimer < 0) this.statusToastTimer = 0;
    }
  }

  showPhaseText(text) {
    this.phaseText = text;
    this.phaseTextTimer = 2;
  }

  flashDamage() {
    this.damageFlashTimer = 250;
  }

  _objectiveText(snapshot, localPlayer) {
    const phase = snapshot.phase;
    if (phase === PHASE_COUNTDOWN) return 'Get ready...';
    if (phase === PHASE_ARMY_MARCH) return 'Advance to the fight.';
    if (phase === PHASE_OPEN_BATTLE) return 'Win the field: wipe out enemy ground troops.';
    if (phase === PHASE_CASTLE_ASSAULT) return 'Break the enemy gate.';
    if (phase === PHASE_FINAL_STAND) {
      const royals = snapshot.royals || [];
      if (royals.length > 0 && localPlayer) {
        const royalTeam = royals[0][2];
        if (localPlayer[2] === royalTeam) return 'Defend the royals!';
        return 'Kill the King & Queen!';
      }
      return 'Final stand!';
    }
    return '';
  }

  _renderGateBars(gates) {
    if (!gates) return;
    const ctx = this.ctx;
    const w = this.canvas.width;

    const barW = 150;
    const barH = 10;
    const y = 18;
    const gap = 14;
    const totalW = barW * 2 + gap;
    const startX = w / 2 - totalW / 2;

    const draw = (label, hp, x, color) => {
      const pct = Math.max(0, Math.min(1, hp / GATE_HP));
      ctx.save();
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(label, x + barW / 2, y - 3);
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW * pct, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, barW, barH);
      ctx.restore();
    };

    draw('BLUE GATE', gates[0], startX, '#4488ff');
    draw('RED GATE', gates[1], startX + barW + gap, '#ff4444');
  }

  _renderAimAssist(localPlayer, camera) {
    const ctx = this.ctx;
    const role = localPlayer[1];
    const isOnWall = !!localPlayer[9];

    let maxRange = null;
    if (role === TYPE_ARCHER) maxRange = ARROW_RANGE;
    else if (role === TYPE_GUNNER) maxRange = BULLET_RANGE;
    else if (role === TYPE_CATAPULT) maxRange = ROCK_RANGE;
    if (!maxRange) return;

    const px = localPlayer[3];
    const py = localPlayer[4];
    const ax = this.aim.wx;
    const ay = this.aim.wy;

    const dx = ax - px;
    const dy = ay - py;
    const len = Math.sqrt(dx * dx + dy * dy);
    const clamped = (len > maxRange && len > 0) ? (maxRange / len) : 1;
    const outOfRange = len > maxRange;
    const tx = px + dx * clamped;
    const ty = py + dy * clamped;

    const p = camera.worldToScreen(px, py, isOnWall);
    const t = camera.worldToScreen(tx, ty, false);

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = outOfRange ? 'rgba(255, 90, 90, 0.85)' : 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 18 * camera.scale);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target marker
    ctx.globalAlpha = 1;
    ctx.strokeStyle = outOfRange ? 'rgba(255, 90, 90, 0.95)' : 'rgba(255, 221, 68, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.x - 12, t.y);
    ctx.lineTo(t.x + 12, t.y);
    ctx.moveTo(t.x, t.y - 12);
    ctx.lineTo(t.x, t.y + 12);
    ctx.stroke();

    // Mouse crosshair (screen space)
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.aim.sx, this.aim.sy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _renderObjectivePointer(snapshot, localPlayer, camera) {
    const phase = snapshot.phase;
    if (phase !== PHASE_CASTLE_ASSAULT && phase !== PHASE_FINAL_STAND) return;

    let targetX = null;
    let label = '';

    if (phase === PHASE_CASTLE_ASSAULT) {
      const enemyTeam = localPlayer[2] === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;
      targetX = enemyTeam === TEAM_BLUE ? (BLUE_CASTLE_X + CASTLE_WIDTH) : RED_CASTLE_X;
      label = 'ENEMY GATE';
    } else if (phase === PHASE_FINAL_STAND) {
      const royals = snapshot.royals || [];
      if (royals.length === 0) return;
      const royalTeam = royals[0][2];
      targetX = royalTeam === TEAM_BLUE
        ? (BLUE_CASTLE_X + CASTLE_WIDTH / 2)
        : (RED_CASTLE_X + CASTLE_WIDTH / 2);
      label = localPlayer[2] === royalTeam ? 'DEFEND' : 'ROYALS';
    }

    if (targetX == null) return;

    const w = this.canvas.width;
    const sx = (targetX - camera.x) * camera.scale;
    if (sx > 60 && sx < w - 60) return; // already visible

    const dir = sx < w / 2 ? -1 : 1;
    const x = dir < 0 ? 32 : w - 32;
    const y = 92;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    if (dir < 0) {
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y - 7);
      ctx.lineTo(x + 6, y + 7);
    } else {
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x - 6, y - 7);
      ctx.lineTo(x - 6, y + 7);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 11px system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = dir < 0 ? 'left' : 'right';
    ctx.fillText(label, dir < 0 ? x + 22 : x - 22, y + 4);
    ctx.restore();
  }
}
