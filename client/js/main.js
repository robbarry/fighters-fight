import * as MT from '/shared/message-types.js';
import { PHASE_VICTORY } from '/shared/constants.js';
import { Network } from './network.js';
import { Game } from './game.js';
import { Lobby } from './lobby.js';
import { HelpOverlay } from './help.js';

const canvas = document.getElementById('game');
const lobbyDiv = document.getElementById('lobby');
const helpBtn = document.getElementById('help-btn');
const helpOverlayEl = document.getElementById('help-overlay');
const helpCloseBtn = document.getElementById('help-close');
const helpContentEl = document.getElementById('help-content');

// Resize canvas to fill window
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (game) game.resize();
}
const network = new Network();
const lobby = new Lobby(lobbyDiv);
const game = new Game(canvas, network);
const help = new HelpOverlay(helpOverlayEl, helpContentEl);
let lastLobbyUpdate = null;

function toggleHelp() {
  help.toggle();
  if (help.isOpen()) game.input.clearKeys();
}

helpBtn.addEventListener('click', () => toggleHelp());
helpCloseBtn.addEventListener('click', () => help.close());
helpOverlayEl.addEventListener('click', (e) => {
  if (e.target === helpOverlayEl) help.close();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

  if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
    e.preventDefault();
    toggleHelp();
    return;
  }

  if (e.key === 'Escape' && help.isOpen()) {
    e.preventDefault();
    help.close();
  }
});

window.addEventListener('resize', resize);
resize();

// Lobby -> Server
lobby.onTeamSelect = (team) => {
  network.send({ t: MT.MSG_TEAM_SELECT, team });
};

lobby.onRoleSelect = (role) => {
  network.send({ t: MT.MSG_ROLE_SELECT, role });
};

lobby.onReady = (team, role) => {
  network.send({ t: MT.MSG_TEAM_SELECT, team });
  network.send({ t: MT.MSG_ROLE_SELECT, role });
  network.send({ t: MT.MSG_READY });
};

// Server -> Client handlers
network.on(MT.MSG_LOBBY_UPDATE, (data) => {
  lastLobbyUpdate = data;
  lobby.onLobbyUpdate(data);
});

network.on(MT.MSG_COUNTDOWN, (data) => {
  lobby.hide();
  canvas.style.display = 'block';
  game.showCountdown(data.seconds || 3);
});

network.on(MT.MSG_INIT, (data) => {
  lobby.hide();
  game.start(data.playerId);
});

network.on(MT.MSG_SNAPSHOT, (snap) => {
  game.onSnapshot(snap);
});

network.on(MT.MSG_EVENT, (evt) => {
  game.handleEvent(evt);
});

// Handle tab visibility for interpolation jump
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    game.interpolation.onTabReturn();
  }
});

// Play again click
canvas.addEventListener('click', () => {
  const snap = game.interpolation.getInterpolated();
  if (snap && snap.phase === PHASE_VICTORY) {
    game.stop();
    game.reset();
    canvas.style.display = 'none';
    lobby.reset();
    if (lastLobbyUpdate) lobby.onLobbyUpdate(lastLobbyUpdate);
    lobby.show();
  }
});

// Connect
network.setDisconnectHandler(() => {
  document.body.innerHTML = '<div style="color:white;text-align:center;padding-top:20%;font-family:sans-serif;"><h1>Disconnected</h1><p>Please refresh the page to reconnect.</p></div>';
});
network.connect();
lobby.show();
