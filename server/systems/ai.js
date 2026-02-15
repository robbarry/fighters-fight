import {
  STATE_IDLE,
  STATE_MARCH,
  STATE_ENGAGE,
  STATE_ATTACK,
  STATE_CHARGE_CASTLE,
  STATE_DEAD,
  TEAM_BLUE,
  TEAM_RED,
  TYPE_ARCHER,
  TYPE_GUNNER,
  PROJ_ARROW,
  PROJ_BULLET,
  SOLDIER_BASE_SPEED,
  ENGAGE_SPEED_MULT,
  ENGAGE_RANGE,
  SWORD_RANGE,
  ARROW_SPEED,
  BULLET_SPEED,
  ATTACK_TIMING_VARIANCE,
  DEATH_ANIM_MS,
  PHASE_ARMY_MARCH,
  PHASE_CASTLE_ASSAULT,
  PHASE_FINAL_STAND,
  TARGET_NEAREST_PCT,
  TARGET_RANDOM_PCT,
  ROYAL_SPEED,
  FACING_RIGHT,
  FACING_LEFT,
  GROUND_Y_MAX,
  MELEE_Y_FORGIVENESS,
} from '../../shared/constants.js';
import { updateEntityMovement } from './physics.js';

function wallMinRangeFor(soldier) {
  if (!soldier.isOnWall) return 0;
  if (soldier.type === TYPE_GUNNER) return 220;
  if (soldier.type === TYPE_ARCHER) return 180;
  return 0;
}

