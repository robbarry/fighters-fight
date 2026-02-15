# Fighters Fight (Kyle's Castle Battle)

Two-player castle siege battle game. Two armies of 140 AI soldiers per side charge across a battlefield between two castles. Up to two human players pick roles and fight embedded within their army. Server-authoritative, no client-side prediction.

## Setup

**Requirements:** Node.js >= 18

```bash
npm install    # installs sole dependency: ws
npm start      # starts server on PORT (default 3000)
```

Open two browser tabs to `http://localhost:3000`. Each tab is one player. Solo mode is also supported (one tab, click "Solo").

There is no build step. The server serves static files from `client/` and `shared/` directly over HTTP. WebSocket connections upgrade on the same port.

**Environment variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP + WebSocket listen port |

## Project Structure

```
fighters-fight/
  shared/
    constants.js          # All game balance numbers, enums, world dimensions
    message-types.js      # WebSocket message type constants (ints)
  server/
    index.js              # HTTP server + WebSocket setup, entry point
    game-room.js          # Manages lobby, client connections, game lifecycle
    game-loop.js          # setInterval tick loop, calls simulation.update()
    simulation.js         # Core game orchestrator: phases, combat dispatch, entity management
    entities/
      entity.js           # Base class: id, type, team, x, y, hp, state, facing
      soldier.js           # AI soldier (extends Entity), per-type stats
      player.js           # Human player (extends Entity), lives, respawn, input
      projectile.js       # Arrow/bullet/rock with velocity, range, damage
      royal.js            # King/Queen boss entity (extends Entity)
    systems/
      ai.js               # Soldier FSM (6 states) + Royal AI + target selection
      army-manager.js     # Spawns and tracks both armies (280 soldiers total)
      castle-manager.js   # Gate HP for both castles
      combat.js           # Melee hit checks, hitscan rays, projectile collisions, AOE
      physics.js          # Entity movement + projectile updates + world clamping
      player-controls.js  # Translates player input into attacks/movement/abilities
      spatial-hash.js     # 1D spatial hash (x-axis cells) for collision queries
  client/
    index.html            # Entry point, loads js/main.js as ESM
    js/
      main.js             # Wires lobby, network, game together
      network.js          # WebSocket client wrapper with message routing
      game.js             # Client game loop (60fps), event handling, camera, HUD
      renderer.js         # All Canvas 2D drawing (soldiers, castles, effects)
      camera.js           # Viewport tracking, screen-to-world transform, shake
      input.js            # Keyboard + mouse input capture
      interpolation.js    # Lerps between server snapshots for smooth 60fps
      controls.js         # Keybind definitions
      hud.js              # Damage numbers, toasts, charge meter, health bars
      particles.js        # Hit sparks, blood, debris, shockwaves
      lobby.js            # Lobby UI (team/role select, ready button)
      help.js             # Help overlay rendering
      roles.js            # Role name/description lookup
  test/
    unit.js               # Node test runner tests for combat system
  docs/
    API.md                # WebSocket protocol documentation
```

## Architecture

### Server Tick Loop

The server runs at 30Hz (`TICK_RATE = 30`). Each tick:

1. `Simulation.update(dt)` advances game state based on current phase
2. `Simulation.buildSnapshot()` creates a full state snapshot
3. `Simulation.getEvents()` drains accumulated discrete events
4. `GameRoom` serializes and broadcasts both to all connected WebSocket clients

There is no delta compression. Every tick sends a complete snapshot.

### Client Rendering

The client runs at 60fps via `requestAnimationFrame`. It interpolates between the two most recent server snapshots for smooth rendering. Input is sent to the server at ~20Hz.

### No Client-Side Prediction

Player inputs go to the server, the server processes them, and the client sees the result in the next snapshot. Latency is visible but the game is designed for local/LAN play.

## Coordinate System

| Axis | Range | Meaning |
|------|-------|---------|
| x | 0 -- 6000 | Horizontal. 0 = Blue castle, 6000 = Red castle |
| y | 0 -- 60 | Ground depth band (NOT screen y). Used for melee forgiveness and unit spread |

Blue castle occupies x: 0--300. Red castle occupies x: 5700--6000. Gates are at x=300 (blue) and x=5700 (red).

Wall units have `isOnWall=true` and are immune to ground melee. Projectile arcs are visual only; collision uses the x/y plane.

## Game Phases

```
PHASE_LOBBY (0)
  -> PHASE_COUNTDOWN (1)          [all players ready]
    -> PHASE_ARMY_MARCH (2)       [3s countdown ends]
      -> PHASE_OPEN_BATTLE (3)    [1s march timer ends]
        -> PHASE_CASTLE_ASSAULT (4) [one side's ground troops wiped]
          -> PHASE_FINAL_STAND (5)  [gate broken]
            -> PHASE_VICTORY (6)    [royals killed OR attackers wiped]
```

