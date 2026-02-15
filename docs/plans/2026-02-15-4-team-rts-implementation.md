# 4-Team Top-Down RTS Commander — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform 2-player side-scrolling brawler into a 4-team top-down RTS with commander gameplay, control point, and multi-round matches.

**Architecture:** Server-authoritative Node.js + `ws`. Clean break from v1 (tag old code first). Reuse networking/lobby/game-loop skeleton, rewrite all game logic and client rendering. 5 new server modules, 2 new client modules, 3 server files deleted.

**Tech Stack:** Node.js ESM, `ws`, browser Canvas 2D, no build step, no dependencies beyond `ws`.

---

## Phase 0: Preparation

### Task 0.1: Tag v1 and Create Branch

**Files:** None (git operations only)

**Step 1: Tag the current game**

```bash
git tag v1-brawler -m "Original 2-player side-scrolling brawler"
```

**Step 2: Create feature branch**

```bash
git checkout -b feat/4-team-rts
```

**Step 3: Commit**

Nothing to commit yet — branch is clean.

---

## Phase 1: Foundation (Shared Constants & Utilities)

Everything depends on these. Do them first.

### Task 1.1: Teams, Alliances, and Map Constants

**Files:**
- Modify: `shared/constants.js`

**Step 1: Write tests for alliance lookup**

Create `test/teams.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import {
  TEAM_BLUE, TEAM_GREEN, TEAM_RED, TEAM_YELLOW,
  ALLIANCE_GOOD, ALLIANCE_EVIL,
  TEAM_TO_ALLIANCE,
} from '../shared/constants.js';

test('Alliance mapping', () => {
  assert.strictEqual(TEAM_TO_ALLIANCE[TEAM_BLUE], ALLIANCE_GOOD);
  assert.strictEqual(TEAM_TO_ALLIANCE[TEAM_GREEN], ALLIANCE_GOOD);
  assert.strictEqual(TEAM_TO_ALLIANCE[TEAM_RED], ALLIANCE_EVIL);
  assert.strictEqual(TEAM_TO_ALLIANCE[TEAM_YELLOW], ALLIANCE_EVIL);
});

test('Teams are distinct integers', () => {
  const teams = [TEAM_BLUE, TEAM_GREEN, TEAM_RED, TEAM_YELLOW];
  assert.strictEqual(new Set(teams).size, 4);
});
```

**Step 2: Run test — verify it fails**

```bash
node --test test/teams.test.js
```

Expected: FAIL — `TEAM_GREEN` not exported.

**Step 3: Update constants.js**

Add to `shared/constants.js`:

```js
// ─── Teams ───────────────────────────────────────────────
export const TEAM_BLUE = 0;    // West castle
export const TEAM_GREEN = 1;   // North castle (was TEAM_RED slot — renumber)
export const TEAM_RED = 2;     // East castle
export const TEAM_YELLOW = 3;  // South castle

// ─── Alliances ──────────────────────────────────────────
export const ALLIANCE_GOOD = 0; // Blue + Green
export const ALLIANCE_EVIL = 1; // Red + Yellow
export const TEAM_TO_ALLIANCE = [ALLIANCE_GOOD, ALLIANCE_GOOD, ALLIANCE_EVIL, ALLIANCE_EVIL];
export const NUM_TEAMS = 4;
```

Update world dimensions:

```js
// ─── World ───────────────────────────────────────────────
export const WORLD_SIZE = 6000;
export const WORLD_CENTER = WORLD_SIZE / 2; // 3000
```

Add map geometry:

```js
// ─── Map Geometry (+ shape) ─────────────────────────────
export const CORRIDOR_WIDTH = 400;
export const PLAZA_SIZE = 800;
export const CASTLE_SIZE = 300;

// Castle center positions [x, y] indexed by team
export const CASTLE_POSITIONS = [
  [CASTLE_SIZE / 2, WORLD_CENTER],                      // Blue: West
  [WORLD_CENTER, CASTLE_SIZE / 2],                      // Green: North
  [WORLD_SIZE - CASTLE_SIZE / 2, WORLD_CENTER],         // Red: East
  [WORLD_CENTER, WORLD_SIZE - CASTLE_SIZE / 2],         // Yellow: South
];
```

Add facing (replace binary with angle byte):

```js
// ─── Facing ──────────────────────────────────────────────
// Facing is now a byte 0-255 mapped to 0-2PI radians
export const FACING_EAST = 0;
export const FACING_SOUTH = 64;
export const FACING_WEST = 128;
export const FACING_NORTH = 192;

export function facingToRadians(byte) {
  return (byte / 256) * Math.PI * 2;
}
export function radiansToFacing(rad) {
  return Math.round(((rad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 255) & 0xFF;
}
```

Add new phases:

```js
// ─── Game Phases ─────────────────────────────────────────
export const PHASE_LOBBY = 0;
export const PHASE_COUNTDOWN = 1;
export const PHASE_BATTLE = 2;
export const PHASE_ROUND_END = 10;
export const PHASE_BUFF_SELECT = 11;
export const PHASE_MATCH_END = 12;
```

Add command types:

```js
// ─── Commander Orders ───────────────────────────────────
export const CMD_ATTACK_MOVE = 0;
export const CMD_HOLD = 1;
export const CMD_RETREAT = 2;
export const CMD_FOCUS_FIRE = 3;
export const CMD_CHARGE = 4;
```

