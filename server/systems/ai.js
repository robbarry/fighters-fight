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
  SOLDIER_BASE_SPEED,
  ENGAGE_SPEED_MULT,
  ENGAGE_RANGE,
  SWORD_RANGE,
  ARROW_SPEED,
  BULLET_RANGE,
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
} from '../../shared/constants.js';
import { updateEntityMovement } from './physics.js';

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
        const inRange = enemies.filter(
          e => !e.isDead && Math.abs(e.x - soldier.x) <= soldier.attackRange
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
      if (dist <= soldier.attackRange) {
        soldier.state = STATE_ATTACK;
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
        soldier.state = STATE_ENGAGE;
        soldier.target = null;
        return { action: null };
      }

      // Check range
      const dist = Math.abs(soldier.x - soldier.target.x);
      if (dist > soldier.attackRange * 1.1) {
        // Add a small hysteresis to avoid flip-flopping
        soldier.state = STATE_ENGAGE;
        return { action: null };
      }

      // Face toward target
      if (soldier.target.x > soldier.x) soldier.facing = FACING_RIGHT;
      else if (soldier.target.x < soldier.x) soldier.facing = FACING_LEFT;

      // Attack on cooldown
      if (soldier.attackCooldownTimer <= 0) {
        // Reset cooldown with variance
        const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
        soldier.attackCooldownTimer = soldier.attackCooldownBase * variance;

        // Determine attack type
        if (soldier.type === TYPE_ARCHER) {
          // Archer fires a projectile
          const dx = soldier.target.x - soldier.x;
          const dy = soldier.target.y - soldier.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const vx = len > 0 ? (dx / len) * ARROW_SPEED : ARROW_SPEED;
          const vy = len > 0 ? (dy / len) * ARROW_SPEED : 0;
          return {
            action: 'projectile',
            projType: PROJ_ARROW,
            x: soldier.x,
            y: soldier.y,
            vx,
            vy,
            target: soldier.target,
          };
        } else if (soldier.type === TYPE_GUNNER) {
          // Gunner fires hitscan
          return {
            action: 'hitscan',
            target: soldier.target,
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
    const inRange = alive.filter(
      e => Math.abs(e.x - soldier.x) <= soldier.attackRange
    );
    if (inRange.length > 0) {
      return pickFromPool(soldier, inRange);
    }
    // If no one in range, pick from all alive anyway
    return pickFromPool(soldier, alive);
  }

  return pickFromPool(soldier, alive);
}

function pickFromPool(soldier, pool) {
  if (pool.length === 0) return null;

  const roll = Math.random();

  if (roll < TARGET_NEAREST_PCT) {
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
  } else if (roll < TARGET_NEAREST_PCT + TARGET_RANDOM_PCT) {
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