Phase transitions are driven by `Simulation._updateBattle()`. The losing team is determined by ground troop count. In a simultaneous wipe, total alive count breaks the tie (random if still tied).

## Entity Types and Enums

All enums are small integers for compact wire format.

**Teams:** `TEAM_BLUE = 0`, `TEAM_RED = 1`

**Unit types:** `TYPE_SWORD = 0`, `TYPE_SPEAR = 1`, `TYPE_ARCHER = 2`, `TYPE_GUNNER = 3`, `TYPE_CATAPULT = 4`

**States:** `STATE_IDLE = 0`, `STATE_MARCH = 1`, `STATE_ENGAGE = 2`, `STATE_ATTACK = 3`, `STATE_CHARGE_CASTLE = 4`, `STATE_DEAD = 5`, `STATE_BLOCK = 6`, `STATE_RESPAWNING = 7`, `STATE_SPECTATING = 8`

**Projectile types:** `PROJ_ARROW = 0`, `PROJ_ROCK = 1`, `PROJ_BULLET = 2`

**Facing:** `FACING_RIGHT = 0`, `FACING_LEFT = 1`

## Snapshot Wire Format

All entity arrays use compact positional arrays (not objects) to minimize JSON size.

```
soldiers:    [id, type, team, x, y, hp, state, facing, isOnWall]
players:     [id, role, team, x, y, hp, state, facing, lives, isOnWall, controlsRoyalId]
royals:      [id, isKing, team, x, y, hp, state, facing]
projectiles: [id, type, team, x, y, ownerId, distanceTraveled, targetDist]
gates:       [blueGateHp, redGateHp]
armyCounts:  [blueAlive, redAlive]
```

`isOnWall` and `isKing` are 0/1 integers. `controlsRoyalId` is the royal's entity ID when the player controls a royal during FINAL_STAND, or 0.

## WebSocket Protocol

All messages are JSON with a `t` field indicating message type. Full protocol is documented in `docs/API.md`.

### Server to Client

| Constant | Value | Purpose |
|----------|-------|---------|
| `MSG_INIT` | 0 | Game start: assigns playerId, team, role |
| `MSG_SNAPSHOT` | 1 | Full game state (30Hz) |
| `MSG_EVENT` | 2 | Discrete event (hit, death, phase change, shout, aim telegraph) |
| `MSG_LOBBY_UPDATE` | 3 | Lobby state change |
| `MSG_COUNTDOWN` | 4 | Countdown start with seconds |

### Client to Server

| Constant | Value | Purpose |
|----------|-------|---------|
| `MSG_JOIN` | 10 | (unused currently) |
| `MSG_TEAM_SELECT` | 11 | `{ t: 11, team: 0|1|-1 }` -- -1 means random |
| `MSG_ROLE_SELECT` | 12 | `{ t: 12, role: 0..4 }` |
| `MSG_READY` | 13 | `{ t: 13 }` |
| `MSG_INPUT` | 14 | `{ t: 14, dx, dy, atk, blk, spc, ax, ay }` (20Hz) |
| `MSG_SHOUT` | 15 | `{ t: 15, s: shoutId }` |
| `MSG_START_SOLO` | 16 | `{ t: 16 }` -- starts game with one player |

### Event Subtypes (in MSG_EVENT)

| Constant | Value | Payload keys |
|----------|-------|-------------|
| `EVT_DEATH` | 0 | `id, x, y` |
| `EVT_HIT` | 1 | `attackerId, victimId, dmg, blocked, x, y` |
| `EVT_FIRE` | 2 | `id, type, x, y` |
| `EVT_PHASE` | 3 | `phase` |
| `EVT_SHOUT` | 4 | `id, s, x, y` |
| `EVT_CALLOUT` | 5 | `id, s, x, y` |
| `EVT_GAMEOVER` | 6 | `winner` (team int) |
| `EVT_GATE_BREAK` | 7 | `team` |
| `EVT_ROYAL_SPAWN` | 8 | `kingId, queenId, team` |
| `EVT_AIM` | 9 | `id, tx, ty, tw, ms` (aim telegraph) |

## Entity Class Hierarchy

