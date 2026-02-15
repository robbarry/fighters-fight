import Player from './entities/player.js';
import Projectile from './entities/projectile.js';
import Royal from './entities/royal.js';
import ArmyManager from './systems/army-manager.js';
import CastleManager from './systems/castle-manager.js';
import SpatialHash from './systems/spatial-hash.js';
import { updateEntityMovement, updateProjectiles } from './systems/physics.js';
import {
  checkMeleeHit,
  processMeleeAttack,
  processHitscan,
  processProjectileCollisions,
} from './systems/combat.js';
import { updateSoldierAI, updateRoyalAI } from './systems/ai.js';
import {
  TEAM_BLUE,
  TEAM_RED,
  TYPE_SWORD,
  TYPE_SPEAR,
  TYPE_ARCHER,
  TYPE_GUNNER,
  TYPE_CATAPULT,
  PROJ_ARROW,
  PROJ_ROCK,
  PROJ_BULLET,
  STATE_IDLE,
  STATE_DEAD,
  STATE_BLOCK,
  STATE_RESPAWNING,
  STATE_SPECTATING,
  PHASE_LOBBY,
  PHASE_COUNTDOWN,
  PHASE_ARMY_MARCH,
  PHASE_OPEN_BATTLE,
  PHASE_CASTLE_ASSAULT,
  PHASE_FINAL_STAND,
  PHASE_VICTORY,
  COUNTDOWN_SECONDS,
  PLAYER_SPEED,
  SWORD_RANGE,
  SWORD_DAMAGE,
  ARROW_SPEED,
  BULLET_SPEED,
  ROCK_SPEED,
  ATTACK_TIMING_VARIANCE,
  CATAPULT_CHARGE_MS,
  CATAPULT_CHARGE_SPEED_MAX_MULT,
  CATAPULT_CHARGE_DAMAGE_MAX_MULT,
  CASTLE_WIDTH,
  BLUE_CASTLE_X,
  RED_CASTLE_X,
  BLUE_GROUND_SPAWN_MIN,
  RED_GROUND_SPAWN_MAX,
  BLUE_WALL_SPAWN_MIN,
  BLUE_WALL_SPAWN_MAX,
  RED_WALL_SPAWN_MIN,
  RED_WALL_SPAWN_MAX,
  GROUND_Y_MAX,
  SHOUT_COOLDOWN_MS,
  ROYAL_SPEED,
  ABILITY_COOLDOWN_SWORD,
  ABILITY_COOLDOWN_SPEAR,
  ABILITY_COOLDOWN_ARCHER,
  ABILITY_COOLDOWN_GUNNER,
  ABILITY_COOLDOWN_CATAPULT,
} from '../shared/constants.js';
import {
  EVT_DEATH,
  EVT_HIT,
  EVT_FIRE,
  EVT_PHASE,
  EVT_SHOUT,
  EVT_CALLOUT,
  EVT_AIM,
  EVT_GAMEOVER,
  EVT_GATE_BREAK,
  EVT_ROYAL_SPAWN,
  CALLOUT_FIRING,
} from '../shared/message-types.js';

// Gate positions: the gate is at the edge of each castle facing the battlefield
const BLUE_GATE_X = BLUE_CASTLE_X + CASTLE_WIDTH;
const RED_GATE_X = RED_CASTLE_X;

class Simulation {
  constructor() {
    this.tick = 0;
    this.phase = PHASE_LOBBY;
    this.armyManager = new ArmyManager();
    this.castleManager = new CastleManager();
    this.spatialHash = new SpatialHash();
    this.players = [];
    this.projectiles = [];
    this.royals = [];
    this.events = [];
    this.nextId = 1;
    this.countdownTimer = 0;
    this.marchTimer = 0;
    this.winner = null;
    this.wallUnitsDropped = { blue: false, red: false };
    this.royalsSpawned = false;
    this._forcedLosingTeam = undefined;
  }

  genId() {
    return this.nextId++;
  }

