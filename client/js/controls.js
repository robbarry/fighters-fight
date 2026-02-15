import {
  SHOUT_HELP,
  SHOUT_LETSGO,
  SHOUT_HI,
} from '/shared/message-types.js';

export const KEYBINDS = {
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],

  attack: ['KeyE'], // Primary is Mouse Click
  special: ['Space'],
  block: ['KeyQ'],

  spectateNext: ['Tab'],

  shoutHelp: ['KeyK'],
  shoutLetsGo: ['KeyL'],
  shoutHi: ['KeyR'],

  overviewToggle: ['KeyZ'],

  helpToggle: ['Slash'], // Shift + / => '?'
  helpClose: ['Escape'],
};

export const MOVE_WASD = [
  KEYBINDS.moveUp[0],
  KEYBINDS.moveLeft[0],
  KEYBINDS.moveDown[0],
  KEYBINDS.moveRight[0],
];

export const MOVE_ARROWS = [
  KEYBINDS.moveUp[1],
  KEYBINDS.moveLeft[1],
  KEYBINDS.moveDown[1],
  KEYBINDS.moveRight[1],
];

export const SHOUT_BINDINGS = [
  { codes: KEYBINDS.shoutHelp, shout: SHOUT_HELP, label: 'Help' },
  { codes: KEYBINDS.shoutLetsGo, shout: SHOUT_LETSGO, label: "Let's go" },
  { codes: KEYBINDS.shoutHi, shout: SHOUT_HI, label: 'Hi' },
];

export const HELP_SECTIONS = [
  {
    title: 'Movement',
    rows: [
      {
        combos: [MOVE_WASD, MOVE_ARROWS],
        joiner: 'or',
        text: 'Move (ground roles). Wall roles only move left/right.',
      },
    ],
  },
  {
    title: 'Combat',
    rows: [
      {
        keysText: 'Left Click or E',
        text: 'Attack / fire. Catapult: hold to charge, release to fire.',
      },
      {
        keysText: 'Space',
        text: 'Special Ability (Dash, Whirlwind, Volley, etc.)',
      },
      {
        keysText: 'Right Click or Q',
        text: 'Block (Sword/Spear only).',
      },
      {
        keysText: 'Mouse',
        text: 'Aim (Archer/Gunner/Catapult).',
      },
    ],
  },
  {
    title: 'Team Comms',
    rows: [
      {
        combos: SHOUT_BINDINGS.map(b => b.codes),
        joiner: ',',
        text: 'Shouts (K/L/R).',
      },
    ],
  },
  {
    title: 'Spectating',
    rows: [
      {
        combos: [KEYBINDS.spectateNext],
        text: 'When spectating: cycle ally soldier camera.',
      },
    ],
  },
  {
    title: 'Help',
    rows: [
      {
        combos: [KEYBINDS.overviewToggle],
        text: 'Toggle battlefield view (zoom out to see both castles).',
      },
      {
        keysText: '?',
        text: 'Toggle this help screen.',
      },
      {
        combos: [KEYBINDS.helpClose],
        text: 'Close help.',
      },
      {
        keysText: 'Click',
        text: 'After victory: play again.',
      },
    ],
  },
];
