/* Chances shown on the attack wheel. Pure maths: the odds come from the values the page holds,
   using the same bonuses the server adds. A tie is not a win, which matches the server. */

import { state } from './state.js';
import { sameTile } from './geometry.js';

// the chance that one d20 plus one bonus beats another d20 plus its bonus
export function chanceD20Beats(attackerBonus, defenderBonus) {
  let wins = 0;
  for (let attackerRoll = 1; attackerRoll <= 20; attackerRoll++) {
    for (let defenderRoll = 1; defenderRoll <= 20; defenderRoll++) {
      if (attackerRoll + attackerBonus > defenderRoll + defenderBonus) wins++;
    }
  }
  return wins / 400;
}

// the chance that two six-sided dice add up to at least the target
export function chanceTwoDiceReach(target) {
  let reaching = 0;
  for (let first = 1; first <= 6; first++) {
    for (let second = 1; second <= 6; second++) {
      if (first + second >= target) reaching++;
    }
  }
  return reaching / 36;
}

// a fraction shown as a whole percentage
export const percentText = chance => `${Math.round(chance * 100)}%`;

// the first living object a player owns on a tile, as the server picks it (the Nuke is never used)
function firstObjectOwnedOn(player, cube) {
  return state.game.objects.find(obj => obj.alive && !obj.isNuke && obj.player === player && sameTile(obj.cube, cube)) || null;
}

// Ground Zero adds 1 to a hero's d20 roll
function groundZeroBonus(hero) {
  const tile = state.game.tiles[hero.cube.join(',')];
  return tile && tile.groundZero ? 1 : 0;
}

// the barrier level on the tile a unit stands on
function barrierLevelOn(hero) {
  const tile = state.game.tiles[hero.cube.join(',')];
  return tile ? Number(tile.barrier || 0) : 0;
}

// the chances of an attack: getting through the barrier, the d20 contest, and both together
export function combatOdds(attacker, defender) {
  const attackerObject = firstObjectOwnedOn(attacker.player, attacker.cube);
  const defenderObject = firstObjectOwnedOn(defender.player, defender.cube);
  const attackBonus = attacker.stats.strength + groundZeroBonus(attacker)
    + (attackerObject ? attackerObject.stats.strength : 0);
  const defenseBonus = defender.stats.defense + groundZeroBonus(defender)
    + (defenderObject ? defenderObject.stats.defense : 0);
  const barrier = barrierLevelOn(defender);
  const throughBarrier = barrier > 0 ? chanceTwoDiceReach(barrier) : 1;
  const hit = chanceD20Beats(attackBonus, defenseBonus);
  return { barrier, throughBarrier, hit, landed: throughBarrier * hit };
}

// the chance Mind Control succeeds; the defender's barrier adds to its defence
export function mindControlOdds(attacker, defender) {
  const attackerObject = firstObjectOwnedOn(attacker.player, attacker.cube);
  const defenderObject = firstObjectOwnedOn(defender.player, defender.cube);
  const attackBonus = attacker.stats.intelligence + groundZeroBonus(attacker)
    + (attackerObject ? attackerObject.stats.intelligence : 0);
  const defenseBonus = defender.stats.intelligence + barrierLevelOn(defender)
    + (defenderObject ? defenderObject.stats.intelligence : 0);
  return chanceD20Beats(attackBonus, defenseBonus);
}