```
Entity (server/entities/entity.js)
  - Base: id, type, team, x, y, hp, maxHp, state, facing
  - takeDamage(amount) -> bool (true if killed)
  - get isDead -> bool (hp <= 0)
  - serialize() -> [id, type, team, x, y, hp, state, facing, isOnWall]

Soldier extends Entity (server/entities/soldier.js)
  - constructor(id, type, team, x, y)
  - Auto-sets hp/damage/range/cooldown from type
  - AI gunners are nerfed: 0.65x damage, 1.65x cooldown, 1100 max range
  - speedMultiplier: random +/- 15% variance
  - Fields: attackCooldownTimer, target, targetRefreshTimer, deathTimer, isRemovable

Player extends Entity (server/entities/player.js)
  - constructor(id, role, team, x, y)
  - HP: 40, Lives: 10
  - applyInput(msg) -- sets dx/dy/atk/blk/spc/aimX/aimY from network message
  - die() -- decrements lives, sets RESPAWNING or SPECTATING
  - respawn(x, y) -- restores HP, grants 3000ms spawn protection
  - Has chargeMs for catapult hold-to-fire mechanic
  - controlsRoyalId: set during FINAL_STAND when player drives a Royal

Royal extends Entity (server/entities/royal.js)
  - constructor(id, isKing, team, x, y)
  - HP: 3000 (70 in solo mode)
  - King: 40 damage, 700ms cooldown. Queen: 35 damage, 600ms cooldown
  - isHumanControlled / controllingPlayerId: links to the Player driving this royal
  - Boss armor: takes 0.25x damage from non-human attackers

Projectile (server/entities/projectile.js)
  - constructor(id, type, team, x, y, vx, vy, ownerId, targetDist?)
  - update(dt) -- moves along velocity, tracks distanceTraveled
  - isExpired() -- true when distanceTraveled > maxRange
  - Bullets have distance-based damage falloff (1.0x at origin, 0.35x at max range)
```

## AI System

Soldier AI is a finite state machine in `server/systems/ai.js`:

```
IDLE -> MARCH (when game phase >= ARMY_MARCH)
MARCH -> ENGAGE (when enemy within ENGAGE_RANGE=240)
ENGAGE -> ATTACK (when enemy within attackRange)
ENGAGE -> MARCH (when no valid target)
ATTACK -> ENGAGE (when target dead or out of range)
any -> CHARGE_CASTLE (when phase >= CASTLE_ASSAULT and no alive enemies)
CHARGE_CASTLE -> ENGAGE (when enemies reappear, e.g. royals spawn)
```

**Target selection** uses weighted random: 70% nearest, 20% random, 10% lowest HP. Wall gunners use different weights (40% nearest, 45% random) to avoid instant-death zones.

**Ranged AI** has a windup delay (280-480ms archers, 360-580ms gunners) before firing. An `EVT_AIM` event is broadcast so clients can show aim telegraphs. AI aim has distance-proportional error.

**Royal AI** (`updateRoyalAI`) patrols near home castle (800 unit tether). Royals repel each other to avoid stacking. They only engage enemies within tether range + 200.

## Combat System

Defined in `server/systems/combat.js`:

```javascript
checkMeleeHit(attacker, target, range) -> bool
// Wall targets immune. Checks x-distance <= range AND y-distance <= MELEE_Y_FORGIVENESS (26).

processMeleeAttack(attacker, target, damage) -> { hit, damage, blocked }
// Royals take 0.25x from non-humans. Blocking reduces 95%. Calls target.takeDamage().

processHitscan(shooterX, shooterY, aimX, aimY, team, entities, range, opts?) -> { entity, dist } | null
// Ray-cast along aim direction. Returns closest enemy hit within yForgiveness perpendicular distance.
// opts: { yForgiveness?: number, minRange?: number }

processProjectileCollisions(projectiles, allEntities, spatialHash, events) -> hitEvent[]
// Sweep-test from prevPos to curPos. Hit radius: bullet=9, arrow=12, rock=40.
// Rocks have AOE (ROCK_AOE_RADIUS=90). Bullets have distance falloff.
```

**Shield blocking** reduces damage by 95% (`SHIELD_BLOCK_REDUCTION = 0.95`). Only Sword and Spear roles can block.

## Player Controls and Abilities

Input is processed in `server/systems/player-controls.js`. Each role has a primary attack and a special ability:

| Role | Primary | Special | Special Cooldown |
|------|---------|---------|-----------------|
| Sword | Melee (9 dmg, 34 range) | Whirlwind AOE (20 dmg, 60 range) | 5000ms |
| Spear | Melee (8 dmg, 50 range) | Dash (250 unit teleport) | 4000ms |
| Archer | Arrow projectile (6 dmg) | Volley (3 arrows in spread) | 6000ms |
| Gunner | Bullet projectile (8 dmg) | Shotgun blast (3 bullets, 600 range) | 8000ms |
| Catapult | Rock (hold-to-charge, 15 base dmg, AOE) | Rapid fire (resets cooldown) | 10000ms |

Catapult uses a hold-to-charge mechanic: holding attack charges up to 1000ms, increasing speed by up to 1.7x and damage by up to 1.35x. Release fires.

Wall-mounted gunners have a minimum range of 120 to prevent point-blank deletion.