function rangedWindupMsFor(soldier) {
  // Reaction time + a bit of variance keeps ranged units from "insta-firing"
  // the instant someone crosses into their range.
  if (soldier.type === TYPE_GUNNER) return 360 + Math.random() * 220;
  if (soldier.type === TYPE_ARCHER) return 280 + Math.random() * 200;
  return 0;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function computeAiAimPoint(shooter, target, range) {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const t = clamp(dist / (range || 1), 0, 1);

  // Error grows with distance to avoid oppressive long-range precision.
  const baseErrX = shooter.type === TYPE_GUNNER ? 10 : 14;
  const baseErrY = shooter.type === TYPE_GUNNER ? 3 : 4;
  const distErrX = shooter.type === TYPE_GUNNER ? 26 : 34;
  const distErrY = shooter.type === TYPE_GUNNER ? 9 : 12;

  const errX = (Math.random() * 2 - 1) * (baseErrX + distErrX * t);
  const errY = (Math.random() * 2 - 1) * (baseErrY + distErrY * t);

  return {
    x: target.x + errX,
    y: clamp(target.y + errY, 0, GROUND_Y_MAX),
    isOnWall: !!target.isOnWall,
  };
}

export function updateSoldierAI(soldier, enemies, friendlies, spatialHash, phase, gateX, dt) {
  const dtMs = dt * 1000;

  // Reduce cooldowns
  soldier.attackCooldownTimer -= dtMs;
  if (soldier.attackCooldownTimer < 0) soldier.attackCooldownTimer = 0;
  soldier.targetRefreshTimer -= dtMs;
  if (soldier.targetRefreshTimer < 0) soldier.targetRefreshTimer = 0;

  // Dead state handling
  if (soldier.state === STATE_DEAD) {
    soldier.deathTimer += dtMs;
    if (soldier.deathTimer >= DEATH_ANIM_MS) {
      soldier.isRemovable = true;
    }
    return { action: null };
  }

  // Check if all enemies are dead and we should charge castle
  if (
    phase >= PHASE_CASTLE_ASSAULT &&
    soldier.state !== STATE_DEAD &&
    soldier.state !== STATE_CHARGE_CASTLE
  ) {
    const aliveEnemies = enemies.filter(e => !e.isDead);
    if (aliveEnemies.length === 0 && !soldier.isOnWall) {
      soldier.state = STATE_CHARGE_CASTLE;
    }
  }

  switch (soldier.state) {
    case STATE_IDLE: {
      if (phase >= PHASE_ARMY_MARCH) {
        soldier.state = STATE_MARCH;
      }
      return { action: null };
    }

    case STATE_MARCH: {
      if (soldier.isOnWall) {
        // Wall units don't march; only engage enemies actually within their attack range
        const minRange = wallMinRangeFor(soldier);
        const inRange = enemies.filter(
          e => {
            if (e.isDead) return false;
            const dx = Math.abs(e.x - soldier.x);
            return dx <= soldier.attackRange && dx >= minRange;
          }
        );
        if (inRange.length > 0) {
          soldier.state = STATE_ENGAGE;
        }
        return { action: null };
      }

      // Move toward enemy castle
      const moveDir = soldier.team === TEAM_BLUE ? 1 : -1;
      const speed = SOLDIER_BASE_SPEED * soldier.speedMultiplier;
      updateEntityMovement(soldier, moveDir, 0, speed, dt);

      // Check for nearby enemies
      const aliveEnemies = enemies.filter(e => !e.isDead);
      for (const enemy of aliveEnemies) {
        if (enemy.isOnWall) continue; // ground soldiers don't engage wall units during march
        const dx = Math.abs(soldier.x - enemy.x);
        const dy = Math.abs(soldier.y - enemy.y);
        if (dx <= ENGAGE_RANGE && dy <= ENGAGE_RANGE) {
          soldier.state = STATE_ENGAGE;
          break;
        }
      }
      return { action: null };
    }

    case STATE_ENGAGE: {
      // Pick target if needed
      if (!soldier.target || soldier.target.isDead || soldier.targetRefreshTimer <= 0) {
        soldier.target = pickTarget(soldier, enemies, spatialHash);
        soldier.targetRefreshTimer = 2000;
      }

      if (!soldier.target || soldier.target.isDead) {
        soldier.target = null;
        // Try once more
        soldier.target = pickTarget(soldier, enemies, spatialHash);
        if (!soldier.target) {
          soldier.state = STATE_MARCH;
          return { action: null };
        }
      }

      // Check if in attack range
      const dist = Math.abs(soldier.x - soldier.target.x);
      const dy = Math.abs(soldier.y - soldier.target.y);
      const isRanged = soldier.type === TYPE_ARCHER || soldier.type === TYPE_GUNNER;
      const minRange = wallMinRangeFor(soldier);
      if (dist <= soldier.attackRange && dist >= minRange && (isRanged || dy <= MELEE_Y_FORGIVENESS)) {
        soldier.state = STATE_ATTACK;
        return { action: null };
      }
      if (soldier.isOnWall && minRange > 0 && dist < minRange) {
        // Too close for comfortable ranged fire from the wall; try a different target.
        soldier.target = null;
        soldier.targetRefreshTimer = 0;
        return { action: null };
      }

      // Move toward target (wall units don't move)
      if (!soldier.isOnWall) {
        const speed = SOLDIER_BASE_SPEED * soldier.speedMultiplier * ENGAGE_SPEED_MULT;
        const tdx = soldier.target.x - soldier.x;
        const tdy = soldier.target.y - soldier.y;
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
        if (tlen > 0) {
          updateEntityMovement(soldier, tdx / tlen, tdy / tlen, speed, dt);
        }
      } else {
        // Wall unit can't move -- if target is out of range, go back to MARCH
        // and wait for enemies to come into range
        soldier.target = null;
        soldier.state = STATE_MARCH;
      }

      return { action: null };
    }

    case STATE_ATTACK: {
      if (!soldier.target || soldier.target.isDead) {
        soldier._windupMs = 0;
        soldier._pendingAttack = null;
        soldier.state = STATE_ENGAGE;
        soldier.target = null;
        return { action: null };
      }

      // Check range
      const dist = Math.abs(soldier.x - soldier.target.x);
      if (dist > soldier.attackRange * 1.1) {
        // Add a small hysteresis to avoid flip-flopping
        soldier._windupMs = 0;
        soldier._pendingAttack = null;
        soldier.state = STATE_ENGAGE;
        return { action: null };
      }

      // Melee shouldn't sit in ATTACK while they're not y-aligned (it looks like "attacking air").
      const dy = Math.abs(soldier.y - soldier.target.y);
      const isRanged = soldier.type === TYPE_ARCHER || soldier.type === TYPE_GUNNER;
      if (!isRanged && dy > MELEE_Y_FORGIVENESS) {
        soldier._windupMs = 0;
        soldier._pendingAttack = null;
        soldier.state = STATE_ENGAGE;
        return { action: null };
      }

      // Wall ranged units have a minimum range (prevents point-blank "wall deletion zones").
      const minRange = wallMinRangeFor(soldier);
      if (soldier.isOnWall && minRange > 0 && dist < minRange) {
        soldier._windupMs = 0;
        soldier._pendingAttack = null;
        soldier.state = STATE_ENGAGE;
        soldier.target = null;
        return { action: null };
      }

      // Face toward target
      if (soldier.target.x > soldier.x) soldier.facing = FACING_RIGHT;
      else if (soldier.target.x < soldier.x) soldier.facing = FACING_LEFT;

      // Ranged windup: show intent + give players a moment to react.
      if (soldier._windupMs == null) soldier._windupMs = 0;
      if (soldier._windupMs > 0) {
        soldier._windupMs -= dtMs;
        if (soldier._windupMs > 0) return { action: null };

        soldier._windupMs = 0;
        const pending = soldier._pendingAttack || null;
        soldier._pendingAttack = null;
        if (pending) return pending;
      }

      // Attack on cooldown
      if (soldier.attackCooldownTimer <= 0) {
        // Reset cooldown with variance
        const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
        soldier.attackCooldownTimer = soldier.attackCooldownBase * variance;

        // Determine attack type
        if (soldier.type === TYPE_ARCHER || soldier.type === TYPE_GUNNER) {
          const windupMs = rangedWindupMsFor(soldier);
          const aim = computeAiAimPoint(soldier, soldier.target, soldier.attackRange);
          const projType = soldier.type === TYPE_GUNNER ? PROJ_BULLET : PROJ_ARROW;
          const speed = soldier.type === TYPE_GUNNER ? BULLET_SPEED : ARROW_SPEED;

          const dx = aim.x - soldier.x;
          const dy = aim.y - soldier.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const vx = len > 0 ? (dx / len) * speed : speed;
          const vy = len > 0 ? (dy / len) * speed : 0;

          soldier._windupMs = windupMs;
          soldier._pendingAttack = {
            action: 'projectile',
            projType,
            x: soldier.x,
            y: soldier.y,
            vx,
            vy,
            target: soldier.target,
          };

          return {
            action: null,
            telegraph: {
              tx: aim.x,
              ty: aim.y,
              tw: aim.isOnWall ? 1 : 0,
              ms: Math.round(windupMs),
            },
          };
        } else {
          // Melee attack (sword or spear)
          return {
            action: 'melee',
            target: soldier.target,
          };
        }
      }

      return { action: null };
    }

    case STATE_CHARGE_CASTLE: {
      if (soldier.isOnWall) {
        return { action: null };
      }

      // If enemies appeared (e.g. royals spawned), switch to engaging them
      const chargeEnemies = enemies.filter(e => !e.isDead);
      if (chargeEnemies.length > 0) {
        // Check if any enemy is within engage range
        for (const enemy of chargeEnemies) {
          const edx = Math.abs(soldier.x - enemy.x);
          if (edx <= ENGAGE_RANGE) {
            soldier.state = STATE_ENGAGE;
            return { action: null };
          }
        }
      }

      // Move toward gate
      const speed = SOLDIER_BASE_SPEED * soldier.speedMultiplier;
      const dx = gateX - soldier.x;
      const dir = dx > 0 ? 1 : -1;
      updateEntityMovement(soldier, dir, 0, speed, dt);

      // If close enough to gate, attack it
      if (Math.abs(soldier.x - gateX) <= SWORD_RANGE) {
        if (soldier.attackCooldownTimer <= 0) {
          const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
          soldier.attackCooldownTimer = soldier.attackCooldownBase * variance;
          return { action: 'gate_melee' };
        }
      }

      return { action: null };
    }

    default:
      return { action: null };
  }
}

export function pickTarget(soldier, enemies, spatialHash) {
  const alive = enemies.filter(e => !e.isDead);
  if (alive.length === 0) return null;

  // Wall units prefer enemies within their range
  if (soldier.isOnWall) {
    const minRange = wallMinRangeFor(soldier);
    const inRange = alive.filter(
      e => {
        const dx = Math.abs(e.x - soldier.x);
        return dx <= soldier.attackRange && dx >= minRange;
      }
    );
    if (inRange.length === 0) return null;
    return pickFromPool(soldier, inRange);
  }

  return pickFromPool(soldier, alive);
}

function pickFromPool(soldier, pool) {
  if (pool.length === 0) return null;

  // Wall gunners focusing "nearest" created instant-death zones at the gates.
  // Spread their fire around a bit more for better play feel.
  let nearestPct = TARGET_NEAREST_PCT;
  let randomPct = TARGET_RANDOM_PCT;
  if (soldier.isOnWall && soldier.type === TYPE_GUNNER) {
    nearestPct = 0.40;
    randomPct = 0.45;
  }

  const roll = Math.random();

  if (roll < nearestPct) {
    // Nearest by distance
    let nearest = null;
    let nearestDist = Infinity;
    for (const e of pool) {
      const dx = Math.abs(e.x - soldier.x);
      if (dx < nearestDist) {
        nearestDist = dx;
        nearest = e;
      }
    }
    return nearest;
  } else if (roll < nearestPct + randomPct) {
    // Random
    return pool[Math.floor(Math.random() * pool.length)];
  } else {
    // Lowest HP
    let lowest = null;
    let lowestHp = Infinity;
    for (const e of pool) {
      if (e.hp < lowestHp) {
        lowestHp = e.hp;
        lowest = e;
      }
    }
    return lowest;
  }
}

export function updateRoyalAI(royal, enemies, dt) {
  const dtMs = dt * 1000;

  royal.attackCooldownTimer -= dtMs;
  if (royal.attackCooldownTimer < 0) royal.attackCooldownTimer = 0;

  if (royal.isDead) {
    royal.deathTimer += dtMs;
    return { action: null };
  }

  // Find nearest alive enemy
  const alive = enemies.filter(e => !e.isDead);
  if (alive.length === 0) return { action: null };

  let nearest = null;
  let nearestDist = Infinity;
  for (const e of alive) {
    const dx = Math.abs(e.x - royal.x);
    if (dx < nearestDist) {
      nearestDist = dx;
      nearest = e;
    }
  }

  if (!nearest) return { action: null };

  royal.target = nearest;

  // Face toward target
  if (nearest.x > royal.x) royal.facing = FACING_RIGHT;
  else if (nearest.x < royal.x) royal.facing = FACING_LEFT;

  // If in range, attack
  const dist = Math.abs(royal.x - nearest.x);
  if (dist <= royal.attackRange && Math.abs(royal.y - nearest.y) <= 20) {
    if (royal.attackCooldownTimer <= 0) {
      const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
      royal.attackCooldownTimer = royal.attackCooldownBase * variance;
      return { action: 'melee', target: nearest };
    }
    return { action: null };
  }

  // Move toward target
  const tdx = nearest.x - royal.x;
  const tdy = nearest.y - royal.y;
  const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
  if (tlen > 0) {
    const speed = ROYAL_SPEED * royal.speedMultiplier;
    updateEntityMovement(royal, tdx / tlen, tdy / tlen, speed, dt);
  }

  return { action: null };
}