Remove old constants that no longer apply: `FACING_LEFT`, `FACING_RIGHT`, `GROUND_Y_MIN`, `GROUND_Y_MAX`, `WORLD_WIDTH`, `MELEE_Y_FORGIVENESS`, all wall spawn constants, `PHASE_ARMY_MARCH`, `PHASE_OPEN_BATTLE`, `PHASE_CASTLE_ASSAULT`, `PHASE_FINAL_STAND`, `PHASE_VICTORY`, `PLAYER_LIVES`, `PLAYER_HP`, `PLAYER_SPEED`, all `ABILITY_COOLDOWN_*`, all royal constants.

Reduce army per team:

```js
// ─── Army Composition (per team, 70 total) ──────────────
export const ARMY_SWORD_COUNT = 30;
export const ARMY_SPEAR_COUNT = 24;
export const ARMY_ARCHER_COUNT = 11;
export const ARMY_GUNNER_COUNT = 5;
export const ARMY_TOTAL = ARMY_SWORD_COUNT + ARMY_SPEAR_COUNT + ARMY_ARCHER_COUNT + ARMY_GUNNER_COUNT;
```

Add control point:

```js
// ─── Control Point ──────────────────────────────────────
export const CP_RADIUS = 300;     // capture zone radius
export const CP_CAPTURE_RATE = 2; // progress per tick per unit advantage
export const CP_MAX_PROGRESS = 100;
export const CP_DECAY_RATE = 0.5; // progress decay when uncontested
```

Add rounds:

```js
// ─── Match ──────────────────────────────────────────────
export const ROUNDS_TO_WIN = 3;
export const ROUND_END_DISPLAY_MS = 5000;
export const BUFF_SELECT_MS = 15000;
```

**Step 4: Run test — verify it passes**

```bash
node --test test/teams.test.js
```

**Step 5: Run old tests — they will break**

```bash
node --test
```

Old tests reference `STATE_BLOCK`, `checkMeleeHit` with `isOnWall`. These will need updating later (Task 3.1). That's expected — the foundation change cascades.

**Step 6: Commit**

```bash
git add shared/constants.js test/teams.test.js
git commit -m "foundation: 4 teams, alliances, map geometry, phases, commands"
```

---

### Task 1.2: Message Types

**Files:**
- Modify: `shared/message-types.js`

**Step 1: Update message types**

```js
// ─── Server → Client ─────────────────────────────────────
export const MSG_INIT = 0;
export const MSG_SNAPSHOT = 1;
export const MSG_EVENT = 2;
export const MSG_LOBBY_UPDATE = 3;
export const MSG_COUNTDOWN = 4;
export const MSG_ROUND_END = 5;
export const MSG_BUFF_PHASE = 6;
export const MSG_MATCH_END = 7;
export const MSG_ORDER_ACK = 8;

// ─── Client → Server ─────────────────────────────────────
export const MSG_JOIN = 10;
export const MSG_TEAM_SELECT = 11;
// MSG_ROLE_SELECT = 12 is removed (no roles for commander)
export const MSG_READY = 13;
export const MSG_COMMAND = 14; // replaces MSG_INPUT
export const MSG_SHOUT = 15;
export const MSG_START_SOLO = 16;
export const MSG_BUFF_SELECT = 17;

// ─── Event Subtypes ──────────────────────────────────────
export const EVT_DEATH = 0;
export const EVT_HIT = 1;
export const EVT_FIRE = 2;
export const EVT_PHASE = 3;
export const EVT_SHOUT = 4;
export const EVT_CALLOUT = 5;
export const EVT_GAMEOVER = 6;
export const EVT_GATE_BREAK = 7;
// EVT_ROYAL_SPAWN = 8 removed
export const EVT_AIM = 9;
export const EVT_IMPACT = 10;
export const EVT_CAPTURE_CHANGE = 11;
export const EVT_ROUND_START = 12;
export const EVT_BUFF_APPLIED = 13;
export const EVT_ORDER_ISSUED = 14;
```

**Step 2: Commit**

```bash
git add shared/message-types.js
git commit -m "message types for commander, rounds, control point"
```

---

### Task 1.3: Map Module

**Files:**
- Create: `server/systems/map.js`
- Create: `test/map.test.js`

**Step 1: Write tests**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { isWalkable, clampToBounds, getSpawnPosition } from '../server/systems/map.js';

test('Center plaza is walkable', () => {
  assert.strictEqual(isWalkable(3000, 3000), true);
});

test('Corridors are walkable', () => {
  // West corridor (Blue side)
  assert.strictEqual(isWalkable(500, 3000), true);
  // North corridor (Green side)
  assert.strictEqual(isWalkable(3000, 500), true);
  // East corridor (Red side)
  assert.strictEqual(isWalkable(5500, 3000), true);
  // South corridor (Yellow side)
  assert.strictEqual(isWalkable(3000, 5500), true);
});

test('Corners are not walkable', () => {
  assert.strictEqual(isWalkable(500, 500), false);
  assert.strictEqual(isWalkable(5500, 500), false);
  assert.strictEqual(isWalkable(500, 5500), false);
  assert.strictEqual(isWalkable(5500, 5500), false);
});

test('clampToBounds keeps units on the map', () => {
  // A point in the void should be pushed to the nearest walkable spot
  const clamped = clampToBounds(500, 500);
  assert.strictEqual(isWalkable(clamped.x, clamped.y), true);
});

