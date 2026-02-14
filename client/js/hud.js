import { TEAM_BLUE, TEAM_RED, PHASE_LOBBY, PHASE_COUNTDOWN, PHASE_ARMY_MARCH,
         PHASE_OPEN_BATTLE, PHASE_CASTLE_ASSAULT, PHASE_FINAL_STAND, PHASE_VICTORY,
         STATE_RESPAWNING, STATE_SPECTATING, PLAYER_LIVES } from '/shared/constants.js';

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.chatBubbles = [];
    this.countdownValue = 0;
    this.phaseText = '';
    this.phaseTextTimer = 0;
    this.winner = null;
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

  addChatBubble(id, text, x, y) {
    this.chatBubbles.push({ id, text, x, y, timer: 3000 });
  }

  renderChatBubbles(camera) {
    const ctx = this.ctx;
    for (let i = this.chatBubbles.length - 1; i >= 0; i--) {
      const b = this.chatBubbles[i];
      if (!camera) continue;
      const pos = camera.worldToScreen(b.x, b.y);
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
  }

  showPhaseText(text) {
    this.phaseText = text;
    this.phaseTextTimer = 2;
  }
}
