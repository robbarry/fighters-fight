# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Two-player castle siege battle game. Two armies of 140 AI soldiers charge across a battlefield between two castles. Two human players pick roles and fight within their army. Supports solo mode (one player vs AI army).

## Commands

```bash
npm start              # Start server on :3000 (or PORT env)
node --test test/      # Run unit tests (node:test, no framework)
```

No build step, no linter, no TypeScript. The only dependency is `ws`.

## Architecture

Authoritative server, dumb client. All game logic runs server-side. Clients send inputs, receive full state snapshots, and interpolate for rendering.

**Server flow:** `index.js` (HTTP + WS) -> `GameRoom` (lobby, message routing) -> `GameLoop` (fixed timestep) -> `Simulation` (orchestrates one tick)

**Per-tick pipeline in Simulation._updateBattle():**
1. Rebuild spatial hash with all alive entities
2. Build per-team entity lists (soldiers + players + royals)
3. Run AI for each soldier via `updateSoldierAI()` -- returns action (melee/projectile/hitscan/gate_melee)
4. Run AI for uncontrolled royals via `updateRoyalAI()`
5. Process player inputs via `updatePlayer()`
6. Update projectile positions, then check projectile collisions
7. Check gate damage from projectiles
8. Handle phase transitions (CASTLE_ASSAULT, FINAL_STAND, VICTORY)
9. Clean up dead soldiers

**Client flow:** `main.js` (wiring) -> `Network` (WebSocket) -> `Game` (state management) -> `Interpolation` (2-tick buffer) -> `Renderer` (Canvas drawing at 60fps)

**Shared contract:** `shared/constants.js` and `shared/message-types.js` are imported by both server (Node) and client (browser ESM via `/shared/` HTTP route).

## Coordinate System

- **x:** 0 (blue castle, left) to 6000 (red castle, right)
- **y:** 0 to 60 (ground depth band -- NOT screen y). The y axis is a thin band used for melee forgiveness and unit spread, not a full 2D plane.
- Wall units have `isOnWall=true` and are immune to ground melee. They get "dropped" to ground when their gate breaks or during castle assault.
- Projectile arcs are visual-only on the client; server collision uses flat x/y plane.

## Entity Hierarchy

`Entity` (base: id, type, team, x, y, hp, state, facing) is extended by:
- `Soldier` -- AI-controlled army unit with speed variance, attack timing, death animation timer
- `Player` -- Human-controlled with lives, respawn timer, spawn protection, input state, charge mechanics
- `Royal` -- King/Queen spawned in FINAL_STAND; can be AI or human-controlled
- `Projectile` -- has velocity (vx/vy), damage, maxRange, alive flag

All entities serialize to compact arrays (not objects) for the wire format.

## Snapshot Wire Format

Messages use integer type field `t`. Snapshots contain compact arrays:
- soldiers: `[id, type, team, x, y, hp, state, facing, isOnWall]`
- players: `[id, role, team, x, y, hp, state, facing, lives, isOnWall, controlsRoyalId]`
- royals: `[id, isKing, team, x, y, hp, state, facing]`
- projectiles: `[id, type, team, x, y, ownerId, dist]`
- gates: `[blueGateHp, redGateHp]`

All enums (type, team, state, facing, phase) are small integers defined in `shared/constants.js`.

## Game Phases

LOBBY -> COUNTDOWN -> ARMY_MARCH -> OPEN_BATTLE -> CASTLE_ASSAULT -> FINAL_STAND -> VICTORY

Phase transitions are driven by army casualties. When one side's ground troops are wiped, CASTLE_ASSAULT begins. Gate break triggers FINAL_STAND, which spawns the King and Queen for the losing side. Losing team players take control of the royals. Victory occurs when both royals die or all attackers are eliminated.

## AI System

Soldier AI is a 6-state FSM (IDLE, MARCH, ENGAGE, ATTACK, CHARGE_CASTLE, DEAD) in `server/systems/ai.js`. Each tick, `updateSoldierAI()` returns an action result: melee hit, projectile spawn, hitscan check, or gate attack. Target selection uses weighted random: 70% nearest, 20% random, 10% lowest HP.

Ranged units (archers, gunners) use a windup timer before first shot and have minimum range when on walls.

## Combat System

Three attack types processed differently:
- **Melee** (sword, spear): range + y-forgiveness check via `checkMeleeHit()`, then `processMeleeAttack()` with block reduction
- **Projectile** (arrow, rock): spawns entity with velocity, collision checked per-tick against spatial hash
- **Hitscan** (gunner bullets): instant ray cast via `processHitscan()`, no travel time on server (visual trail on client)

Royals have "boss armor" -- AI minions deal only 25% damage to them. Only human players deal full damage.

## Balance Tuning

All balance numbers live in `shared/constants.js`. Key levers:
- Army composition: ARMY_SWORD_COUNT, ARMY_SPEAR_COUNT, etc. (140 total per side)
- Per-unit stats: HP, damage, range, cooldown for each type
- Royal stats: ROYAL_HP (3000), massive damage output
- Gate HP: GATE_HP (200)
- Player: PLAYER_HP (40), PLAYER_LIVES (10), PLAYER_SPEED (230)

## Key Patterns

- ESM everywhere (`"type": "module"` in package.json). Server uses Node ESM, client uses browser native ESM.
- Client imports shared modules via `/shared/` URL path (mapped by the static file server in index.js).
- Events are accumulated during tick processing in `simulation.events[]`, flushed after each tick via `getEvents()`, and sent as individual MSG_EVENT messages.
- Spatial hash is 1D (x-axis only) since the y range is only 0-60 with cell size 100.
- No client-side prediction. Input lag is intentional for this game type.