  addPlayer(socketId, role, team) {
    const id = this.genId();

    // Spawn position based on team and role
    let spawnX, spawnY;
    const isWall = role === TYPE_ARCHER || role === TYPE_GUNNER;

    if (team === TEAM_BLUE) {
      if (isWall) {
        spawnX = (BLUE_WALL_SPAWN_MIN + BLUE_WALL_SPAWN_MAX) / 2;
        spawnY = 30;
      } else {
        spawnX = BLUE_GROUND_SPAWN_MIN + 50;
        spawnY = Math.random() * GROUND_Y_MAX;
      }
    } else {
      if (isWall) {
        spawnX = (RED_WALL_SPAWN_MIN + RED_WALL_SPAWN_MAX) / 2;
        spawnY = 30;
      } else {
        spawnX = RED_GROUND_SPAWN_MAX - 50;
        spawnY = Math.random() * GROUND_Y_MAX;
      }
    }

    const player = new Player(id, role, team, spawnX, spawnY);
    player.socketId = socketId;
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx !== -1) {
      this.players.splice(idx, 1);
    }
  }

  getPlayerBySocketId(socketId) {
    return this.players.find(p => p.socketId === socketId) || null;
  }

  update(dt) {
    switch (this.phase) {
      case PHASE_LOBBY:
        return;

      case PHASE_COUNTDOWN:
        this.countdownTimer -= dt * 1000;
        if (this.countdownTimer <= 0) {
          this.phase = PHASE_ARMY_MARCH;
          this.events.push({ tick: this.tick, e: EVT_PHASE, phase: PHASE_ARMY_MARCH });
          this.marchTimer = 1000;
        }
        return;

      case PHASE_ARMY_MARCH:
        this.marchTimer -= dt * 1000;
        this._updateBattle(dt);
        if (this.marchTimer <= 0) {
          this.phase = PHASE_OPEN_BATTLE;
          this.events.push({ tick: this.tick, e: EVT_PHASE, phase: PHASE_OPEN_BATTLE });
        }
        break;

      case PHASE_OPEN_BATTLE:
      case PHASE_CASTLE_ASSAULT:
      case PHASE_FINAL_STAND:
        this._updateBattle(dt);
        break;

      case PHASE_VICTORY:
        return;
    }

    this.tick++;
  }

  _updateBattle(dt) {
    // Rebuild spatial hash
    this.spatialHash.clear();
    const aliveSoldiers = this.armyManager.getAliveSoldiers();
    for (const s of aliveSoldiers) this.spatialHash.insert(s);
    for (const p of this.players) {
      if (!p.isDead && p.state !== STATE_RESPAWNING && p.state !== STATE_SPECTATING) {
        this.spatialHash.insert(p);
      }
    }
    for (const r of this.royals) {
      if (!r.isDead) this.spatialHash.insert(r);
    }

    // Build team entity lists
    const blueEntities = [
      ...aliveSoldiers.filter(s => s.team === TEAM_BLUE),
      ...this.players.filter(p => p.team === TEAM_BLUE && !p.isDead && p.state !== STATE_RESPAWNING && p.state !== STATE_SPECTATING),
      ...this.royals.filter(r => r.team === TEAM_BLUE && !r.isDead),
    ];
    const redEntities = [
      ...aliveSoldiers.filter(s => s.team === TEAM_RED),
      ...this.players.filter(p => p.team === TEAM_RED && !p.isDead && p.state !== STATE_RESPAWNING && p.state !== STATE_SPECTATING),
      ...this.royals.filter(r => r.team === TEAM_RED && !r.isDead),
    ];

    // Update AI soldiers
    for (const soldier of this.armyManager.soldiers) {
      if (soldier.isRemovable) continue;

      const enemies = soldier.team === TEAM_BLUE ? redEntities : blueEntities;
      const friendlies = soldier.team === TEAM_BLUE ? blueEntities : redEntities;
      const gateX = soldier.team === TEAM_BLUE ? RED_GATE_X : BLUE_GATE_X;

      const result = updateSoldierAI(
        soldier, enemies, friendlies, this.spatialHash, this.phase, gateX, dt
      );

      if (result.telegraph && Number.isFinite(result.telegraph.tx) && Number.isFinite(result.telegraph.ty)) {
        this.events.push({
          tick: this.tick,
          e: EVT_AIM,
          id: soldier.id,
          tx: Math.round(result.telegraph.tx),
          ty: Math.round(result.telegraph.ty),
          tw: result.telegraph.tw ? 1 : 0,
          ms: Math.round(result.telegraph.ms || 0),
        });
      }

      if (result.action === 'melee' && result.target) {
        if (checkMeleeHit(soldier, result.target, soldier.attackRange)) {
          const res = processMeleeAttack(soldier, result.target, soldier.damage);
          this.events.push({
            tick: this.tick,
            e: EVT_HIT,
            attackerId: soldier.id,
            victimId: result.target.id,
            dmg: Math.round(res.damage),
            x: Math.round(result.target.x),
            y: Math.round(result.target.y),
          });
          if (result.target.isDead) {
            this._handleEntityDeath(result.target);
          }
        }
      } else if (result.action === 'projectile') {
        const proj = new Projectile(
          this.genId(),
          result.projType,
          soldier.team,
          result.x,
          result.y,
          result.vx,
          result.vy,
          soldier.id
        );
        if (result.projType === PROJ_ARROW || result.projType === PROJ_BULLET) {
          // Allow per-soldier tuning (ex: AI gunner nerfs) without changing wire format.
          proj.damage = soldier.damage;
        }
        if (result.projType === PROJ_BULLET) {
          // Keep AI bullets from flying the full world width (BULLET_RANGE is tuned for players).
          proj.maxRange = soldier.attackRange;
        }
        this.projectiles.push(proj);
        this.events.push({
          tick: this.tick,
          e: EVT_FIRE,
          id: soldier.id,
          type: result.projType,
          x: Math.round(soldier.x),
          y: Math.round(soldier.y),
        });
      } else if (result.action === 'hitscan' && result.target) {
        const enemies2 = soldier.team === TEAM_BLUE ? redEntities : blueEntities;
        const hit = processHitscan(
          soldier.x, soldier.y,
          result.target.x, result.target.y,
          soldier.team, enemies2, soldier.attackRange,
          {
            // Wall gunners were too oppressive; make AI gunners less accurate and
            // avoid shooting targets right at the base of the wall.
            yForgiveness: soldier.type === TYPE_GUNNER ? 10 : undefined,
            minRange: (soldier.type === TYPE_GUNNER && soldier.isOnWall) ? 140 : 0,
          }
        );
        if (hit) {
          const target = hit.entity;
          const dmg = soldier.damage;
          target.takeDamage(dmg);
          this.events.push({
            tick: this.tick,
            e: EVT_HIT,
            attackerId: soldier.id,
            victimId: target.id,
            dmg,
            x: Math.round(target.x),
            y: Math.round(target.y),
          });
          this.events.push({
            tick: this.tick,
            e: EVT_CALLOUT,
            id: soldier.id,
            s: CALLOUT_FIRING,
            x: Math.round(soldier.x),
            y: Math.round(soldier.y),
          });
          if (target.isDead) {
            this._handleEntityDeath(target);
          }
        }
      } else if (result.action === 'gate_melee') {
        // Soldier attacking the enemy gate
        const targetTeam = soldier.team === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;
        this.castleManager.takeDamage(targetTeam, soldier.damage);
      }
    }

    // Update AI royals (not human controlled)
    for (const royal of this.royals) {
      if (royal.isDead || royal.isHumanControlled) continue;

      const enemies = royal.team === TEAM_BLUE ? redEntities : blueEntities;
      const result = updateRoyalAI(royal, enemies, dt);

      if (result.action === 'melee' && result.target) {
        if (checkMeleeHit(royal, result.target, royal.attackRange)) {
          const res = processMeleeAttack(royal, result.target, royal.damage);
          this.events.push({
            tick: this.tick,
            e: EVT_HIT,
            attackerId: royal.id,
            victimId: result.target.id,
            dmg: Math.round(res.damage),
            x: Math.round(result.target.x),
            y: Math.round(result.target.y),
          });
          if (result.target.isDead) {
            this._handleEntityDeath(result.target);
          }
        }
      }
    }

    // Update players
    for (const player of this.players) {
      if (player.state === STATE_SPECTATING) continue;

      // Handle respawning (must check before isDead since hp is still 0)
      if (player.state === STATE_RESPAWNING) {
        player.respawnTimer -= dt * 1000;
        if (player.respawnTimer <= 0 && player.lives > 0) {
          let spawnX, spawnY;
	          // If a wall unit was "dropped" during the siege, keep them on the ground for respawns.
	          const isWall = player.isOnWall;

          if (player.team === TEAM_BLUE) {
            if (isWall) {
              spawnX = (BLUE_WALL_SPAWN_MIN + BLUE_WALL_SPAWN_MAX) / 2;
              spawnY = 30;
            } else {
              spawnX = BLUE_GROUND_SPAWN_MIN + 50;
              spawnY = Math.random() * GROUND_Y_MAX;
            }
          } else {
            if (isWall) {
              spawnX = (RED_WALL_SPAWN_MIN + RED_WALL_SPAWN_MAX) / 2;
              spawnY = 30;
            } else {
              spawnX = RED_GROUND_SPAWN_MAX - 50;
              spawnY = Math.random() * GROUND_Y_MAX;
            }
          }

          player.respawn(spawnX, spawnY);
        }
        continue;
      }

      if (player.isDead) continue;

      // Reduce cooldowns
      const dtMs = dt * 1000;
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
        const enemies = player.team === TEAM_BLUE ? redEntities : blueEntities;
        
        switch (player.role) {
          case TYPE_SWORD:
            // Whirlwind: AOE attack
            player.specialCooldownTimer = ABILITY_COOLDOWN_SWORD;
            const nearby = this.spatialHash.query(player.x, player.y, 80);
            for (const e of nearby) {
               if (e.team !== player.team && !e.isDead) {
                  // Check distance
                  const dist = Math.abs(e.x - player.x);
                  if (dist < 60) {
                      const res = processMeleeAttack(player, e, 20); // Bonus damage
                      this.events.push({ tick: this.tick, e: EVT_HIT, attackerId: player.id, victimId: e.id, dmg: Math.round(res.damage), x: Math.round(e.x), y: Math.round(e.y) });
                      if (e.isDead) this._handleEntityDeath(e);
                  }
               }
            }
            this.events.push({ tick: this.tick, e: EVT_SHOUT, id: player.id, msg: 4 }); // Use "Throwing spears" slot as placeholder for now, or just generic shout
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
                 const proj = new Projectile(this.genId(), PROJ_ARROW, player.team, player.x, player.y, vx, vy, player.id);
                 proj.damage = player.damage;
                 this.projectiles.push(proj);
             }
             this.events.push({ tick: this.tick, e: EVT_FIRE, id: player.id, type: PROJ_ARROW, x: Math.round(player.x), y: Math.round(player.y) });
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
                 const proj = new Projectile(this.genId(), PROJ_BULLET, player.team, player.x, player.y, vx, vy, player.id);
                 proj.damage = player.damage;
                 proj.maxRange = 600; // Shorter range
                 this.projectiles.push(proj);
             }
             this.events.push({ tick: this.tick, e: EVT_FIRE, id: player.id, type: PROJ_BULLET, x: Math.round(player.x), y: Math.round(player.y) });
             break;
             
          case TYPE_CATAPULT:
             // Rapid Fire
             player.specialCooldownTimer = ABILITY_COOLDOWN_CATAPULT;
             player.attackCooldownTimer = 0;
             this.events.push({ tick: this.tick, e: EVT_SHOUT, id: player.id, msg: 3 }); // "FIRING!"
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
            this.genId(), PROJ_ROCK, player.team,
            player.x, player.y, vx, vy, player.id
          );
          proj.damage = Math.round(proj.damage * damageMult);
          this.projectiles.push(proj);
          this.events.push({
            tick: this.tick,
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
          const nearby = this.spatialHash.query(player.x, player.y, player.attackRange + 20);
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
            this.events.push({
              tick: this.tick,
              e: EVT_HIT,
              attackerId: player.id,
              victimId: bestTarget.id,
              dmg: Math.round(res.damage),
              x: Math.round(bestTarget.x),
              y: Math.round(bestTarget.y),
            });
            if (bestTarget.isDead) {
              this._handleEntityDeath(bestTarget);
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
            this.genId(), PROJ_ARROW, player.team,
            player.x, player.y, vx, vy, player.id
          );
          proj.damage = player.damage;
          this.projectiles.push(proj);
          this.events.push({
            tick: this.tick,
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
              this.genId(), PROJ_BULLET, player.team,
              player.x, player.y, vx, vy, player.id
            );
            proj.damage = player.damage;
            proj.maxRange = player.attackRange;
            this.projectiles.push(proj);
            this.events.push({
              tick: this.tick,
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

    // Update human-controlled royals from player input
    for (const royal of this.royals) {
      if (!royal.isHumanControlled || royal.isDead) continue;

      const controlPlayer = this.players.find(
        p => p.id === royal.controllingPlayerId
      );
      const isController = !!controlPlayer && controlPlayer.controlsRoyalId === royal.id;
      // Fallback to AI if controller is gone. If a player is explicitly assigned to this
      // royal, allow them to "spectate" (their avatar disappears) while still controlling it.
      if (!controlPlayer || (!isController && (controlPlayer.state === STATE_SPECTATING || controlPlayer.isDead))) {
        royal.isHumanControlled = false;
        royal.controllingPlayerId = null;
        continue;
      }

      const { dx, dy, atk, aimX, aimY } = controlPlayer.input;

      // Movement
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        updateEntityMovement(royal, dx / len, dy / len, ROYAL_SPEED * royal.speedMultiplier, dt);
      }

      // Reduce cooldown
      royal.attackCooldownTimer -= dt * 1000;
      if (royal.attackCooldownTimer < 0) royal.attackCooldownTimer = 0;

      // Attack
      if (atk && royal.attackCooldownTimer <= 0) {
        const variance = 1 + (Math.random() * 2 - 1) * ATTACK_TIMING_VARIANCE;
        royal.attackCooldownTimer = royal.attackCooldownBase * variance;

        const enemies = royal.team === TEAM_BLUE ? redEntities : blueEntities;
        let bestTarget = null;
        let bestDist = Infinity;
        const nearby = this.spatialHash.query(royal.x, royal.y, royal.attackRange + 20);
        for (const e of nearby) {
          if (e.team === royal.team || e.isDead) continue;
          if (checkMeleeHit(royal, e, royal.attackRange)) {
            const d = Math.abs(e.x - royal.x);
            if (d < bestDist) {
              bestDist = d;
              bestTarget = e;
            }
          }
        }
        if (bestTarget) {
          const res = processMeleeAttack(royal, bestTarget, royal.damage);
          this.events.push({
            tick: this.tick,
            e: EVT_HIT,
            attackerId: royal.id,
            victimId: bestTarget.id,
            dmg: Math.round(res.damage),
            x: Math.round(bestTarget.x),
            y: Math.round(bestTarget.y),
          });
          if (bestTarget.isDead) {
            this._handleEntityDeath(bestTarget);
          }
        }
      }
    }

    // Update projectiles
    this.projectiles = updateProjectiles(this.projectiles, dt);

    // Process projectile collisions
    const allAlive = [
      ...aliveSoldiers,
      ...this.players.filter(p => !p.isDead && p.state !== STATE_RESPAWNING && p.state !== STATE_SPECTATING),
      ...this.royals.filter(r => !r.isDead),
    ];
    const hitEvents = processProjectileCollisions(
      this.projectiles, allAlive, this.spatialHash, this.events
    );
    for (const evt of hitEvents) {
      evt.tick = this.tick;
      this.events.push(evt);
      // Check if target died from projectile
      const victim = allAlive.find(e => e.id === evt.victimId);
      if (victim && victim.isDead) {
        this._handleEntityDeath(victim);
      }
    }
    // Rock projectiles damage gates
    for (const proj of this.projectiles) {
      if (!proj.alive || proj.type !== PROJ_ROCK) continue;
      // Check if rock hit either gate
      if (proj.team === TEAM_BLUE && Math.abs(proj.x - RED_GATE_X) < 30) {
        this.castleManager.takeDamage(TEAM_RED, proj.damage);
        proj.alive = false;
      } else if (proj.team === TEAM_RED && Math.abs(proj.x - BLUE_GATE_X) < 30) {
        this.castleManager.takeDamage(TEAM_BLUE, proj.damage);
        proj.alive = false;
      }
    }

    // Remove dead projectiles
    this.projectiles = this.projectiles.filter(p => p.alive);

    // Gate damage from CHARGE_CASTLE soldiers and catapult players
    if (this.phase === PHASE_CASTLE_ASSAULT || this.phase === PHASE_FINAL_STAND) {
      let losingTeam = this._getLosingTeam();
      if (losingTeam !== null) {
        const winningTeam = losingTeam === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;

        // If the winning team has been completely wiped out (defenders won the assault),
        // swap the roles: the original winning team is now the loser
        if (this.armyManager.getAliveCount(winningTeam) === 0 &&
            this.armyManager.getAliveCount(losingTeam) > 0) {
          this._forcedLosingTeam = winningTeam;
          losingTeam = winningTeam;
          // Reset wall drop tracking so the new winner's walls get dropped
          this.wallUnitsDropped = { blue: false, red: false };
        }

        const newWinningTeam = losingTeam === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;

        // Drop the winning team's wall units once so they can charge the castle
        const winKey = newWinningTeam === TEAM_BLUE ? 'blue' : 'red';
        if (!this.wallUnitsDropped[winKey]) {
          this.armyManager.dropWallUnits(newWinningTeam);
          this._dropWallPlayers(newWinningTeam);
          this.wallUnitsDropped[winKey] = true;
        }

        // Check gate break
        if (this.castleManager.isGateBroken(losingTeam) && this.phase === PHASE_CASTLE_ASSAULT) {
          this.phase = PHASE_FINAL_STAND;
          this.events.push({
            tick: this.tick,
            e: EVT_GATE_BREAK,
            team: losingTeam,
          });
          this.events.push({
            tick: this.tick,
            e: EVT_PHASE,
            phase: PHASE_FINAL_STAND,
          });
          // Drop the losing team's wall units (gate broken, castle breached)
          const loseKey = losingTeam === TEAM_BLUE ? 'blue' : 'red';
          if (!this.wallUnitsDropped[loseKey]) {
            this.armyManager.dropWallUnits(losingTeam);
            this._dropWallPlayers(losingTeam);
            this.wallUnitsDropped[loseKey] = true;
          }
        }
      }
    }

    // Spawn royals in FINAL_STAND
    if (this.phase === PHASE_FINAL_STAND && !this.royalsSpawned) {
      const losingTeam = this._getLosingTeam();
      if (losingTeam !== null) {
        // Spawn royals for the losing team inside their castle
        const castleCenter = losingTeam === TEAM_BLUE
          ? BLUE_CASTLE_X + CASTLE_WIDTH / 2
          : RED_CASTLE_X + CASTLE_WIDTH / 2;

        const king = new Royal(this.genId(), true, losingTeam, castleCenter - 30, 30);
        const queen = new Royal(this.genId(), false, losingTeam, castleCenter + 30, 30);

        // Assign human players to royals
        const losingPlayers = this.players.filter(
          p => p.team === losingTeam && p.state !== STATE_SPECTATING
        );

	        if (losingPlayers.length >= 2) {
	          // Co-op defending: P1=King, P2=Queen
	          king.isHumanControlled = true;
	          king.controllingPlayerId = losingPlayers[0].id;
	          queen.isHumanControlled = true;
	          queen.controllingPlayerId = losingPlayers[1].id;
	          losingPlayers[0].controlsRoyalId = king.id;
	          losingPlayers[0].state = STATE_SPECTATING;
	          losingPlayers[0].isOnWall = false;
	          losingPlayers[1].controlsRoyalId = queen.id;
	          losingPlayers[1].state = STATE_SPECTATING;
	          losingPlayers[1].isOnWall = false;
	        } else if (losingPlayers.length === 1) {
	          // Versus defending or single player: human = King, AI = Queen
	          king.isHumanControlled = true;
	          king.controllingPlayerId = losingPlayers[0].id;
	          losingPlayers[0].controlsRoyalId = king.id;
	          losingPlayers[0].state = STATE_SPECTATING;
	          losingPlayers[0].isOnWall = false;
	        }
        // else: both AI controlled

        this.royals.push(king, queen);
        this.royalsSpawned = true;

        this.events.push({
          tick: this.tick,
          e: EVT_ROYAL_SPAWN,
          kingId: king.id,
          queenId: queen.id,
          team: losingTeam,
        });
      }
    }

    // Check victory in FINAL_STAND
    if (this.phase === PHASE_FINAL_STAND && this.royals.length > 0) {
      const losingTeamRoyals = this.royals.filter(r => !r.isDead);
      if (losingTeamRoyals.length === 0) {
        this.phase = PHASE_VICTORY;
        // Winner is the team that is NOT the losing team
        const losingTeam = this.royals[0].team;
        this.winner = losingTeam === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;
        this.events.push({
          tick: this.tick,
          e: EVT_GAMEOVER,
          winner: this.winner,
        });
      }
    }

    // Check OPEN_BATTLE -> CASTLE_ASSAULT transition
    // Use ground unit counts: when one side's ground troops are wiped,
    // the other side's ground troops (and eventually wall units) charge the castle.
    // If both sides lose all ground troops simultaneously, the side with more
    // total units (wall) is considered the winner; if tied, pick randomly.
    if (this.phase === PHASE_OPEN_BATTLE) {
      const blueGround = this.armyManager.getAliveGroundCount(TEAM_BLUE);
      const redGround = this.armyManager.getAliveGroundCount(TEAM_RED);

      if (blueGround === 0 || redGround === 0) {
        // Handle stalemate: both ground armies wiped at same time
        if (blueGround === 0 && redGround === 0) {
          // Both wiped -- compare total (wall) units to pick a "loser"
          const blueTotal = this.armyManager.getAliveCount(TEAM_BLUE);
          const redTotal = this.armyManager.getAliveCount(TEAM_RED);
          let loser;
          if (blueTotal < redTotal) {
            loser = TEAM_BLUE;
          } else if (redTotal < blueTotal) {
            loser = TEAM_RED;
          } else {
            // Truly equal -- pick a side randomly
            loser = Math.random() < 0.5 ? TEAM_BLUE : TEAM_RED;
          }
	          this._forcedLosingTeam = loser;
	          // Drop the loser's wall units to ground so the winner can assault them
	          this.armyManager.dropWallUnits(loser);
	          this._dropWallPlayers(loser);
	        } else {
	          // One side still has ground troops, the other doesn't
	          this._forcedLosingTeam = blueGround === 0 ? TEAM_BLUE : TEAM_RED;
	        }

        this.phase = PHASE_CASTLE_ASSAULT;
        this.events.push({
          tick: this.tick,
          e: EVT_PHASE,
          phase: PHASE_CASTLE_ASSAULT,
        });
      }
    }

    // Clean up dead soldiers
    this.armyManager.removeDead();
  }

  _handleEntityDeath(entity) {
    // For humans, skip if death is already being processed (respawning or spectating)
    if (entity.isHuman && (entity.state === STATE_RESPAWNING || entity.state === STATE_SPECTATING)) {
      return;
    }
    // Emit death event
    this.events.push({
      tick: this.tick,
      e: EVT_DEATH,
      id: entity.id,
      x: Math.round(entity.x),
      y: Math.round(entity.y),
    });
    if (entity.isHuman) {
      entity.die(); // Overrides STATE_DEAD from takeDamage → RESPAWNING or SPECTATING
    }
    // For non-humans, takeDamage() already set STATE_DEAD
  }

  _dropWallPlayers(team) {
    for (const p of this.players) {
      if (p.team !== team) continue;
      if (!p.isOnWall) continue;
      if (p.state === STATE_SPECTATING) continue;
      p.isOnWall = false;
      // Keep them usable on the ground (spread out a bit).
      p.y = Math.random() * GROUND_Y_MAX;
    }
  }

  _getLosingTeam() {
    // If explicitly set (from stalemate resolution), use that
    if (this._forcedLosingTeam !== undefined) return this._forcedLosingTeam;
    // Otherwise, the team with zero ground troops loses
    if (this.armyManager.getAliveGroundCount(TEAM_BLUE) === 0 &&
        this.armyManager.getAliveGroundCount(TEAM_RED) > 0) return TEAM_BLUE;
    if (this.armyManager.getAliveGroundCount(TEAM_RED) === 0 &&
        this.armyManager.getAliveGroundCount(TEAM_BLUE) > 0) return TEAM_RED;
    // Fallback: compare total alive
    const blueAlive = this.armyManager.getAliveCount(TEAM_BLUE);
    const redAlive = this.armyManager.getAliveCount(TEAM_RED);
    if (blueAlive === 0) return TEAM_BLUE;
    if (redAlive === 0) return TEAM_RED;
    return this._forcedLosingTeam ?? null;
  }

  startGame() {
    this.nextId = 1;
    // Re-assign player IDs
    for (const p of this.players) {
      p.id = this.genId();
    }
    this.nextId = this.armyManager.spawnArmies(this.nextId);
    this.phase = PHASE_COUNTDOWN;
    this.countdownTimer = COUNTDOWN_SECONDS * 1000;
    this.events.push({ tick: 0, e: EVT_PHASE, phase: PHASE_COUNTDOWN });
  }

  buildSnapshot() {
    return {
      tick: this.tick,
      phase: this.phase,
      soldiers: this.armyManager.soldiers
        .filter(s => !s.isRemovable)
        .map(s => s.serialize()),
      projectiles: this.projectiles.map(p => p.serialize()),
      royals: this.royals.map(r => r.serialize()),
      players: this.players.map(p => p.serialize()),
      gates: this.castleManager.serialize(),
      armyCounts: [
        this.armyManager.getAliveCount(TEAM_BLUE),
        this.armyManager.getAliveCount(TEAM_RED),
      ],
    };
  }

  getEvents() {
    const evts = this.events;
    this.events = [];
    return evts;
  }

  reset() {
    this.tick = 0;
    this.phase = PHASE_LOBBY;
    this.armyManager = new ArmyManager();
    this.castleManager = new CastleManager();
    this.spatialHash = new SpatialHash();
    this.players = [];
    this.projectiles = [];
    this.royals = [];
    this.events = [];
    this.nextId = 1;
    this.countdownTimer = 0;
    this.marchTimer = 0;
    this.winner = null;
    this.wallUnitsDropped = { blue: false, red: false };
    this.royalsSpawned = false;
    this._forcedLosingTeam = undefined;
  }
}

export default Simulation;
