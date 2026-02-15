import {
  TYPE_SWORD,
  TYPE_SPEAR,
  TYPE_ARCHER,
  TYPE_GUNNER,
  TYPE_CATAPULT,
  PROJ_ARROW,
  PROJ_ROCK,
  PROJ_BULLET,
  STATE_IDLE,
  STATE_BLOCK,
  TEAM_BLUE,
  TEAM_RED,
  ARROW_SPEED,
  BULLET_SPEED,
  ROCK_SPEED,
  ATTACK_TIMING_VARIANCE,
  CATAPULT_CHARGE_MS,
  CATAPULT_CHARGE_SPEED_MAX_MULT,
  CATAPULT_CHARGE_DAMAGE_MAX_MULT,
  BLUE_WALL_SPAWN_MIN,
  BLUE_WALL_SPAWN_MAX,
  RED_WALL_SPAWN_MIN,
  RED_WALL_SPAWN_MAX,
  ABILITY_COOLDOWN_SWORD,
  ABILITY_COOLDOWN_SPEAR,
  ABILITY_COOLDOWN_ARCHER,
  ABILITY_COOLDOWN_GUNNER,
  ABILITY_COOLDOWN_CATAPULT,
  PLAYER_SPEED,
} from '../../shared/constants.js';
import {
  EVT_HIT,
  EVT_FIRE,
  EVT_SHOUT,
} from '../../shared/message-types.js';
import Projectile from '../entities/projectile.js';
import { updateEntityMovement } from './physics.js';
import { checkMeleeHit, processMeleeAttack } from './combat.js';

