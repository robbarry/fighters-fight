import {
  TYPE_SWORD,
  TYPE_SPEAR,
  TYPE_ARCHER,
  TYPE_GUNNER,
  TYPE_CATAPULT,
} from '/shared/constants.js';

export const ROLES = [
  {
    type: TYPE_SWORD,
    name: 'Sword & Shield',
    icon: '\u2694\uFE0F',
    desc: 'Front line fighter. Hold Space to swing. Hold Q to block.',
    usesAim: false,
  },
  {
    type: TYPE_SPEAR,
    name: 'Spear',
    icon: '\uD83D\uDD31',
    desc: 'Long reach. Hold Space to stab. Hold Q to block.',
    usesAim: false,
  },
  {
    type: TYPE_ARCHER,
    name: 'Archer',
    icon: '\uD83C\uDFF9',
    desc: 'Aim with the mouse. Hold Space to fire arrows from the wall.',
    usesAim: true,
  },
  {
    type: TYPE_GUNNER,
    name: 'Gunner',
    icon: '\uD83D\uDD2B',
    desc: 'Aim with the mouse. Hold Space to fire shots from the wall.',
    usesAim: true,
  },
  {
    type: TYPE_CATAPULT,
    name: 'Catapult',
    icon: '\uD83E\uDEA8',
    desc: 'Aim with the mouse. Click and hold to charge, release to launch a rock. Space: rapid fire.',
    usesAim: true,
  },
];

const ROLE_BY_TYPE = new Map(ROLES.map(r => [r.type, r]));

export function roleInfo(type) {
  return ROLE_BY_TYPE.get(type) || null;
}

export function roleName(type) {
  return roleInfo(type)?.name || 'Unknown';
}

export function roleUsesAim(type) {
  return !!roleInfo(type)?.usesAim;
}