test('getSpawnPosition returns walkable positions', () => {
  for (let team = 0; team < 4; team++) {
    const pos = getSpawnPosition(team);
    assert.strictEqual(isWalkable(pos.x, pos.y), true, `Team ${team} spawn should be walkable`);
  }
});
```

**Step 2: Run test — verify fail**

**Step 3: Implement map.js**

The + shape is defined as a union of 5 rectangles:
- Center plaza: `[2600, 2600] to [3400, 3400]`
- West corridor: `[0, 2800] to [2600, 3200]`
- East corridor: `[3400, 2800] to [6000, 3200]`
- North corridor: `[2800, 0] to [3200, 2600]`
- South corridor: `[2800, 3400] to [3200, 6000]`

`isWalkable(x, y)` checks if point is inside any rectangle.
`clampToBounds(x, y)` finds nearest walkable point.
`getSpawnPosition(team)` returns a random position near that team's castle.
`getWaypoints(team)` returns the march path from castle to center.

**Step 4: Run test — verify pass**

**Step 5: Commit**

```bash
git add server/systems/map.js test/map.test.js
git commit -m "map module: + shaped walkable area, spawn positions, waypoints"
```

---

### Task 1.4: Teams Utility Module

**Files:**
- Create: `shared/teams.js`
- Create: `test/teams-util.test.js`

**Step 1: Write tests**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { isAlly, isEnemy, getAlliance, getEnemyTeams } from '../shared/teams.js';
import { TEAM_BLUE, TEAM_GREEN, TEAM_RED, TEAM_YELLOW } from '../shared/constants.js';

test('Blue and Green are allies', () => {
  assert.strictEqual(isAlly(TEAM_BLUE, TEAM_GREEN), true);
  assert.strictEqual(isEnemy(TEAM_BLUE, TEAM_GREEN), false);
});

test('Blue and Red are enemies', () => {
  assert.strictEqual(isAlly(TEAM_BLUE, TEAM_RED), false);
  assert.strictEqual(isEnemy(TEAM_BLUE, TEAM_RED), true);
});

test('getEnemyTeams returns correct teams', () => {
  const enemies = getEnemyTeams(TEAM_BLUE);
  assert.deepStrictEqual(enemies.sort(), [TEAM_RED, TEAM_YELLOW].sort());
});
```

**Step 2: Implement shared/teams.js**

Uses `TEAM_TO_ALLIANCE` from constants. Exports `isAlly()`, `isEnemy()`, `getAlliance()`, `getEnemyTeams()`, `getAlliedTeam()`.

**Step 3: Run tests, verify pass, commit**

```bash
git add shared/teams.js test/teams-util.test.js
git commit -m "teams utility: alliance lookups, friend/foe checks"
```

---

### Task 1.5: 2D Spatial Hash

**Files:**
- Modify: `server/systems/spatial-hash.js`
- Create: `test/spatial-hash.test.js`

**Step 1: Write tests**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import SpatialHash from '../server/systems/spatial-hash.js';

test('Insert and query finds nearby entities', () => {
  const sh = new SpatialHash(100);
  const e1 = { x: 150, y: 150, id: 1 };
  const e2 = { x: 160, y: 160, id: 2 };
  const e3 = { x: 5000, y: 5000, id: 3 };
  sh.insert(e1);
  sh.insert(e2);
  sh.insert(e3);

  const near = sh.query(155, 155, 50);
  assert.ok(near.includes(e1));
  assert.ok(near.includes(e2));
  assert.ok(!near.includes(e3));
});