export function updatePlayer(player, dt, blueEntities, redEntities, simulation) {
  const dtMs = dt * 1000;

  // Reduce cooldowns
  player.attackCooldownTimer -= dtMs;
  if (player.attackCooldownTimer < 0) player.attackCooldownTimer = 0;
  player.specialCooldownTimer -= dtMs;
  if (player.specialCooldownTimer < 0) player.specialCooldownTimer = 0;
  player.shoutCooldown -= dtMs;
  if (player.shoutCooldown < 0) player.shoutCooldown = 0;

  // Movement
  const { dx, dy, atk, blk, spc, aimX, aimY } = player.input;
  if (player.isOnWall) {
    // Keep wall roles pinned to the battlements lane.
    player.y = 30;
    if (dx !== 0) {
      updateEntityMovement(player, Math.sign(dx), 0, PLAYER_SPEED, dt);
      // Clamp to the team's wall segment so you can't run the whole map on the wall.
      const wallMinX = player.team === TEAM_BLUE ? BLUE_WALL_SPAWN_MIN : RED_WALL_SPAWN_MIN;
      const wallMaxX = player.team === TEAM_BLUE ? BLUE_WALL_SPAWN_MAX : RED_WALL_SPAWN_MAX;
      if (player.x < wallMinX) player.x = wallMinX;
      if (player.x > wallMaxX) player.x = wallMaxX;
      if (player.state !== STATE_BLOCK) player.state = STATE_IDLE;
    }
  } else if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    updateEntityMovement(player, dx / len, dy / len, PLAYER_SPEED, dt);
    if (player.state !== STATE_BLOCK) player.state = STATE_IDLE;
  }

  // Block
  if (blk && (player.role === TYPE_SWORD || player.role === TYPE_SPEAR)) {
    player.state = STATE_BLOCK;
  } else if (player.state === STATE_BLOCK) {
    player.state = STATE_IDLE;
  }

  // Special Ability
  if (spc && player.specialCooldownTimer <= 0) {
    // Note: enemies list depends on team
    const enemies = player.team === TEAM_BLUE ? redEntities : blueEntities;
    
    switch (player.role) {
      case TYPE_SWORD:
        // Whirlwind: AOE attack
        player.specialCooldownTimer = ABILITY_COOLDOWN_SWORD;
        const nearby = simulation.spatialHash.query(player.x, player.y, 80);
        for (const e of nearby) {
           if (e.team !== player.team && !e.isDead) {
              // Check distance
              const dist = Math.abs(e.x - player.x);
              if (dist < 60) {
                  const res = processMeleeAttack(player, e, 20); // Bonus damage
                  simulation.events.push({ tick: simulation.tick, e: EVT_HIT, attackerId: player.id, victimId: e.id, dmg: Math.round(res.damage), blocked: !!res.blocked, x: Math.round(e.x), y: Math.round(e.y) });
                  if (e.isDead) simulation._handleEntityDeath(e);
              }
           }
        }
        simulation.events.push({ tick: simulation.tick, e: EVT_SHOUT, id: player.id, msg: 4 });
        break;
        
      case TYPE_SPEAR:
        // Dash
        player.specialCooldownTimer = ABILITY_COOLDOWN_SPEAR;
        const dir = player.facing === 0 ? 1 : -1;
        player.x += dir * 250; // Teleport/Dash
        // Clamp world bounds
        if (player.x < 0) player.x = 0;
        if (player.x > 6000) player.x = 6000;
        break;
        
      case TYPE_ARCHER:
         // Volley
         player.specialCooldownTimer = ABILITY_COOLDOWN_ARCHER;
         const baseAngle = Math.atan2(aimY - player.y, aimX - player.x);
         const spread = 0.2; // radians
         for(let i=-1; i<=1; i++) {
             const angle = baseAngle + i * spread;
             const vx = Math.cos(angle) * ARROW_SPEED;
             const vy = Math.sin(angle) * ARROW_SPEED;
             const proj = new Projectile(simulation.genId(), PROJ_ARROW, player.team, player.x, player.y, vx, vy, player.id);
             proj.damage = player.damage;
             simulation.projectiles.push(proj);
         }
         simulation.events.push({ tick: simulation.tick, e: EVT_FIRE, id: player.id, type: PROJ_ARROW, x: Math.round(player.x), y: Math.round(player.y) });
         break;
         
      case TYPE_GUNNER:
         // Shotgun blast
         player.specialCooldownTimer = ABILITY_COOLDOWN_GUNNER;
         const gAngle = Math.atan2(aimY - player.y, aimX - player.x);
         const gSpread = 0.15;
         for(let i=-1; i<=1; i++) {
             const angle = gAngle + i * gSpread;
             const vx = Math.cos(angle) * BULLET_SPEED;
             const vy = Math.sin(angle) * BULLET_SPEED;
             const proj = new Projectile(simulation.genId(), PROJ_BULLET, player.team, player.x, player.y, vx, vy, player.id);
             proj.damage = player.damage;
             proj.maxRange = 600; // Shorter range
             simulation.projectiles.push(proj);
         }
         simulation.events.push({ tick: simulation.tick, e: EVT_FIRE, id: player.id, type: PROJ_BULLET, x: Math.round(player.x), y: Math.round(player.y) });
         break;
         
      case TYPE_CATAPULT:
         // Rapid Fire
         player.specialCooldownTimer = ABILITY_COOLDOWN_CATAPULT;
         player.attackCooldownTimer = 0;
         simulation.events.push({ tick: simulation.tick, e: EVT_SHOUT, id: player.id, msg: 3 }); // "FIRING!"
         break;
    }
  }

  // Attack
  if (player.role === TYPE_CATAPULT) {
    const ready = player.attackCooldownTimer <= 0;

    if (!ready) {
      player.chargeMs = 0;
    } else if (atk) {
      player.chargeMs += dtMs;
      if (player.chargeMs > CATAPULT_CHARGE_MS) player.chargeMs = CATAPULT_CHARGE_MS;
    }

    const released = player._prevAtk && !atk;
    if (ready && released) {
      const chargePct = CATAPULT_CHARGE_MS > 0
        ? Math.max(0, Math.min(1, player.chargeMs / CATAPULT_CHARGE_MS))
        : 0;
      const speedMult = 1 + (CATAPULT_CHARGE_SPEED_MAX_MULT - 1) * chargePct;
      const damageMult = 1 + (CATAPULT_CHARGE_DAMAGE_MAX_MULT - 1) * chargePct;

      const adx = aimX - player.x;
      const ady = aimY - player.y;
      const alen = Math.sqrt(adx * adx + ady * ady);
      const speed = ROCK_SPEED * speedMult;
      const vx = alen > 0 ? (adx / alen) * speed : speed;
      const vy = alen > 0 ? (ady / alen) * speed : 0;

      const proj = new Projectile(
        simulation.genId(), PROJ_ROCK, player.team,
        player.x, player.y, vx, vy, player.id
      );
      proj.damage = Math.round(proj.damage * damageMult);
      simulation.projectiles.push(proj);
      simulation.events.push({
        tick: simulation.tick,
        e: EVT_FIRE,
        id: player.id,
        type: PROJ_ROCK,
        x: Math.round(player.x),
        y: Math.round(player.y),
      });

      const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
      player.attackCooldownTimer = player.attackCooldownBase * variance;
      player.chargeMs = 0;
    }

    player._prevAtk = atk;
  } else if (atk && player.attackCooldownTimer <= 0) {
    const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
    player.attackCooldownTimer = player.attackCooldownBase * variance;

    const enemies = player.team === TEAM_BLUE ? redEntities : blueEntities;

    if (player.role === TYPE_SWORD || player.role === TYPE_SPEAR) {
      // Melee attack: find nearest enemy in range
      let bestTarget = null;
      let bestDist = Infinity;
      const nearby = simulation.spatialHash.query(player.x, player.y, player.attackRange + 20);
      for (const e of nearby) {
        if (e.team === player.team || e.isDead) continue;
        if (checkMeleeHit(player, e, player.attackRange)) {
          const d = Math.abs(e.x - player.x);
          if (d < bestDist) {
            bestDist = d;
            bestTarget = e;
          }
        }
      }
      if (bestTarget) {
        const res = processMeleeAttack(player, bestTarget, player.damage);
        simulation.events.push({
          tick: simulation.tick,
          e: EVT_HIT,
          attackerId: player.id,
          victimId: bestTarget.id,
          dmg: Math.round(res.damage),
          blocked: !!res.blocked,
          x: Math.round(bestTarget.x),
          y: Math.round(bestTarget.y),
        });
        if (bestTarget.isDead) {
          simulation._handleEntityDeath(bestTarget);
        }
      }
    } else if (player.role === TYPE_ARCHER) {
      // Create arrow projectile toward aim point
      const adx = aimX - player.x;
      const ady = aimY - player.y;
      const alen = Math.sqrt(adx * adx + ady * ady);
      const vx = alen > 0 ? (adx / alen) * ARROW_SPEED : ARROW_SPEED;
      const vy = alen > 0 ? (ady / alen) * ARROW_SPEED : 0;
      const proj = new Projectile(
        simulation.genId(), PROJ_ARROW, player.team,
        player.x, player.y, vx, vy, player.id
      );
      proj.damage = player.damage;
      simulation.projectiles.push(proj);
      simulation.events.push({
        tick: simulation.tick,
        e: EVT_FIRE,
        id: player.id,
        type: PROJ_ARROW,
        x: Math.round(player.x),
        y: Math.round(player.y),
      });
    } else if (player.role === TYPE_GUNNER) {
      // Fire a bullet projectile toward aim point (dodgeable, readable).
      const adx = aimX - player.x;
      const ady = aimY - player.y;
      const alen = Math.sqrt(adx * adx + ady * ady);

      // Prevent "point-blank deletion" from castle walls.
      if (!(player.isOnWall && alen < 120)) {
        const vx = alen > 0 ? (adx / alen) * BULLET_SPEED : BULLET_SPEED;
        const vy = alen > 0 ? (ady / alen) * BULLET_SPEED : 0;

        const proj = new Projectile(
          simulation.genId(), PROJ_BULLET, player.team,
          player.x, player.y, vx, vy, player.id
        );
        proj.damage = player.damage;
        proj.maxRange = player.attackRange;
        simulation.projectiles.push(proj);
        simulation.events.push({
          tick: simulation.tick,
          e: EVT_FIRE,
          id: player.id,
          type: PROJ_BULLET,
          x: Math.round(player.x),
          y: Math.round(player.y),
        });
      }
    }
  }
}
