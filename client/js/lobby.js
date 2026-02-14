import { TYPE_SWORD, TYPE_SPEAR, TYPE_ARCHER, TYPE_GUNNER, TYPE_CATAPULT,
         TEAM_BLUE, TEAM_RED } from '/shared/constants.js';
import * as MT from '/shared/message-types.js';
import { ROLES } from './roles.js';

export class Lobby {
  constructor(container) {
    this.container = container;
    this.selectedTeam = null;
    this.selectedRole = TYPE_SWORD;
    this.ready = false;
    this.onReady = null;
    this.onTeamSelect = null;
    this.onRoleSelect = null;

    this.build();
  }

  build() {
    const c = this.container;

    // Title
    const title = c.querySelector('#lobby-title');
    title.innerHTML = "KYLE'S<br>CASTLE BATTLE";

    // Subtitle
    let subtitle = c.querySelector('.lobby-subtitle');
    if (!subtitle) {
      subtitle = document.createElement('div');
      subtitle.className = 'lobby-subtitle';
      subtitle.style.cssText = 'font-size:1.2em; margin-bottom:20px; color:#aaa;';
      // Insert after title, before team-select
      c.insertBefore(subtitle, c.querySelector('#team-select'));
    }
    subtitle.textContent = 'Pick your team and role. Press ? for controls.';

    // Team select
    const teamSelect = c.querySelector('#team-select');
    teamSelect.innerHTML = '';

    const teams = [
      { value: TEAM_BLUE, label: 'BLUE', cls: 'blue' },
      { value: TEAM_RED, label: 'RED', cls: 'red' },
      { value: -1, label: 'RANDOM', cls: 'random' },
    ];

    for (const t of teams) {
      const btn = document.createElement('button');
      btn.className = `team-btn ${t.cls}`;
      btn.textContent = t.label;
      btn.onclick = () => {
        this.selectedTeam = t.value;
        teamSelect.querySelectorAll('.team-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.updateReadyBtn();
        if (this.onTeamSelect) this.onTeamSelect(t.value);
      };
      teamSelect.appendChild(btn);
    }

    // Role select
    const roleSelect = c.querySelector('#role-select');
    roleSelect.innerHTML = '';

    for (const r of ROLES) {
      const card = document.createElement('div');
      card.className = 'role-card' + (r.type === this.selectedRole ? ' selected' : '');
      card.innerHTML = `
        <div class="role-icon">${r.icon}</div>
        <div class="role-name">${r.name}</div>
        <div class="role-desc">${r.desc}</div>
      `;
      card.onclick = () => {
        this.selectedRole = r.type;
        roleSelect.querySelectorAll('.role-card').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
        if (this.onRoleSelect) this.onRoleSelect(r.type);
      };
      roleSelect.appendChild(card);
    }

    // Status area
    const status = c.querySelector('#lobby-status');
    status.innerHTML = '';

    this.readyBtn = document.createElement('button');
    this.readyBtn.className = 'ready-btn';
    this.readyBtn.textContent = 'READY!';
    this.readyBtn.disabled = true;
    this.readyBtn.onclick = () => {
      if (this.selectedTeam === null) return;
      this.ready = true;
      this.readyBtn.textContent = 'WAITING...';
      this.readyBtn.classList.add('is-ready');
      this.readyBtn.disabled = true;
      if (this.onReady) this.onReady(this.selectedTeam, this.selectedRole);
    };
    status.appendChild(this.readyBtn);

    this.statusText = document.createElement('div');
    this.statusText.className = 'status-text';
    this.statusText.textContent = 'Select a team to start';
    status.appendChild(this.statusText);

    this.otherPlayerInfo = document.createElement('div');
    this.otherPlayerInfo.className = 'other-player-info';
    this.otherPlayerInfo.style.display = 'none';
    status.appendChild(this.otherPlayerInfo);
  }

  updateReadyBtn() {
    if (this.ready) return;
    this.readyBtn.disabled = this.selectedTeam === null;
    if (this.selectedTeam !== null) {
      this.statusText.textContent = "Click READY when you're set!";
    }
  }

  onLobbyUpdate(data) {
    if (!data.players) return;

    const others = data.players.filter(p => p.id !== data.socketId);
    if (others.length > 0) {
      const other = others[0];
      const teamName = other.team === TEAM_BLUE ? 'Blue' : other.team === TEAM_RED ? 'Red' : other.team === -1 ? 'Random' : 'Undecided';
      const roleName = ROLES.find(r => r.type === other.role)?.name || 'Sword';
      this.otherPlayerInfo.style.display = 'block';
      this.otherPlayerInfo.textContent = `Other player: ${teamName} team, ${roleName}${other.ready ? ' (READY)' : ''}`;

      if (this.ready) {
        this.statusText.textContent = other.ready ? 'Starting...' : 'Waiting for other player...';
      }
    } else {
      this.otherPlayerInfo.style.display = 'block';
      this.otherPlayerInfo.textContent = 'Waiting for another player to join...';
    }
  }

  show() {
    this.container.style.display = 'flex';
  }

  hide() {
    this.container.style.display = 'none';
  }

  reset() {
    this.selectedTeam = null;
    this.selectedRole = TYPE_SWORD;
    this.ready = false;
    this.build();
  }

  getSelections() {
    return { team: this.selectedTeam, role: this.selectedRole };
  }
}