## Spatial Hash

`SpatialHash` in `server/systems/spatial-hash.js` is a 1D grid (x-axis only, cell size 100). The y-axis range is only 0-60, so vertical partitioning provides no benefit. Rebuilt every tick from all alive entities.

```javascript
spatialHash.clear()
spatialHash.insert(entity)    // entity must have .x property
spatialHash.query(x, y, radius) -> Entity[]  // returns all entities in cells overlapping [x-radius, x+radius]
```

## Balance Constants

All tuning values live in `shared/constants.js`. Key values:

| Constant | Value | Notes |
|----------|-------|-------|
| `WORLD_WIDTH` | 6000 | |
| `GROUND_Y_MAX` | 60 | |
| `TICK_RATE` | 30 | Server Hz |
| `PLAYER_HP` | 40 | |
| `PLAYER_LIVES` | 10 | |
| `PLAYER_SPEED` | 230 | Units/sec |
| `SOLDIER_BASE_SPEED` | 125 | Units/sec (+/- 15%) |
| `GATE_HP` | 200 | Per castle |
| `ROYAL_HP` | 3000 | 70 in solo |
| `ARMY_TOTAL` | 140 | Per side (60 sword + 48 spear + 22 archer + 10 gunner) |
| `MELEE_Y_FORGIVENESS` | 26 | Y-distance tolerance for melee hits |
| `ENGAGE_RANGE` | 240 | Distance to switch from MARCH to ENGAGE |
| `DEATH_ANIM_MS` | 2000 | Time before dead soldier is removed |
| `RESPAWN_DELAY_MS` | 3000 | Player respawn timer |
| `SHIELD_BLOCK_REDUCTION` | 0.95 | 95% damage reduction |

## Tests

```bash
node --test test/unit.js
```

Uses Node's built-in test runner. Tests cover melee hit detection, damage processing, and block reduction.

## Common Modification Patterns

**Adjusting balance:** Edit values in `shared/constants.js`. Both server and client import from the same file.

**Adding a new unit type:** Add constant to `shared/constants.js`, add stat functions in `soldier.js` and `player.js`, add AI behavior branch in `ai.js`, add rendering in `client/js/renderer.js`.

**Adding a new game event:** Add constant to `shared/message-types.js`, emit in `simulation.js` or the relevant system, handle in `client/js/game.js` `handleEvent()`.

**Adding a new game phase:** Add constant to `shared/constants.js`, add transition logic in `Simulation._updateBattle()`, add client announcement in `game.js` `PHASE_ANNOUNCE`.

**Adding a new special ability:** Add cooldown constant to `shared/constants.js`, add case in `player-controls.js` `updatePlayer()` under the `spc` handling switch.

## Gotchas

- **ESM everywhere.** `package.json` has `"type": "module"`. All imports use `.js` extensions. Client imports use absolute paths from root (e.g., `'/shared/constants.js'`).
- **No build step.** The server serves `client/` and `shared/` as static files. Changes take effect on page refresh.
- **Compact arrays, not objects.** Snapshot entities are positional arrays, not keyed objects. Index matters. Check `serialize()` methods and the wire format table above.
- **Wall vs ground.** `isOnWall` affects melee immunity, movement constraints, respawn location, and AI targeting. Wall units are dropped to ground when castle assault begins.
- **AI gunners are nerfed.** `Soldier` constructor applies 0.65x damage and 1.65x cooldown to `TYPE_GUNNER` AI. Player gunners use full stats from constants.
- **Royal boss armor.** Royals take only 0.25x damage from non-human attackers (`!attacker.isHuman`).
- **Hitscan vs projectile.** AI gunners use hitscan (instant ray-cast). Player gunners fire bullet projectiles. AI archers fire arrow projectiles.
- **Catapult hold-to-charge.** Server tracks `chargeMs` on the player entity. Client mirrors it locally for the charge meter UI but the server value is authoritative.
- **Solo mode.** `simulation.isSolo` is set when only one player connects. Royal HP drops to 70 in solo.
- **`_forcedLosingTeam`.** When both armies wipe simultaneously, the simulation forces a losing team. This persists through phase transitions. If the "winning" team is then wiped during castle assault, the roles swap.
- **Player `controlsRoyalId`.** During FINAL_STAND, the losing team's human players are switched to control King/Queen. Their player entity enters `STATE_SPECTATING` and input drives the Royal instead.
- **Spawn protection.** Players get 3000ms of damage immunity after respawning. `takeDamage()` returns false during this window.
- **Room capacity.** `GameRoom` rejects connections when `clients.size >= 2` or when `gameInProgress` is true.
- **No reconnection.** If a WebSocket drops, the player is removed. No reconnect/rejoin logic exists.
