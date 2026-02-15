# Fighters Fight API Documentation

This document describes the WebSocket protocol used between the client and server.

## Message Format

All messages are JSON objects. Every message has a `t` field (type) which corresponds to an integer constant defined in `shared/message-types.js`.

### Server -> Client Messages

#### MSG_INIT (0)
Sent when the game starts.
```json
{
  "t": 0,
  "playerId": 123,
  "team": 0, // 0=Blue, 1=Red
  "role": 0  // 0=Sword, 1=Spear, 2=Archer, 3=Gunner, 4=Catapult
}
```

#### MSG_SNAPSHOT (1)
Sent every tick (30Hz) with the full game state.
```json
{
  "t": 1,
  "tick": 105,
  "phase": 3,
  "soldiers": [[id, type, team, x, y, hp, state, facing, isOnWall], ...],
  "players": [[id, role, team, x, y, hp, state, facing, lives, isOnWall], ...],
  "royals": [[id, isKing, team, x, y, hp, state, facing], ...],
  "projectiles": [[id, type, team, x, y, ownerId, dist], ...],
  "gates": [blueGateHp, redGateHp],
  "armyCounts": [blueCount, redCount]
}
```

#### MSG_EVENT (2)
Sent when a discrete event occurs (hit, death, sound).
```json
{
  "t": 2,
  "e": 1, // EVT_HIT
  "victimId": 45,
  "attackerId": 12,
  "dmg": 10,
  "blocked": false,
  "x": 100,
  "y": 50
}
```

#### MSG_LOBBY_UPDATE (3)
Sent when lobby state changes.
```json
{
  "t": 3,
  "socketId": 1, // Your socket ID
  "players": [
    { "id": 1, "team": 0, "role": 0, "ready": true },
    { "id": 2, "team": 1, "role": 2, "ready": false }
  ]
}
```

#### MSG_COUNTDOWN (4)
Sent to start the countdown.
```json
{
  "t": 4,
  "seconds": 3
}
```

### Client -> Server Messages

#### MSG_TEAM_SELECT (11)
```json
{
  "t": 11,
  "team": 0 // 0=Blue, 1=Red, -1=Random
}
```

#### MSG_ROLE_SELECT (12)
```json
{
  "t": 12,
  "role": 0 // 0..4
}
```

#### MSG_READY (13)
```json
{
  "t": 13
}
```

#### MSG_INPUT (14)
Sent ~20Hz with current input state.
```json
{
  "t": 14,
  "dx": 0,   // -1, 0, 1
  "dy": 0,   // -1, 0, 1
  "atk": 0,  // 1 if attacking
  "blk": 0,  // 1 if blocking
  "spc": 0,  // 1 if using special
  "ax": 1500, // Aim World X
  "ay": 30    // Aim World Y
}
```

#### MSG_SHOUT (15)
```json
{
  "t": 15,
  "s": 0 // Shout ID
}
```
