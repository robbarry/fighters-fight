import {
  STATE_BLOCK,
  MELEE_Y_FORGIVENESS,
  SHIELD_BLOCK_REDUCTION,
  ROCK_AOE_RADIUS,
  PROJ_ROCK,
} from '../../shared/constants.js';
import { EVT_HIT } from '../../shared/message-types.js';

export function checkMeleeHit(attacker, target, range) {
  if (target.isOnWall) return false;
  if (target.isDead) return false;
  return (
    Math.abs(attacker.x - target.x) <= range &&
    Math.abs(attacker.y - target.y) <= MELEE_Y_FORGIVENESS
  );
}

export function processMeleeAttack(attacker, target, damage) {
  let actualDamage = damage;
  if (target.state === STATE_BLOCK) {
    actualDamage *= (1 - SHIELD_BLOCK_REDUCTION);
  }
  target.takeDamage(actualDamage);
  return { hit: true, damage: actualDamage };
}

export function processHitscan(shooterX, shooterY, aimX, aimY, team, entities, range) {
  // Compute ray direction
  const rdx = aimX - shooterX;
  const rdy = aimY - shooterY;
  const len = Math.sqrt(rdx * rdx + rdy * rdy);
  if (len === 0) return null;

  const dirX = rdx / len;
  const dirY = rdy / len;

  let closestHit = null;
  let closestDist = Infinity;

  for (const entity of entities) {
    if (entity.team === team) continue;
    if (entity.isDead) continue;

    // Project entity onto the ray
    const ex = entity.x - shooterX;
    const ey = entity.y - shooterY;
    const dot = ex * dirX + ey * dirY;

    // Must be in front of shooter and within range
    if (dot < 0 || dot > range) continue;

    // Perpendicular distance from entity to the ray
    const perpDist = Math.abs(ex * dirY - ey * dirX);

    if (perpDist <= MELEE_Y_FORGIVENESS) {
      if (dot < closestDist) {
        closestDist = dot;
        closestHit = entity;
      }
    }
  }

  return closestHit;
}

export function processProjectileCollisions(projectiles, allEntities, spatialHash, events) {
  const hitEvents = [];

  for (const proj of projectiles) {
    if (!proj.alive) continue;

    // Query spatial hash along the sweep from prevX,prevY to x,y
    const midX = (proj.prevX + proj.x) / 2;
    const midY = (proj.prevY + proj.y) / 2;
    const sweepDist = Math.sqrt(
      (proj.x - proj.prevX) ** 2 + (proj.y - proj.prevY) ** 2
    );
    const queryRadius = sweepDist / 2 + 20; // extra margin for entity size

    const nearby = spatialHash.query(midX, midY, queryRadius);

    let hitEntity = null;
    let hitDist = Infinity;

    for (const entity of nearby) {
      if (entity.team === proj.team) continue;
      if (entity.isDead) continue;

      // Check if entity intersects the sweep line (simplified: point vs line segment)
      const closestDist = pointToSegmentDist(
        entity.x, entity.y,
        proj.prevX, proj.prevY,
        proj.x, proj.y
      );

      if (closestDist <= 15) { // hit radius
        // Pick closest to start of sweep
        const dx = entity.x - proj.prevX;
        const dy = entity.y - proj.prevY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hitDist) {
          hitDist = d;
          hitEntity = entity;
        }
      }
    }

    if (hitEntity) {
      hitEntity.takeDamage(proj.damage);
      proj.alive = false;

      hitEvents.push({
        tick: 0, // tick set by caller
        e: EVT_HIT,
        attackerId: proj.ownerId,
        victimId: hitEntity.id,
        dmg: proj.damage,
        x: Math.round(hitEntity.x),
        y: Math.round(hitEntity.y),
      });

      // AOE for rocks
      if (proj.type === PROJ_ROCK) {
        const aoeEntities = spatialHash.query(hitEntity.x, hitEntity.y, ROCK_AOE_RADIUS);
        for (const ae of aoeEntities) {
          if (ae.team === proj.team) continue;
          if (ae.isDead) continue;
          if (ae.id === hitEntity.id) continue;

          const adx = ae.x - hitEntity.x;
          const ady = ae.y - hitEntity.y;
          if (Math.sqrt(adx * adx + ady * ady) <= ROCK_AOE_RADIUS) {
            ae.takeDamage(proj.damage);
            hitEvents.push({
              tick: 0,
              e: EVT_HIT,
              attackerId: proj.ownerId,
              victimId: ae.id,
              dmg: proj.damage,
              x: Math.round(ae.x),
              y: Math.round(ae.y),
            });
          }
        }
      }
    }
  }

  return hitEvents;
}

export function checkGateDamage(entity, gateX, gateDist) {
  return Math.abs(entity.x - gateX) <= gateDist;
}

// Helper: distance from point (px,py) to line segment (ax,ay)-(bx,by)
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a point
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const ex = px - closestX;
  const ey = py - closestY;
  return Math.sqrt(ex * ex + ey * ey);
}
