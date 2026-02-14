// ─── World ───────────────────────────────────────────────
export const WORLD_WIDTH = 6000;
export const GROUND_Y_MIN = 0;
export const GROUND_Y_MAX = 60;

// ─── Teams ───────────────────────────────────────────────
export const TEAM_BLUE = 0;
export const TEAM_RED = 1;

// ─── Entity Types ────────────────────────────────────────
export const TYPE_SWORD = 0;
export const TYPE_SPEAR = 1;
export const TYPE_ARCHER = 2;
export const TYPE_GUNNER = 3;
export const TYPE_CATAPULT = 4;

// ─── Projectile Types ────────────────────────────────────
export const PROJ_ARROW = 0;
export const PROJ_ROCK = 1;

// ─── Entity States ───────────────────────────────────────
export const STATE_IDLE = 0;
export const STATE_MARCH = 1;
export const STATE_ENGAGE = 2;
export const STATE_ATTACK = 3;
export const STATE_CHARGE_CASTLE = 4;
export const STATE_DEAD = 5;
export const STATE_BLOCK = 6;
export const STATE_RESPAWNING = 7;
export const STATE_SPECTATING = 8;

// ─── Facing ──────────────────────────────────────────────
export const FACING_RIGHT = 0;
export const FACING_LEFT = 1;

// ─── Game Phases ─────────────────────────────────────────
export const PHASE_LOBBY = 0;
export const PHASE_COUNTDOWN = 1;
export const PHASE_ARMY_MARCH = 2;
export const PHASE_OPEN_BATTLE = 3;
export const PHASE_CASTLE_ASSAULT = 4;
export const PHASE_FINAL_STAND = 5;
export const PHASE_VICTORY = 6;

// ─── Timing ──────────────────────────────────────────────
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const COUNTDOWN_SECONDS = 3;
export const DEATH_ANIM_MS = 2000;
export const RESPAWN_DELAY_MS = 3000;
export const SHOUT_COOLDOWN_MS = 2000;

// ─── Castle ──────────────────────────────────────────────
export const CASTLE_WIDTH = 300;
export const BLUE_CASTLE_X = 0;
export const RED_CASTLE_X = WORLD_WIDTH - CASTLE_WIDTH;
export const GATE_HP = 200;

// ─── Spawn Areas ─────────────────────────────────────────
export const BLUE_GROUND_SPAWN_MIN = CASTLE_WIDTH + 10;
export const BLUE_GROUND_SPAWN_MAX = CASTLE_WIDTH + 200;
export const RED_GROUND_SPAWN_MIN = RED_CASTLE_X - 200;
export const RED_GROUND_SPAWN_MAX = RED_CASTLE_X - 10;
export const BLUE_WALL_SPAWN_MIN = 30;
export const BLUE_WALL_SPAWN_MAX = CASTLE_WIDTH - 20;
export const RED_WALL_SPAWN_MIN = RED_CASTLE_X + 20;
export const RED_WALL_SPAWN_MAX = WORLD_WIDTH - 30;

// ─── Player ──────────────────────────────────────────────
export const PLAYER_LIVES = 10;
export const PLAYER_HP = 40;
export const PLAYER_SPEED = 150;

// ─── Soldier Stats ───────────────────────────────────────
export const SWORD_HP = 40;
export const SPEAR_HP = 40;
export const ARCHER_HP = 30;
export const GUNNER_HP = 30;
export const SOLDIER_BASE_SPEED = 80;
export const SPEED_VARIANCE = 0.15;
export const ENGAGE_SPEED_MULT = 1.3;

// ─── Army Composition (per side, 140 total) ──────────────
export const ARMY_SWORD_COUNT = 50;
export const ARMY_SPEAR_COUNT = 40;
export const ARMY_ARCHER_COUNT = 30;
export const ARMY_GUNNER_COUNT = 20;
export const ARMY_TOTAL = ARMY_SWORD_COUNT + ARMY_SPEAR_COUNT + ARMY_ARCHER_COUNT + ARMY_GUNNER_COUNT;

// ─── Combat: Sword ───────────────────────────────────────
export const SWORD_DAMAGE = 8;
export const SWORD_RANGE = 30;
export const SWORD_COOLDOWN = 800;

// ─── Combat: Spear ───────────────────────────────────────
export const SPEAR_DAMAGE = 7;
export const SPEAR_RANGE = 50;
export const SPEAR_COOLDOWN = 900;

// ─── Combat: Archer ──────────────────────────────────────
export const ARROW_DAMAGE = 6;
export const ARROW_RANGE = 800;
export const ARROW_SPEED = 400;
export const ARROW_COOLDOWN = 1200;

// ─── Combat: Gunner ──────────────────────────────────────
export const BULLET_DAMAGE = 10;
export const BULLET_RANGE = 1000;
export const BULLET_COOLDOWN = 1500;

// ─── Combat: Catapult ────────────────────────────────────
export const ROCK_DAMAGE = 15;
export const ROCK_RANGE = 1200;
export const ROCK_SPEED = 250;
export const ROCK_COOLDOWN = 3000;
export const ROCK_AOE_RADIUS = 60;
export const CATAPULT_CHARGE_MS = 1000;
export const CATAPULT_CHARGE_SPEED_MAX_MULT = 1.7;
export const CATAPULT_CHARGE_DAMAGE_MAX_MULT = 1.35;

// ─── Combat: General ─────────────────────────────────────
export const MELEE_Y_FORGIVENESS = 20;
export const ENGAGE_RANGE = 200;
export const SHIELD_BLOCK_REDUCTION = 0.8;
export const ATTACK_TIMING_VARIANCE = 0.20;

// ─── Target Selection ────────────────────────────────────
export const TARGET_NEAREST_PCT = 0.70;
export const TARGET_RANDOM_PCT = 0.20;
export const TARGET_LOW_HP_PCT = 0.10;

// ─── Royals ──────────────────────────────────────────────
export const ROYAL_HP = 60;
export const KING_DAMAGE = 12;
export const QUEEN_DAMAGE = 10;
export const KING_COOLDOWN = 700;
export const QUEEN_COOLDOWN = 600;
export const ROYAL_SPEED = 60;

// ─── Spatial Hash ────────────────────────────────────────
export const SPATIAL_CELL_SIZE = 100;

// ─── Rendering (used by client) ──────────────────────────
export const BODY_WIDTH = 12;
export const BODY_HEIGHT = 20;
export const HEAD_RADIUS = 5;
export const ROYAL_SCALE = 1.5;
