# Fighters Fight - Kyle's Castle Battle

Two-player castle siege battle game. Two armies of 140 AI soldiers charge across a battlefield between two castles. Two human players pick roles and fight within their army.

## Quick Start

```bash
npm start
# Open two browser tabs to localhost:3000
```

## Tech

- Node.js + `ws` for server (only dependency)
- HTML5 Canvas + vanilla JS client
- ESM everywhere (`"type": "module"`)
- No build step

## Architecture

- **Server tick:** 20Hz — all game logic, AI, physics, combat
- **Network:** 20Hz full JSON snapshots (compact arrays, not objects)
- **Client render:** 60fps — interpolates 2 ticks behind latest snapshot
- **No client-side prediction.** Player inputs → server → snapshot → client.

## Key Files

| Area | Files |
|------|-------|
| Shared contract | `shared/constants.js`, `shared/message-types.js` |
| Server entry | `server/index.js` (HTTP + WS) |
| Game sim | `server/simulation.js` (orchestrates everything per tick) |
| AI | `server/systems/ai.js` (6-state FSM) |
| Client entry | `client/js/main.js` |
| Rendering | `client/js/renderer.js` (all Canvas drawing) |

## Coordinate System

- **x:** 0 (blue castle) → 6000 (red castle)
- **y:** 0–60 (ground depth band, not screen y)
- Wall units have `isOnWall=true`, immune to ground melee
- Projectile arcs are visual only; collision is in the x/y plane

## Snapshot Format

All enums are small ints. Entity arrays are compact:
- soldiers: `[id, type, team, x, y, hp, state, facing]`
- players: `[id, role, team, x, y, hp, state, facing, lives]`
- royals: `[id, isKing, team, x, y, hp, state, facing]`
- projectiles: `[id, type, team, x, y, ownerId]`

## Game Phases

LOBBY → COUNTDOWN → ARMY_MARCH → OPEN_BATTLE → CASTLE_ASSAULT → FINAL_STAND → VICTORY

## Balance Constants

All game balance numbers live in `shared/constants.js`. Adjust there for tuning.
