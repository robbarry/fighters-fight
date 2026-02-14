import {
  PROJ_ARROW,
  PROJ_ROCK,
  ARROW_DAMAGE,
  ROCK_DAMAGE,
  ARROW_RANGE,
  ROCK_RANGE,
} from '../../shared/constants.js';

class Projectile {
  constructor(id, type, team, x, y, vx, vy, ownerId) {
    this.id = id;
    this.type = type;
    this.team = team;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.prevX = x;
    this.prevY = y;
    this.ownerId = ownerId;
    this.damage = type === PROJ_ARROW ? ARROW_DAMAGE : ROCK_DAMAGE;
    this.distanceTraveled = 0;
    this.maxRange = type === PROJ_ARROW ? ARROW_RANGE : ROCK_RANGE;
    this.alive = true;
  }

  update(dt) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;
    this.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
  }

  isExpired() {
    return this.distanceTraveled > this.maxRange || !this.alive;
  }

  serialize() {
    return [
      this.id,
      this.type,
      this.team,
      Math.round(this.x),
      Math.round(this.y),
      this.ownerId,
      Math.round(this.distanceTraveled),
    ];
  }
}

export default Projectile;
