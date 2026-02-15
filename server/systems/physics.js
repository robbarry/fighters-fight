import {
  GROUND_Y_MIN,
  GROUND_Y_MAX,
  WORLD_WIDTH,
  FACING_RIGHT,
  FACING_LEFT,
} from '../../shared/constants.js';

export function updateEntityMovement(entity, dx, dy, speed, dt) {
  entity.x += dx * speed * dt;
  entity.y += dy * speed * dt;

  // Clamp to world bounds
  if (entity.y < GROUND_Y_MIN) entity.y = GROUND_Y_MIN;
  if (entity.y > GROUND_Y_MAX) entity.y = GROUND_Y_MAX;
  if (entity.x < 0) entity.x = 0;
  if (entity.x > WORLD_WIDTH) entity.x = WORLD_WIDTH;

  // Update facing
  if (dx > 0) entity.facing = FACING_RIGHT;
  else if (dx < 0) entity.facing = FACING_LEFT;
}

export function updateProjectiles(projectiles, dt) {
  for (const p of projectiles) {
    p.update(dt);
  }
  // Range expiration is handled later (after collision + gate checks) so the
  // last tick of movement can still register hits.
  return projectiles;
}