test('Query with large radius finds all', () => {
  const sh = new SpatialHash(100);
  for (let i = 0; i < 10; i++) {
    sh.insert({ x: i * 500, y: 3000, id: i });
  }
  const all = sh.query(3000, 3000, 6000);
  assert.strictEqual(all.length, 10);
});
```

**Step 2: Rewrite spatial-hash.js for 2D**

Key change: `_getCellKey(x, y)` returns `(cx << 16) | cy` (bit-packed 2D key). `insert()` uses both x and y. `query()` iterates 2D cell range.

**Step 3: Run tests, verify pass, commit**

```bash
git add server/systems/spatial-hash.js test/spatial-hash.test.js
git commit -m "spatial hash: 2D grid for 6000x6000 world"
```

---

## Phase 2: Server Entity Layer

### Task 2.1: Base Entity for Top-Down

**Files:**
- Modify: `server/entities/entity.js`

**Step 1: Update entity.js**

- Remove `isOnWall` property
- Change `facing` from binary int to angle byte (0-255)
- Add `heading` as internal radians (used by AI/combat), auto-synced to `facing` byte
- Update `serialize()`: drop `isOnWall` field, output `[id, type, team, x, y, hp, state, facing]` (8 fields)

**Step 2: Commit**

```bash
git add server/entities/entity.js
git commit -m "entity: top-down facing, remove isOnWall"
```

---

### Task 2.2: Soldier Entity Update

**Files:**
- Modify: `server/entities/soldier.js`

**Step 1: Update soldier.js**

- Remove all `isOnWall` references
- Remove wall-specific spawn logic
- Add `order` property (current commander order, null = default AI)
- Add `returnState` property (state to return to after combat)
- `serialize()` inherits from Entity (8 fields)

**Step 2: Commit**

```bash
git add server/entities/soldier.js
git commit -m "soldier: remove wall logic, add order slot"
```

---

### Task 2.3: Delete Player/Royal, Add Commander

**Files:**
- Delete: `server/entities/player.js`
- Delete: `server/entities/royal.js`
- Delete: `server/systems/player-controls.js`
- Create: `server/entities/commander.js`

**Step 1: Create commander.js**

Commander has no position, HP, or physical presence. It stores:
- `socketId` — websocket identity
- `team` — which team they command
- `orders` — Map of `unitType -> { cmd, x, y, expiresAt }`
- `issueOrder(unitType, cmd, x, y, tick)` — stores a new order
- `getOrderForType(unitType)` — returns current order or null
- `serialize()` — `[socketId, team]`

**Step 2: Delete old files**

```bash
git rm server/entities/player.js server/entities/royal.js server/systems/player-controls.js
```

**Step 3: Commit**

```bash
git add server/entities/commander.js
git commit -m "commander entity, delete player/royal/player-controls"
```

---

### Task 2.4: Projectile Update

**Files:**
- Modify: `server/entities/projectile.js`

**Step 1: Projectile is already 2D** (has vx/vy). Minor cleanup:
- Remove any `isOnWall` references
- Keep `serialize()` as `[id, type, team, x, y, ownerId, dist, targetDist]` — no change needed

**Step 2: Commit**

```bash
git add server/entities/projectile.js
git commit -m "projectile: clean up for top-down"
```

---

## Phase 3: Server Combat & AI

### Task 3.1: 2D Combat System

**Files:**
- Modify: `server/systems/combat.js`
- Modify: `test/unit.js` (update old tests)

**Step 1: Update tests**

Rewrite `test/unit.js` for 2D circular melee:

```js
test('Combat: 2D Melee Hit Check', () => {
  const attacker = { x: 100, y: 100 };
  const target = { x: 120, y: 110, isDead: false };

  // Distance = sqrt(400 + 100) ≈ 22.4
  assert.strictEqual(checkMeleeHit(attacker, target, 30), true);
  assert.strictEqual(checkMeleeHit(attacker, target, 10), false);
});

