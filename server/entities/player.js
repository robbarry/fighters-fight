import Entity from './entity.js';
import {
  TYPE_SWORD,
  TYPE_SPEAR,
  TYPE_ARCHER,
  TYPE_GUNNER,
  TYPE_CATAPULT,
  PLAYER_HP,
  PLAYER_LIVES,
  SWORD_DAMAGE,
  SPEAR_DAMAGE,
  ARROW_DAMAGE,
  BULLET_DAMAGE,
  ROCK_DAMAGE,
  SWORD_RANGE,
  SPEAR_RANGE,
  ARROW_RANGE,
  BULLET_RANGE,
  ROCK_RANGE,
  SWORD_COOLDOWN,
  SPEAR_COOLDOWN,
  ARROW_COOLDOWN,
  BULLET_COOLDOWN,
  ROCK_COOLDOWN,
  STATE_IDLE,
  STATE_RESPAWNING,
  STATE_SPECTATING,
  STATE_DEAD,
  RESPAWN_DELAY_MS,
} from '../../shared/constants.js';

function damageForRole(role) {
  switch (role) {
    case TYPE_SWORD: return SWORD_DAMAGE;
    case TYPE_SPEAR: return SPEAR_DAMAGE;
    case TYPE_ARCHER: return ARROW_DAMAGE;
    case TYPE_GUNNER: return BULLET_DAMAGE;
    case TYPE_CATAPULT: return ROCK_DAMAGE;
    default: return SWORD_DAMAGE;
  }
}

function rangeForRole(role) {
  switch (role) {
    case TYPE_SWORD: return SWORD_RANGE;
    case TYPE_SPEAR: return SPEAR_RANGE;
    case TYPE_ARCHER: return ARROW_RANGE;
    case TYPE_GUNNER: return BULLET_RANGE;
    case TYPE_CATAPULT: return ROCK_RANGE;
    default: return SWORD_RANGE;
  }
}

function cooldownForRole(role) {
  switch (role) {
    case TYPE_SWORD: return SWORD_COOLDOWN;
    case TYPE_SPEAR: return SPEAR_COOLDOWN;
    case TYPE_ARCHER: return ARROW_COOLDOWN;
    case TYPE_GUNNER: return BULLET_COOLDOWN;
    case TYPE_CATAPULT: return ROCK_COOLDOWN;
    default: return SWORD_COOLDOWN;
  }
}

class Player extends Entity {
  constructor(id, role, team, x, y) {
    super(id, role, team, x, y, PLAYER_HP);

    this.role = role;
    this.lives = PLAYER_LIVES;
    this.respawnTimer = 0;
    this.spawnProtectionTimer = 0;
    this.shoutCooldown = 0;
    this.socketId = null;
    this.isOnWall = false; // All roles now on ground for better battle flow
    this.isHuman = true;
    this.controlsRoyalId = null; // when set, player input drives that royal (FINAL_STAND)

    this.input = { dx: 0, dy: 0, atk: false, blk: false, spc: false, aimX: 0, aimY: 0 };

    this.attackCooldownTimer = 0;
    this.specialCooldownTimer = 0;
    this.attackCooldownBase = cooldownForRole(role);
    this.damage = damageForRole(role);
    this.attackRange = rangeForRole(role);

    // Catapult: hold-to-charge, release-to-fire.
    this.chargeMs = 0;
    this._prevAtk = false;
  }

  applyInput(msg) {
    this.input.dx = msg.dx || 0;
    this.input.dy = msg.dy || 0;
    this.input.atk = !!msg.atk;
    this.input.blk = !!msg.blk;
    this.input.spc = !!msg.spc;
    this.input.aimX = msg.ax || 0;
    this.input.aimY = msg.ay || 0;
  }

  takeDamage(amount) {
    if (this.spawnProtectionTimer > 0) return false;
    return super.takeDamage(amount);
  }

  die() {
    this.lives--;
    this.spawnProtectionTimer = 0;
    if (this.lives > 0) {
      this.state = STATE_RESPAWNING;
      this.respawnTimer = RESPAWN_DELAY_MS;
    } else {
      this.state = STATE_SPECTATING;
    }
  }

  respawn(x, y) {
    this.hp = this.maxHp;
    this.x = x;
    this.y = y;
    this.state = STATE_IDLE;
    this.respawnTimer = 0;
    this.spawnProtectionTimer = 3000;
    this.chargeMs = 0;
    this._prevAtk = false;
  }

  serialize() {
    // [id, role, team, x, y, hp, state, facing, lives, isOnWall, controlsRoyalId]
    return [
      this.id,
      this.role,
      this.team,
      Math.round(this.x),
      Math.round(this.y),
      Math.round(this.hp),
      this.state,
      this.facing,
      this.lives,
      this.isOnWall ? 1 : 0,
      this.controlsRoyalId != null ? this.controlsRoyalId : 0,
    ];
  }
}

export default Player;
