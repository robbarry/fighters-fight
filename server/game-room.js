import Simulation from './simulation.js';
import GameLoop from './game-loop.js';
import {
  TYPE_SWORD,
  PHASE_VICTORY,
  COUNTDOWN_SECONDS,
  SHOUT_COOLDOWN_MS,
} from '../shared/constants.js';
import {
  MSG_INIT,
  MSG_SNAPSHOT,
  MSG_EVENT,
  MSG_LOBBY_UPDATE,
  MSG_TEAM_SELECT,
  MSG_ROLE_SELECT,
  MSG_READY,
  MSG_INPUT,
  MSG_SHOUT,
  EVT_SHOUT,
  MSG_COUNTDOWN,
} from '../shared/message-types.js';

class GameRoom {
  constructor() {
    this.simulation = new Simulation();
    this.gameLoop = new GameLoop(this.simulation);
    this.clients = new Map(); // socketId -> { ws, team, role, ready }
    this.nextSocketId = 1;
    this.gameInProgress = false;
  }

  addClient(ws) {
    if (this.gameInProgress) {
      ws.close(1000, 'Game in progress');
      return;
    }
    if (this.clients.size >= 2) {
      ws.close(1000, 'Room full');
      return;
    }

    const socketId = this.nextSocketId++;
    ws._socketId = socketId;
    this.clients.set(socketId, {
      ws,
      team: null,
      role: TYPE_SWORD,
      ready: false,
    });

    this._sendTo(ws, {
      t: MSG_LOBBY_UPDATE,
      socketId,
      players: this._getLobbyState(),
    });
    this._broadcastLobbyUpdate();
  }

  removeClient(ws) {
    const socketId = ws._socketId;
    if (socketId == null) return;

    this.clients.delete(socketId);

    if (this.gameInProgress) {
      this.simulation.removePlayer(socketId);
      if (this.clients.size === 0) {
        this._stopGame();
      }
    }

    this._broadcastLobbyUpdate();
  }

  handleMessage(ws, raw) {
    const msg = JSON.parse(raw);
    const socketId = ws._socketId;
    const client = this.clients.get(socketId);
    if (!client) return;

    switch (msg.t) {
      case MSG_TEAM_SELECT:
        client.team = msg.team;
        this._broadcastLobbyUpdate();
        break;

      case MSG_ROLE_SELECT:
        client.role = msg.role;
        this._broadcastLobbyUpdate();
        break;

      case MSG_READY:
        client.ready = true;
        console.log(`Player ${socketId} ready (team=${client.team}, role=${client.role})`);
        this._broadcastLobbyUpdate();
        if (this._allReady()) {
          console.log('All ready — starting game!');
          this._startGame();
        }
        break;

      case MSG_INPUT:
        if (this.gameInProgress) {
          const player = this.simulation.getPlayerBySocketId(socketId);
          if (player) player.applyInput(msg);
        }
        break;

      case MSG_SHOUT:
        if (this.gameInProgress) {
          const player = this.simulation.getPlayerBySocketId(socketId);
          if (player && player.shoutCooldown <= 0) {
            player.shoutCooldown = SHOUT_COOLDOWN_MS;
            this.simulation.events.push({
              tick: this.simulation.tick,
              e: EVT_SHOUT,
              id: player.id,
              s: msg.s,
              x: Math.round(player.x),
              y: Math.round(player.y),
            });
          }
        }
        break;
    }
  }

  _allReady() {
    if (this.clients.size !== 2) return false;
    for (const [, client] of this.clients) {
      if (!client.ready || client.team === null) return false;
    }
    return true;
  }

  _resolveTeams() {
    const entries = [...this.clients.entries()];

    // team === -1 means "random"
    const randomEntries = entries.filter(([, c]) => c.team === -1);
    const fixedEntries = entries.filter(([, c]) => c.team !== -1);

    if (randomEntries.length === 2) {
      // Both random: assign one to each team
      const shuffled = Math.random() < 0.5 ? [TEAM_BLUE, TEAM_RED] : [TEAM_RED, TEAM_BLUE];
      randomEntries[0][1].team = shuffled[0];
      randomEntries[1][1].team = shuffled[1];
    } else if (randomEntries.length === 1) {
      // One random: assign to the opposite team of the fixed player
      const fixedTeam = fixedEntries[0][1].team;
      randomEntries[0][1].team = fixedTeam === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;
    }
    // else both fixed: keep as-is (could be same team for co-op)

    // If both chose the same non-random team, that's co-op -- keep it
  }

  _startGame() {
    this._resolveTeams();

    const entries = [...this.clients.entries()];

    // Add players first
    const playerMap = new Map(); // socketId -> player
    for (const [socketId, client] of entries) {
      const { team, role } = client;
      const player = this.simulation.addPlayer(socketId, role, team);
      playerMap.set(socketId, player);
    }

    // startGame() re-assigns IDs, so call it before sending MSG_INIT
    this.simulation.startGame();
    this.gameInProgress = true;

    // Now send MSG_INIT with final player IDs + countdown
    for (const [socketId, client] of entries) {
      const player = playerMap.get(socketId);
      this._sendTo(client.ws, {
        t: MSG_INIT,
        playerId: player.id,
        team: client.team,
        role: client.role,
      });
      this._sendTo(client.ws, { t: MSG_COUNTDOWN, seconds: COUNTDOWN_SECONDS });
    }

    this.gameLoop.onTick = (snapshot, events) => {
      const snapMsg = { t: MSG_SNAPSHOT, ...snapshot };
      const snapStr = JSON.stringify(snapMsg);

      for (const [, client] of this.clients) {
        if (client.ws.readyState === 1) {
          client.ws.send(snapStr);
        }
      }

      if (events.length > 0) {
        for (const evt of events) {
          const evtMsg = { t: MSG_EVENT, ...evt };
          const evtStr = JSON.stringify(evtMsg);
          for (const [, client] of this.clients) {
            if (client.ws.readyState === 1) {
              client.ws.send(evtStr);
            }
          }
        }
      }

      // Check for game over
      if (this.simulation.phase === PHASE_VICTORY) {
        this._stopGame();
      }
    };

    this.gameLoop.start();
  }

  _stopGame() {
    this.gameLoop.stop();
    this.gameInProgress = false;
    this.simulation.reset();

    for (const [, client] of this.clients) {
      client.ready = false;
    }

    this._broadcastLobbyUpdate();
  }

  _broadcastLobbyUpdate() {
    const state = this._getLobbyState();
    for (const [socketId, client] of this.clients) {
      if (client.ws.readyState === 1) {
        client.ws.send(JSON.stringify({ t: MSG_LOBBY_UPDATE, socketId, players: state }));
      }
    }
  }

  _getLobbyState() {
    return [...this.clients.entries()].map(([id, c]) => ({
      id,
      team: c.team,
      role: c.role,
      ready: c.ready,
    }));
  }

  _sendTo(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export default GameRoom;
