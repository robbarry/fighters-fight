// ─── Server → Client ─────────────────────────────────────
export const MSG_INIT = 0;
export const MSG_SNAPSHOT = 1;
export const MSG_EVENT = 2;
export const MSG_LOBBY_UPDATE = 3;
export const MSG_COUNTDOWN = 4;

// ─── Client → Server ─────────────────────────────────────
export const MSG_JOIN = 10;
export const MSG_TEAM_SELECT = 11;
export const MSG_ROLE_SELECT = 12;
export const MSG_READY = 13;
export const MSG_INPUT = 14;
export const MSG_SHOUT = 15;

// ─── Event Subtypes ──────────────────────────────────────
export const EVT_DEATH = 0;
export const EVT_HIT = 1;
export const EVT_FIRE = 2;
export const EVT_PHASE = 3;
export const EVT_SHOUT = 4;
export const EVT_CALLOUT = 5;
export const EVT_GAMEOVER = 6;
export const EVT_GATE_BREAK = 7;
export const EVT_ROYAL_SPAWN = 8;
export const EVT_AIM = 9;

// ─── Shout Types ─────────────────────────────────────────
export const SHOUT_HELP = 0;
export const SHOUT_LETSGO = 1;
export const SHOUT_HI = 2;
export const CALLOUT_FIRING = 3;
export const CALLOUT_THROWING = 4;