test('Combat: Directional Block', () => {
  // Target facing east (heading=0), attack from east (should block)
  const attacker = {};
  const target = {
    state: STATE_BLOCK,
    heading: 0,
    hp: 100,
    takeDamage: (amt) => { target.hp -= amt; },
  };
  const res = processMeleeAttack(attacker, target, 100, /* attackAngle */ 0);
  assert.strictEqual(res.blocked, true);
});
```

**Step 2: Rewrite combat.js**

- `checkMeleeHit()`: circular distance check `dx*dx + dy*dy <= range*range`. Remove `isOnWall` check, remove `MELEE_Y_FORGIVENESS`.
- `processMeleeAttack()`: add `attackAngle` param for directional blocking. Block if attack comes from within 120-degree front arc of target's `heading`.
- `processHitscan()`: already 2D. Rename `yForgiveness` to `rayRadius`. Remove `isOnWall` checks.
- `processProjectileCollisions()`: already 2D. Remove boss armor (no royals). Update alliance-aware filtering with `isEnemy()` from `shared/teams.js`.

**Step 3: Run tests, verify pass, commit**

```bash
git add server/systems/combat.js test/unit.js
git commit -m "combat: 2D circular melee, directional blocking, alliance filtering"
```

---

### Task 3.2: AI FSM Overhaul

**Files:**
- Modify: `server/systems/ai.js`

**Step 1: Rewrite AI states**

New states: `STATE_IDLE`, `STATE_MARCH`, `STATE_ENGAGE`, `STATE_ATTACK`, `STATE_HOLD`, `STATE_RETREAT`, `STATE_CAPTURE`, `STATE_DEAD`.

Add these to `shared/constants.js`. Remove `STATE_CHARGE_CASTLE`, `STATE_BLOCK`, `STATE_RESPAWNING`, `STATE_SPECTATING`.

**Step 2: Rewrite `updateSoldierAI()`**

New signature:
```js
export function updateSoldierAI(soldier, enemies, friendlies, spatialHash, phase, mapConfig, dt)
```

Where `mapConfig` = `{ waypoints, cpX, cpY, castleX, castleY }`.

Key changes:
- Movement is 2D: `dx = target.x - soldier.x`, `dy = target.y - soldier.y`, normalize, move
- Default behavior: march along waypoints toward center
- If soldier has a commander order (`soldier.order`), override default behavior
- ENGAGE: find target within engage range using 2D distance
- ATTACK: melee/ranged in 360 degrees, face toward target
- HOLD: stay put, engage enemies that come in range
- RETREAT: move back toward own castle
- CAPTURE: move to control point center
- Target selection: 2D Euclidean distance for nearest, keep 50/15/10/15/10 weights (nearest/random/lowHP/threat/order)

**Step 3: Commit**

```bash
git add server/systems/ai.js shared/constants.js
git commit -m "AI: 8-state FSM, 2D movement, commander order integration"
```

---

### Task 3.3: Commander Order Processing

**Files:**
- Create: `server/systems/orders.js`

**Step 1: Implement order processing**

```js
export function processOrders(commanders, soldiers, tick) {
  // For each commander, propagate their orders to matching soldiers
  for (const cmdr of commanders) {
    for (const [unitType, order] of cmdr.orders) {
      if (order.expiresAt && tick > order.expiresAt) {
        cmdr.orders.delete(unitType);
        continue;
      }
      // Find soldiers of this type on this team
      for (const s of soldiers) {
        if (s.team !== cmdr.team) continue;
        if (s.type !== unitType && unitType !== -1) continue;
        if (s.isDead) continue;
        s.order = order;
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add server/systems/orders.js
git commit -m "order processing: propagate commander orders to soldiers"
```

---

### Task 3.4: Control Point

**Files:**
- Create: `server/systems/control-point.js`
- Create: `test/control-point.test.js`

**Step 1: Write tests**

```js
test('Capture progress increases with unit advantage', () => {
  const cp = new ControlPoint();
  cp.update([{ team: TEAM_BLUE, x: 3000, y: 3000, isDead: false }], [], 1);
  assert.ok(cp.progress > 0);
});

test('Contested state freezes progress', () => {
  const cp = new ControlPoint();
  cp.progress = 50;
  const good = [{ team: TEAM_BLUE, x: 3000, y: 3000, isDead: false }];
  const evil = [{ team: TEAM_RED, x: 3000, y: 3000, isDead: false }];
  cp.update([...good, ...evil], [], 1);
  assert.strictEqual(cp.contested, true);
});
```

**Step 2: Implement ControlPoint class**

- Zone at `(WORLD_CENTER, WORLD_CENTER)` with `CP_RADIUS`
- Count units of each alliance inside zone
- Capture progress: +rate per unit advantage per tick
- Contested: both alliances present → freeze
- Owner: alliance that reaches `CP_MAX_PROGRESS`
- Buff: owning alliance gets damage multiplier
- `serialize()` → `[owner, progress, contested]`

**Step 3: Run tests, verify pass, commit**

```bash
git add server/systems/control-point.js test/control-point.test.js
git commit -m "control point: capture zones, contested state, alliance ownership"
```

---

## Phase 4: Server Game Flow

### Task 4.1: Army Manager for 4 Teams

**Files:**
- Modify: `server/systems/army-manager.js`

**Step 1: Update for 4 teams**

- `spawnArmies()` spawns 4 armies (one per team), 70 soldiers each
- Use `getSpawnPosition(team)` from `map.js` for positions
- `getAliveCount(team)` and `getAliveSoldiers()` work for any team 0-3
- Remove wall unit spawning — all units are ground in top-down
- Remove `dropWallUnits()` — no wall concept

**Step 2: Commit**

```bash
git add server/systems/army-manager.js
git commit -m "army manager: 4 teams, 70 soldiers each, 2D spawn positions"
```

---

### Task 4.2: Castle Manager for 4 Gates

**Files:**
- Modify: `server/systems/castle-manager.js`

**Step 1: Update for 4 gates**

- Store `gateHp` as array of 4 values (indexed by team)
- `takeDamage(team, amount)` reduces that team's gate HP
- `isGateBroken(team)` checks if a specific gate is down
- `serialize()` → `[blueHp, greenHp, redHp, yellowHp]`

**Step 2: Commit**

```bash
git add server/systems/castle-manager.js
git commit -m "castle manager: 4 gates indexed by team"
```

---

### Task 4.3: Round Manager

**Files:**
- Create: `server/systems/round-manager.js`

**Step 1: Implement RoundManager**

```js
class RoundManager {
  constructor(roundsToWin = ROUNDS_TO_WIN) {
    this.roundsToWin = roundsToWin;
    this.currentRound = 0;
    this.scores = [0, 0]; // [good, evil]
    this.roundWinners = [];
    this.activeBuffs = new Map(); // team -> [buffId, ...]
    this.buffTimer = 0;
  }

  startRound() { this.currentRound++; }

  endRound(winnerAlliance) {
    this.scores[winnerAlliance]++;
    this.roundWinners.push(winnerAlliance);
  }

  isMatchOver() {
    return this.scores[0] >= this.roundsToWin || this.scores[1] >= this.roundsToWin;
  }

  getMatchWinner() {
    if (this.scores[0] >= this.roundsToWin) return ALLIANCE_GOOD;
    if (this.scores[1] >= this.roundsToWin) return ALLIANCE_EVIL;
    return null;
  }

  applyBuff(team, buffId) { ... }

  serialize() {
    return {
      round: this.currentRound,
      scores: [...this.scores],
      roundsToWin: this.roundsToWin,
    };
  }
}
```

**Step 2: Commit**

```bash
git add server/systems/round-manager.js
git commit -m "round manager: multi-round tracking, scores, buff storage"
```

---

### Task 4.4: Simulation Rewrite

**Files:**
- Modify: `server/simulation.js`

This is the biggest single task. The entire `_updateBattle()` pipeline changes.

**Step 1: Gut and rebuild Simulation**

New constructor:
```js
constructor() {
  this.tick = 0;
  this.phase = PHASE_LOBBY;
  this.armyManager = new ArmyManager();
  this.castleManager = new CastleManager();
  this.spatialHash = new SpatialHash();
  this.controlPoint = new ControlPoint();
  this.roundManager = new RoundManager();
  this.commanders = []; // Commander entities
  this.projectiles = [];
  this.events = [];
  this.nextId = 1;
  this.countdownTimer = 0;
}
```

New `_updateBattle(dt)`:
1. Rebuild 2D spatial hash with all alive soldiers
2. Build per-alliance enemy lists (using `isEnemy()`)
3. Process commander orders → propagate to soldiers
4. Run AI for each soldier
5. Process AI action results (melee, projectile, hitscan)
6. Update projectile positions and collisions
7. Check gate damage from projectiles and melee
8. Update control point capture
9. Check round end conditions
10. Clean up dead soldiers

New `buildSnapshot()`:
```js
return {
  tick, phase,
  round: this.roundManager.currentRound,
  scores: this.roundManager.scores,
  soldiers: ...,
  projectiles: ...,
  gates: this.castleManager.serialize(),
  armyCounts: [team0, team1, team2, team3],
  cp: this.controlPoint.serialize(),
  orders: this._serializeOrders(),
};
```

Remove: all player/royal logic, wall logic, CASTLE_ASSAULT/FINAL_STAND phases, `_getLosingTeam()`, `_dropWallPlayers()`, `addPlayer()`/`removePlayer()`.

Add: `addCommander(socketId, team)`, `removeCommander(socketId)`, `handleCommand(socketId, msg)`, `resetForRound()`.

Round end detection:
```js
_checkRoundEnd() {
  // Round ends when all soldiers of one alliance are eliminated
  // OR all castles of one alliance are broken
  const goodAlive = this.armyManager.getAliveCount(TEAM_BLUE)
                  + this.armyManager.getAliveCount(TEAM_GREEN);
  const evilAlive = this.armyManager.getAliveCount(TEAM_RED)
                  + this.armyManager.getAliveCount(TEAM_YELLOW);
  if (goodAlive === 0) return ALLIANCE_EVIL;
  if (evilAlive === 0) return ALLIANCE_GOOD;
  return null;
}
```

**Step 2: Commit**

```bash
git add server/simulation.js
git commit -m "simulation rewrite: 4-team battle, commander orders, control point, rounds"
```

---

### Task 4.5: Game Room for 1-4 Players

**Files:**
- Modify: `server/game-room.js`

**Step 1: Rewrite lobby and message handling**

- Max clients: 4 (was 2)
- Remove `role` from client data — commanders have no role
- `MSG_TEAM_SELECT`: teams 0-3 or -1 for random, validate no duplicate teams
- Remove `MSG_ROLE_SELECT` handling
- `MSG_COMMAND` (replaces `MSG_INPUT`): validate, forward to `simulation.handleCommand()`
- `_allReady()`: `clients.size >= 1` and all ready with valid team
- `_resolveTeams()`: distribute random picks across 4 teams, balance alliances
- `_startGame()`: create Commander entities (not Players), call `simulation.addCommander()`
- `MSG_INIT`: send `{ team, matchId }` (no `playerId` or `role`)
- Phase check: `PHASE_MATCH_END` instead of `PHASE_VICTORY`
- Add `MSG_ROUND_END` and `MSG_BUFF_PHASE` broadcast in tick callback
- Add `MSG_BUFF_SELECT` handling

**Step 2: Commit**

```bash
git add server/game-room.js
git commit -m "game room: 1-4 players, commander messages, multi-round flow"
```

---

### Task 4.6: Physics Cleanup

**Files:**
- Modify: `server/systems/physics.js`

**Step 1: Update movement for 2D**

- `updateEntityMovement()`: move in both x and y, clamp to map bounds via `clampToBounds()`
- Remove y-band clamping (`GROUND_Y_MIN`/`GROUND_Y_MAX`)
- `updateProjectiles()`: already 2D, just remove any y clamping

**Step 2: Commit**

```bash
git add server/systems/physics.js
git commit -m "physics: 2D movement with map boundary clamping"
```

---

## Phase 5: Client Overhaul

### Task 5.1: Camera — 2D Pan/Zoom

**Files:**
- Modify: `client/js/camera.js`

**Step 1: Full rewrite**

New properties: `x`, `y` (viewport center in world), `zoom`, `targetX/Y/Zoom`, `isDragging`.

New methods:
- `worldToScreen(wx, wy)` — 2D transform using zoom + offset
- `screenToWorld(sx, sy)` — inverse
- `isOnScreen(wx, wy)` — 2D bounds check
- `pan(dx, dy)` — move viewport
- `setZoom(level, focusX, focusY)` — zoom toward a point
- `centerOn(wx, wy)` — snap or smooth-scroll to world position
- `setOverview()` — zoom out to see full map
- `update(dt)` — smooth interpolation toward targets

Remove: `follow()`, `wallScreenY`, `groundBandHeight`, `groundScreenY`, all 1D horizontal logic.

**Step 2: Commit**

```bash
git add client/js/camera.js
git commit -m "camera: 2D pan/zoom for top-down view"
```

---

### Task 5.2: Input — Commander Controls

**Files:**
- Modify: `client/js/input.js`

**Step 1: Full rewrite**

New input model:
- Number keys 1-5: select unit type (sword, spear, archer, gunner, catapult)
- Q/W/E/R/T: select command type (attack, advance, hold, retreat, focus fire)
- Left-click on map: issue selected command to selected unit type at world position
- Mouse wheel: zoom camera
- Middle-click drag: pan camera
- Arrow keys / edge of screen: pan camera

Track: `selectedUnitType`, `selectedCommand`, mouse position, click events.

On click: emit a command event (not continuous polling). The game loop picks this up and sends `MSG_COMMAND`.

**Step 2: Commit**

```bash
git add client/js/input.js
git commit -m "input: commander controls, click-to-command"
```

---

### Task 5.3: Renderer — Top-Down Battlefield

**Files:**
- Modify: `client/js/renderer.js`

**Step 1: Full rewrite — this is the biggest client task**

New render pipeline:
1. Clear canvas
2. Draw map background (+ shape, corridors, castles, center plaza)
3. Draw wreckage layer
4. Draw control point zone (circle with team color, capture progress ring)
5. Draw command markers (fading circles where orders were issued)
6. Draw soldiers (colored circles with facing wedge, team-colored)
7. Draw projectiles (small dots or lines)
8. Draw health bars (arc above damaged units)
9. Draw selection highlights (rainbow aura for buffed units)

Unit rendering:
- Circle with radius based on type (melee=8, ranged=7, catapult=10, scaled by zoom)
- Fill = team color (Blue=#4488ff, Green=#44bb44, Red=#ff4444, Yellow=#ffcc00)
- Facing wedge: small triangle on circle edge pointing in heading direction
- 1px black stroke

Map rendering:
- Pre-render static map to offscreen canvas on init
- Blit relevant portion each frame based on camera
- Castles: team-colored squares with gate opening
- Center: subtle circle for control point zone

Remove: all side-view drawing (stick figures, body/head/equipment/weapons), parallax backgrounds, wall rendering, sky gradient, mountains, trees.

**Step 2: Commit**

```bash
git add client/js/renderer.js
git commit -m "renderer: top-down map, circle units, control point, command markers"
```

---

### Task 5.4: Command Palette UI

**Files:**
- Create: `client/js/command-palette.js`
- Modify: `client/index.html` (add container div)
- Modify: `client/css/style.css` (palette styling)

**Step 1: Implement command palette**

Bottom-of-screen UI bar with:
- Left side: 5 unit type buttons (Sword, Spear, Archer, Gunner, Catapult) with alive counts
- Right side: 5 command buttons (Attack, Advance, Hold, Retreat, Focus Fire)
- Keyboard shortcuts shown on each button
- Selected items highlighted with bright border

Can be HTML overlay (simpler for click handling) or canvas-drawn.

**Step 2: Commit**

```bash
git add client/js/command-palette.js client/index.html client/css/style.css
git commit -m "command palette: unit type + command selection UI"
```

---

### Task 5.5: HUD Overhaul

**Files:**
- Modify: `client/js/hud.js`

**Step 1: Rewrite HUD**

New elements:
- **Minimap** (top-right, 200x200): renders entire + map with colored dots for units, castle squares, control point, camera viewport rectangle. Render at reduced frequency (every 3rd frame).
- **Army counts** (top-left): 4 team counts grouped by alliance
- **Control point status** (top-center): capture bar with team color
- **Round score** (top-center): "Round 2/5 — Good: 1 | Evil: 0"
- **Gate HP** (near minimap): 4 small bars, team-colored

Remove: player HP bar, lives, block indicator, catapult charge, aim assist, respawn overlay, spectator mode, objective pointer.

Keep: phase text, damage numbers (at unit positions), toast messages.

**Step 2: Commit**

```bash
git add client/js/hud.js
git commit -m "HUD: minimap, 4-team counts, control point, round score"
```

---

### Task 5.6: Game Orchestrator Update

**Files:**
- Modify: `client/js/game.js`

**Step 1: Rewrite game loop wiring**

- Remove player-follow camera updates → replace with pan/zoom input
- Remove brawler input sending (20Hz) → replace with event-driven commands
- Remove `_localRole`, `_controlsRoyalId`, local player tracking
- Add wreckage accumulation on `EVT_DEATH` events
- Add command marker creation on click
- Update event handling for new events (`EVT_CAPTURE_CHANGE`, `EVT_ROUND_START`)
- Handle `MSG_ROUND_END`, `MSG_BUFF_PHASE`, `MSG_MATCH_END` messages

**Step 2: Commit**

```bash
git add client/js/game.js
git commit -m "game: commander orchestration, wreckage, round events"
```

---

### Task 5.7: Interpolation Update

**Files:**
- Modify: `client/js/interpolation.js`

**Step 1: Update for new format**

- Remove `_lerpPlayerArrays` (no players in snapshots)
- Remove `_lerpRoyalArrays` (no royals)
- Keep `_lerpEntityArrays` for soldiers (same x/y indices 3,4)
- Keep `_lerpProjectileArrays`
- Add control point progress interpolation

**Step 2: Commit**

```bash
git add client/js/interpolation.js
git commit -m "interpolation: remove player/royal, keep soldier/projectile"
```

---

### Task 5.8: Particles — Top-Down Physics

**Files:**
- Modify: `client/js/particles.js`

**Step 1: Adapt physics model**

- Replace gravity with friction: `vx *= 0.95`, `vy *= 0.95` per frame
- Remove `isOnWall` from all particles
- Remove ground-bounce logic
- Shockwaves: `ctx.arc()` instead of `ctx.ellipse()`
- Blood: radial spread in 360 degrees (not vertical streaks)
- Add new types: `command_marker` (team-colored pulse ring), `capture_pulse`

**Step 2: Commit**

```bash
git add client/js/particles.js
git commit -m "particles: friction physics, 360-degree spread, remove gravity/walls"
```

---

### Task 5.9: Lobby — 4-Team Selection

**Files:**
- Modify: `client/js/lobby.js`
- Delete: `client/js/roles.js`

**Step 1: Rewrite lobby UI**

- 4 team buttons: Blue, Green, Red, Yellow (grouped by alliance)
- Random button
- Remove role selection entirely
- Show up to 4 connected players with team assignments
- Keep Ready and Play Solo buttons

**Step 2: Commit**

```bash
git add client/js/lobby.js
git rm client/js/roles.js
git commit -m "lobby: 4-team selection, remove role selection"
```

---

### Task 5.10: Network, Controls, Help, Main

**Files:**
- Modify: `client/js/network.js` — add handlers for new message types
- Modify: `client/js/controls.js` — commander keybinds
- Modify: `client/js/help.js` — new help text
- Modify: `client/js/main.js` — wire up command palette, remove role references

**Step 1: Update each file**

`network.js`: Add cases for `MSG_ROUND_END`, `MSG_BUFF_PHASE`, `MSG_MATCH_END`, `MSG_ORDER_ACK`. Send `MSG_COMMAND` instead of `MSG_INPUT`.

`controls.js`: Remap keys for commander (1-5 unit select, QWERT commands, wheel zoom, arrow pan).

`help.js`: Document new controls.

`main.js`: Wire command palette, remove role screen, update game start flow.

**Step 2: Commit**

```bash
git add client/js/network.js client/js/controls.js client/js/help.js client/js/main.js
git commit -m "client wiring: network messages, commander controls, help text"
```

---

## Phase 6: Integration & Polish

### Task 6.1: Snapshot Rate Reduction

**Files:**
- Modify: `server/game-loop.js`

**Step 1: Send snapshots at 15Hz instead of 30Hz**

Add a counter: only call `onTick` with snapshot every 2nd simulation tick. Simulation still runs at 30Hz for accuracy.

**Step 2: Commit**

```bash
git add server/game-loop.js
git commit -m "snapshot rate: 15Hz broadcast, 30Hz simulation"
```

---

### Task 6.2: End-to-End Test

**Step 1: Start server, verify no crashes**

```bash
node server/index.js &
```

**Step 2: Open browser, verify lobby loads**

Navigate to `http://localhost:3000`. Verify 4-team selection appears.

**Step 3: Run all tests**

```bash
node --test
```

Fix any failures.

**Step 4: Commit any fixes**

---

### Task 6.3: Rainbow Aura VFX

**Files:**
- Modify: `client/js/renderer.js`

**Step 1: Add rainbow rendering**

If snapshot indicates a team has rainbow buff (from round win):
- Draw an extra circle around each unit on that team
- Stroke color cycles through HSL hue: `hsl(time * 60 % 360, 100%, 60%)`
- Radius pulses between r+2 and r+5
- Alpha oscillates 0.4-0.8

**Step 2: Commit**

```bash
git add client/js/renderer.js
git commit -m "rainbow aura VFX for winning team"
```

---

### Task 6.4: Wreckage Persistence

**Files:**
- Modify: `client/js/renderer.js`
- Modify: `client/js/game.js`

**Step 1: Accumulate wreckage**

In `game.js`: on `EVT_DEATH`, push `{ x, y, team, rotation: Math.random() * 2PI }` to `wreckage[]` array. Cap at 500. Don't clear between rounds. Clear on match end (return to lobby).

In `renderer.js`: before drawing units, draw wreckage as small dark splotches with team color tint.

**Step 2: Commit**

```bash
git add client/js/renderer.js client/js/game.js
git commit -m "wreckage: persistent battlefield debris from dead units"
```

---

### Task 6.5: Buff Selection UI

**Files:**
- Modify: `client/js/game.js`
- Modify: `client/js/hud.js`

**Step 1: Implement buff selection overlay**

On `MSG_BUFF_PHASE`:
- Show overlay with 3-4 buff options (buttons)
- Timer counting down from 15s
- Player clicks to select, sends `MSG_BUFF_SELECT`
- Auto-pick first option on timeout

**Step 2: Commit**

```bash
git add client/js/game.js client/js/hud.js
git commit -m "buff selection UI between rounds"
```

---

### Task 6.6: Final Cleanup and Merge

**Step 1: Run full test suite**

```bash
node --test
```

**Step 2: Start server and play-test**

```bash
npm start
```

Open browser, play a round. Verify: 4 teams spawn, march toward center, commander controls work, control point captures, round ends, buff select appears, next round starts.

**Step 3: Update CLAUDE.md**

Update the project documentation to reflect the new architecture.

**Step 4: Commit and merge**

```bash
git add -A
git commit -m "final cleanup and docs update"
git checkout main
git merge feat/4-team-rts
```

---

## Dependency Graph

```
Phase 0 (tag/branch)
  └── Phase 1 (constants, messages, map, teams, spatial hash)
        ├── Phase 2 (entities: entity, soldier, commander, projectile)
        │     └── Phase 3 (combat, AI, orders, control point)
        │           └── Phase 4 (army manager, castle manager, round manager, simulation, game room, physics)
        └── Phase 5 (client: camera, input, renderer, palette, HUD, game, interpolation, particles, lobby, wiring)
              └── Phase 6 (integration, VFX, wreckage, buffs, cleanup)
```

Phases 4 and 5 can be worked in parallel by separate agents (server and client are independent once the shared constants/entities are stable).
