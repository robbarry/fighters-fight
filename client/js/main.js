import * as MT from '/shared/message-types.js';
import { PHASE_VICTORY } from '/shared/constants.js';
import { Network } from './network.js';
import { Game } from './game.js';
import { Lobby } from './lobby.js';

const canvas = document.getElementById('game');
const lobbyDiv = document.getElementById('lobby');

// Resize canvas to fill window
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (game) game.resize();
}
const network = new Network();
const lobby = new Lobby(lobbyDiv);
const game = new Game(canvas, network);

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
    lobby.show();
  }
});

// Connect
network.connect();
lobby.show();
