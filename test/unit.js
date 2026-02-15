import { test } from 'node:test';
import assert from 'node:assert';
import { checkMeleeHit, processMeleeAttack } from '../server/systems/combat.js';
import { STATE_IDLE, STATE_BLOCK } from '../shared/constants.js';

test('Combat: Melee Hit Check', (t) => {
  const attacker = { x: 100, y: 30 };
  const target = { x: 120, y: 30, isOnWall: false, isDead: false };
  
  assert.strictEqual(checkMeleeHit(attacker, target, 30), true, 'Should hit within range');
  assert.strictEqual(checkMeleeHit(attacker, target, 10), false, 'Should miss outside range');
  
  const wallTarget = { x: 120, y: 30, isOnWall: true, isDead: false };
  assert.strictEqual(checkMeleeHit(attacker, wallTarget, 30), false, 'Should not hit wall units with melee');
});

test('Combat: Process Attack', (t) => {
  const attacker = {};
  const target = { 
    state: STATE_IDLE, 
    hp: 100, 
    takeDamage: (amount) => { target.hp -= amount; } 
  };
  
  const res = processMeleeAttack(attacker, target, 10);
  assert.strictEqual(res.hit, true);
  assert.strictEqual(res.damage, 10);
  assert.strictEqual(target.hp, 90);
});

test('Combat: Block Reduction', (t) => {
  const attacker = {};
  const target = { 
    state: STATE_BLOCK, 
    hp: 100, 
    takeDamage: (amount) => { target.hp -= amount; } 
  };
  
  const res = processMeleeAttack(attacker, target, 100);
  assert.strictEqual(res.blocked, true, 'Should report blocked');
  // 95% reduction means 5 damage taken
  assert.ok(res.damage <= 6, 'Damage should be significantly reduced');
  assert.strictEqual(target.hp, 95);
});
