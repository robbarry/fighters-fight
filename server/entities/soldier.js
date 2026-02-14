import Entity from './entity.js';
import {
  TYPE_SWORD,
  TYPE_SPEAR,
  TYPE_ARCHER,
  TYPE_GUNNER,
  SWORD_HP,
  SPEAR_HP,
  ARCHER_HP,
  GUNNER_HP,
  SWORD_DAMAGE,
  SPEAR_DAMAGE,
  ARROW_DAMAGE,
  BULLET_DAMAGE,
  SWORD_RANGE,
  SPEAR_RANGE,
  ARROW_RANGE,
  BULLET_RANGE,
  SWORD_COOLDOWN,
  SPEAR_COOLDOWN,
  ARROW_COOLDOWN,
  BULLET_COOLDOWN,
  SPEED_VARIANCE,
  STATE_IDLE,
  STATE_MARCH,
  STATE_ENGAGE,
  STATE_ATTACK,
  STATE_CHARGE_CASTLE,
  STATE_DEAD,
  DEATH_ANIM_MS,
} from '../../shared/constants.js';

function hpForType(type) {
  switch (type) {
    case TYPE_SWORD:
    case TYPE_SPEAR:
      return type === TYPE_SWORD ? SWORD_HP : SPEAR_HP;
    case TYPE_ARCHER: return ARCHER_HP;
    case TYPE_GUNNER: return GUNNER_HP;
    default: return SWORD_HP;
  }
}

function damageForType(type) {
  switch (type) {
    case TYPE_SWORD: return SWORD_DAMAGE;
    case TYPE_SPEAR: return SPEAR_DAMAGE;
    case TYPE_ARCHER: return ARROW_DAMAGE;
    case TYPE_GUNNER: return BULLET_DAMAGE;
    default: return SWORD_DAMAGE;
  }
}

function rangeForType(type) {
  switch (type) {
    case TYPE_SWORD: return SWORD_RANGE;
    case TYPE_SPEAR: return SPEAR_RANGE;
    case TYPE_ARCHER: return ARROW_RANGE;
    case TYPE_GUNNER: return BULLET_RANGE;
    default: return SWORD_RANGE;
  }
}

function cooldownForType(type) {
  switch (type) {
    case TYPE_SWORD: return SWORD_COOLDOWN;
    case TYPE_SPEAR: return SPEAR_COOLDOWN;
    case TYPE_ARCHER: return ARROW_COOLDOWN;
    case TYPE_GUNNER: return BULLET_COOLDOWN;
    default: return SWORD_COOLDOWN;
  }
}

class Soldier extends Entity {
  constructor(id, type, team, x, y) {
    super(id, type, team, x, y, hpForType(type));

    this.speedMultiplier = 1.0 + (Math.random() * 2 - 1) * SPEED_VARIANCE;
    this.attackCooldownTimer = 0;
    this.attackCooldownBase = cooldownForType(type);
    this.damage = damageForType(type);
    this.attackRange = rangeForType(type);
    this.target = null;
    this.targetRefreshTimer = 0;
    this.deathTimer = 0;
    this.isOnWall = type === TYPE_ARCHER || type === TYPE_GUNNER;
    this.isRemovable = false;
    this.isHuman = false;
  }

  serialize() {
    // [id, type, team, x, y, hp, state, facing, isOnWall]
    return [
      this.id, this.type, this.team,
      Math.round(this.x), Math.round(this.y), Math.round(this.hp),
      this.state, this.facing, this.isOnWall ? 1 : 0,
    ];
  }
}

export default Soldier;
