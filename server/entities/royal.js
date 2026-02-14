import Entity from './entity.js';
import {
  ROYAL_HP,
  KING_DAMAGE,
  QUEEN_DAMAGE,
  KING_COOLDOWN,
  QUEEN_COOLDOWN,
  SWORD_RANGE,
  STATE_IDLE,
} from '../../shared/constants.js';

class Royal extends Entity {
  constructor(id, isKing, team, x, y) {
    // type field stores 'king' or 'queen' as a string -- but serialize uses isKing flag
    super(id, isKing ? 'king' : 'queen', team, x, y, ROYAL_HP);

    this.isKing = isKing;
    this.damage = isKing ? KING_DAMAGE : QUEEN_DAMAGE;
    this.attackCooldownBase = isKing ? KING_COOLDOWN : QUEEN_COOLDOWN;
    this.attackCooldownTimer = 0;
    this.attackRange = SWORD_RANGE;
    this.isHumanControlled = false;
    this.controllingPlayerId = null;
    this.target = null;
    this.speedMultiplier = 1.0;
    this.isOnWall = false;
    this.isHuman = false;
    this.deathTimer = 0;
    this.isRemovable = false;
  }

  serialize() {
    return [
      this.id,
      this.isKing ? 1 : 0,
      this.team,
      Math.round(this.x),
      Math.round(this.y),
      Math.round(this.hp),
      this.state,
      this.facing,
    ];
  }
}

export default Royal;
