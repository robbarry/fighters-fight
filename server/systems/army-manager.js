import Soldier from '../entities/soldier.js';
import {
  TEAM_BLUE,
  TEAM_RED,
  TYPE_SWORD,
  TYPE_SPEAR,
  TYPE_ARCHER,
  TYPE_GUNNER,
  ARMY_SWORD_COUNT,
  ARMY_SPEAR_COUNT,
  ARMY_ARCHER_COUNT,
  ARMY_GUNNER_COUNT,
  BLUE_GROUND_SPAWN_MIN,
  BLUE_GROUND_SPAWN_MAX,
  RED_GROUND_SPAWN_MIN,
  RED_GROUND_SPAWN_MAX,
  BLUE_WALL_SPAWN_MIN,
  BLUE_WALL_SPAWN_MAX,
  RED_WALL_SPAWN_MIN,
  RED_WALL_SPAWN_MAX,
  GROUND_Y_MAX,
  STATE_DEAD,
  DEATH_ANIM_MS,
} from '../../shared/constants.js';

class ArmyManager {
  constructor() {
    this.soldiers = [];
  }

  spawnArmies(nextIdCounter) {
    let id = nextIdCounter;

    // Helper to create a batch of soldiers
    const spawnBatch = (count, type, team, xMin, xMax, yMin, yMax) => {
      for (let i = 0; i < count; i++) {
        const x = xMin + (i / Math.max(count - 1, 1)) * (xMax - xMin);
        const y = yMin + Math.random() * (yMax - yMin);
        const soldier = new Soldier(id++, type, team, x, y);
        this.soldiers.push(soldier);
      }
    };

    // Blue army - ground units
    spawnBatch(ARMY_SWORD_COUNT, TYPE_SWORD, TEAM_BLUE,
      BLUE_GROUND_SPAWN_MIN, BLUE_GROUND_SPAWN_MAX, 0, GROUND_Y_MAX);
    spawnBatch(ARMY_SPEAR_COUNT, TYPE_SPEAR, TEAM_BLUE,
      BLUE_GROUND_SPAWN_MIN, BLUE_GROUND_SPAWN_MAX, 0, GROUND_Y_MAX);

    // Blue army - wall units (y=30 centered in ground band)
    spawnBatch(ARMY_ARCHER_COUNT, TYPE_ARCHER, TEAM_BLUE,
      BLUE_WALL_SPAWN_MIN, BLUE_WALL_SPAWN_MAX, 30, 30);
    spawnBatch(ARMY_GUNNER_COUNT, TYPE_GUNNER, TEAM_BLUE,
      BLUE_WALL_SPAWN_MIN, BLUE_WALL_SPAWN_MAX, 30, 30);

    // Red army - ground units
    spawnBatch(ARMY_SWORD_COUNT, TYPE_SWORD, TEAM_RED,
      RED_GROUND_SPAWN_MIN, RED_GROUND_SPAWN_MAX, 0, GROUND_Y_MAX);
    spawnBatch(ARMY_SPEAR_COUNT, TYPE_SPEAR, TEAM_RED,
      RED_GROUND_SPAWN_MIN, RED_GROUND_SPAWN_MAX, 0, GROUND_Y_MAX);

    // Red army - wall units
    spawnBatch(ARMY_ARCHER_COUNT, TYPE_ARCHER, TEAM_RED,
      RED_WALL_SPAWN_MIN, RED_WALL_SPAWN_MAX, 30, 30);
    spawnBatch(ARMY_GUNNER_COUNT, TYPE_GUNNER, TEAM_RED,
      RED_WALL_SPAWN_MIN, RED_WALL_SPAWN_MAX, 30, 30);

    return id;
  }

  getAliveCount(team) {
    let count = 0;
    for (const s of this.soldiers) {
      if (s.team === team && !s.isDead) count++;
    }
    return count;
  }

  getAliveGroundCount(team) {
    let count = 0;
    for (const s of this.soldiers) {
      if (s.team === team && !s.isDead && !s.isOnWall) count++;
    }
    return count;
  }

  getSoldiersByTeam(team) {
    return this.soldiers.filter(s => s.team === team);
  }

  getAliveSoldiers() {
    return this.soldiers.filter(s => !s.isDead);
  }

  removeDead() {
    this.soldiers = this.soldiers.filter(s => !s.isRemovable);
  }

  dropWallUnits(team) {
    for (const s of this.soldiers) {
      if (s.team === team && s.isOnWall && !s.isDead) {
        s.isOnWall = false;
        s.y = Math.random() * GROUND_Y_MAX;
      }
    }
  }

  serialize() {
    return this.soldiers
      .filter(s => s.state !== STATE_DEAD || s.deathTimer < DEATH_ANIM_MS)
      .map(s => s.serialize());
  }
}

export default ArmyManager;
