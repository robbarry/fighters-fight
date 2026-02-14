import {
  STATE_IDLE,
  STATE_DEAD,
  FACING_RIGHT,
} from '../../shared/constants.js';

class Entity {
  constructor(id, type, team, x, y, hp) {
    this.id = id;
    this.type = type;
    this.team = team;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.maxHp = hp;
    this.state = STATE_IDLE;
    this.facing = FACING_RIGHT;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = STATE_DEAD;
      return true;
    }
    return false;
  }

  get isDead() {
    return this.hp <= 0;
  }

  serialize() {
    return [
      this.id,
      this.type,
      this.team,
      Math.round(this.x),
      Math.round(this.y),
      Math.round(this.hp),
      this.state,
      this.facing,
    ];
  }
}

export default Entity;
