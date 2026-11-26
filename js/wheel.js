/* Wheel menus: the choices that open after a board tap or drop (attack, move, develop, carry,
   barrier, skill and emoji). Each choice sends its action to the server through server.js. */

import { RULES, ROUND, MUST_CHOOSE, EMOJIS, SKILLS, SKILL_ICON, SKILL_NAME } from './config.js';
import { state, setMessage } from './state.js';
import { indexFromPage } from './escape.js';
import {
  tileAt, heroIndex, myIndex, isMine, reach, carryable, inRangeOf, combatLock, canAct, canMindControl,
  actingUnit, selectedHero, unitFromRef, unitRef, heroName, heroLabel, maxRangeWith,
} from './rules.js';
import { cubeDistance } from './geometry.js';
import { submitAction, sendEmojiToRoom } from './server.js';
import { render } from './render.js';
import { objectsAt } from './rules.js';

// opens a wheel menu on the board; the wheel records what kind of choice it is
export function openWheel(wheel) {
  state.ui.wheel = wheel;
}

// closes the open wheel
export function closeWheel() {
  state.ui.wheel = null;
}

// closes the menus, unless the open wheel must be answered first
export function dismissMenus() {
  if (state.ui.wheel && MUST_CHOOSE.includes(state.ui.wheel.kind)) return;
  closeWheel();
  state.ui.carry = null;
  state.ui.devType = null;
  if (state.ui.mode !== 'place' && state.ui.mode !== 'remove') state.ui.mode = '';
}

// the carry menu's choices: each object on the tile, and a Move button
export function carryItems() {
  const hero = state.game.heroes[state.ui.carry.heroIndex];
  const options = carryable(hero).map(obj => {
    const index = state.game.objects.indexOf(obj);
    const picked = state.ui.carry.objectIndexes.includes(index) ? '✔ ' : '';
    const label = obj.isNuke ? 'Nuke'
      : `${obj.player !== hero.player ? state.game.players[obj.player].name + ' · ' : ''}DEF ${obj.stats.defense} · RNG ${obj.stats.range}`;
    return { v: 'o' + index, ic: obj.isNuke ? '☢' : (obj.symbol || '🧱'), t: picked + label };
  });
  return [...options, { v: 'go', ic: '➜', t: 'Move' }];
}

// opens the carry menu after a move to a tile that holds objects
export function openCarryWheel(heroIdx, cube) {
  state.ui.carry = { heroIndex: heroIdx, cube, objectIndexes: [] };
  openWheel({ cube: state.game.heroes[heroIdx].cube, kind: 'carry', items: carryItems() });
}

// ticks or unticks an object in the carry menu
export function toggleCarry(value) {
  const index = indexFromPage(value.slice(1), state.game.objects);
  if (index === null) return setMessage('That object is no longer on this tile');
  const list = state.ui.carry.objectIndexes;
  const at = list.indexOf(index);
  if (at >= 0) list.splice(at, 1);
  else list.push(index);
  openWheel({ cube: state.game.heroes[state.ui.carry.heroIndex].cube, kind: 'carry', items: carryItems() });
}

// sends the move once the carry choice is made, after checking the hero can reach the tile
export function confirmCarry() {
  const { heroIndex, cube, objectIndexes } = state.ui.carry;
  state.ui.carry = null;
  const range = maxRangeWith(state.game.heroes[heroIndex], objectIndexes.map(i => state.game.objects[i]));
  if (cubeDistance(state.game.heroes[heroIndex].cube, cube) > range) {
    return setMessage('Too far for its own range: take an object with range along');
  }
  return sendMove(heroIndex, cube, objectIndexes, null);
}

// sends a move; when the move reveals a skill tile with carried objects, asks where the point goes
export async function sendMove(heroIdx, cube, objectIndexes, bonus) {
  const { message } = await submitAction({
    type: 'move',
    hero: heroIdx,
    to: cube,
    carry: objectIndexes,
    bonus: bonus ? bonus.mode : null,
    bonusObj: bonus && bonus.mode === 'obj' ? bonus.index : null,
  });
  if (!message.includes('DISCOVERY_CHOICE')) return;
  const pickable = objectIndexes.filter(i => !state.game.objects[i].isNuke);
  openWheel({
    cube: state.game.heroes[heroIdx].cube,
    kind: 'moveBonus',
    heroIndex: heroIdx,
    target: cube,
    objectIndexes,
    items: [
      { v: 'hero', ic: '👤', t: 'Hero' },
      ...pickable.map(i => ({ v: 'o' + i, ic: state.game.objects[i].symbol || '🧱', t: 'DEF ' + state.game.objects[i].stats.defense })),
    ],
  });
  render();
}

// moves a hero to a tile, or opens the carry menu first when objects are on the hero's tile
export function moveTo(heroIdx, cube) {
  const hero = state.game.heroes[heroIdx];
  if (!canAct(hero, 'move')) {
    return setMessage(hero.actions < 1 ? 'No actions left for this hero this turn' : 'This hero has already moved this turn');
  }
  const distance = cubeDistance(hero.cube, cube);
  if (distance < 1 || distance > reach(hero)) return setMessage('Out of range');
  if (carryable(hero).length) return openCarryWheel(heroIdx, cube);
  return sendMove(heroIdx, cube, [], null);
}

// the attack or Mind Control choice for two heroes, with the options that are not available greyed out
export function openAttackChoice(attackerIdx, defenderIdx) {
  const attacker = state.game.heroes[attackerIdx];
  const defender = state.game.heroes[defenderIdx];
  const inRange = inRangeOf(attacker, defender);
  const ownedByMe = !!defender.mindControl && defender.mindControl.by === myIndex();
  const lock = combatLock(attacker);
  const attackOk = inRange && !ownedByMe && canAct(attacker, 'attack') && (!lock || lock === 'attack');
  const mindOk = canMindControl(attacker, defender) && (!lock || lock === 'mind');
  if (!attackOk && !mindOk) {
    if (lock) return setMessage(`This hero already used ${lock === 'mind' ? 'Mind Control' : 'Combat'} this turn`);
    if (!inRange) return setMessage(`Out of range: this hero's reach is ${reach(attacker)} (its Range plus the best object Range on its tile)`);
    if (state.game.round < ROUND.attacksFrom) return setMessage('Attacks and Mind Control unlock in round 4');
    return setMessage('No attack or Mind Control available to this hero on that target');
  }
  openWheel({
    cube: defender.cube,
    kind: 'attackChoice',
    heroIndex: attackerIdx,
    targetIndex: defenderIdx,
    items: [
      { v: 'atk', ic: '⚔️', t: 'Combat', dis: !attackOk },
      { v: 'mind', ic: '🧠', t: 'Mind Control', dis: !mindOk },
    ],
  });
}

// when several enemies share a tile, asks which one to target
export function openTargetPick(attackerIdx, cube, enemyIdxs) {
  openWheel({
    cube,
    kind: 'targetPick',
    heroIndex: attackerIdx,
    items: enemyIdxs.map(i => ({
      v: 't' + i, ic: '🧍', t: `${state.game.players[state.game.heroes[i].player].name} ${heroName(state.game.heroes[i])}`,
    })),
  });
}

// a Nuke attack from a hero
export function attackNukeWith(heroIdx) {
  return submitAction({ type: 'attack_nuke', hero: heroIdx });
}

// the develop menu: what to raise (barrier, object or skill)
export function developTypeItems() {
  return [
    { v: 'barrier', ic: '🛑', t: 'Barrier' },
    { v: 'object', ic: '🧿', t: 'Object' },
    { v: 'skill', ic: '⬆️', t: 'Skill' },
  ].filter(item => !state.game.apocalypse || item.v === 'skill');
}

// the skill choices for a develop or buy
export const skillItems = () => SKILLS.map(k => ({ v: k, ic: SKILL_ICON[k], t: SKILL_NAME[k] }));

// roll or take the fixed point when developing
export const rollItems = () => [{ v: 'roll', ic: '🎲', t: 'Roll d20' }, { v: 'take', ic: '1️⃣', t: 'Take 1 pt' }];

// the direction choices for a barrier develop: raise or lower
export function buildDirItems(cube) {
  const tile = tileAt(cube);
  return [
    { v: 'up', ic: '▲', t: 'Raise', dis: !tile.discovered || tile.barrier >= RULES.maxBarrier },
    { v: 'down', ic: '▼', t: 'Lower', dis: !tile.discovered || !tile.barrier },
  ];
}

// the direction choices for a barrier purchase on a tile that already has one
export function barrierBuyItems(cube) {
  const tile = tileAt(cube);
  return [
    { v: 'up', ic: '▲', t: 'Raise', dis: tile.barrier >= RULES.maxBarrier },
    { v: 'down', ic: '▼', t: 'Lower' },
  ];
}

// the menu of a hero that is under control: develop it, or end its turn
export function controlledHeroItems() {
  return [{ v: 'develop', ic: '🛠', t: 'Develop' }, { v: 'skip', ic: '⏭', t: 'Skip rest' }];
}

// the emoji choices shown when a player taps a hero outside their turn
export const emojiItems = () => EMOJIS.map(e => ({ v: e, ic: e, t: '' }));

// opens the placement menu for the tile a player has chosen, from the tiles they hold
export function openPlacementWheel(cube) {
  if (!state.priv || !state.priv.pool.length) {
    setMessage('Your tiles are still loading. Try again in a moment.');
    return render();
  }
  openWheel({
    cube,
    kind: 'place',
    items: state.priv.pool.map(s => ({ v: s, ic: SKILL_ICON[s], t: SKILL_NAME[s] })),
  });
}

// develop on a tile: the choice of what to build, or the skill target
export function handleDevelopClick(cube, unit) {
  if (state.ui.devType === 'skill') {
    const hero = selectedHero();
    const isTarget = unit && hero && actingUnit(unit) && cubeDistance(unit.cube, hero.cube) <= 1;
    if (!isTarget) return setMessage('Click one of the highlighted heroes or objects');
    openWheel({ cube: unit.cube, kind: 'developSkill', unit: unitRef(unit), items: skillItems() });
    return render();
  }
  if (!state.game.round || !isValidDevelopTile(cube)) {
    state.ui.mode = '';
    state.ui.devType = null;
    return render();
  }
  if (state.ui.devType === 'barrier') openWheel({ cube, kind: 'buildDir', items: buildDirItems(cube) });
  else openWheel({ cube, kind: 'roll', unit: null, items: rollItems() });
  return render();
}

// whether a tile can take the chosen develop build
function isValidDevelopTile(cube) {
  const tile = tileAt(cube);
  const hero = selectedHero();
  if (!tile || !hero || cubeDistance(hero.cube, cube) > 1) return false;
  if (state.ui.devType === 'barrier') return !state.game.apocalypse && !!tile.discovered;
  if (state.ui.devType === 'object') return !state.game.apocalypse && !!tile.discovered;
  return false;
}

// sends a develop: the roll for a barrier, object or skill
export async function sendDevelop(wheel, take) {
  const hero = selectedHero();
  if (!hero) return setMessage('Select a hero first');
  const { data, message } = await submitAction({
    type: 'develop',
    hero: heroIndex(hero),
    mode: state.ui.devType,
    cube: wheel.cube || null,
    unit: wheel.unit || null,
    skill: state.ui.devSkill,
    take,
    dir: wheel.dir || 'up',
  });
  if (message) return;
  if (data && data.nat20) {
    state.ui.mode = 'develop';
    state.ui.devType = null;
    openWheel({ cube: hero.cube, kind: 'developType', items: developTypeItems() });
  } else {
    state.ui.mode = '';
    state.ui.devType = null;
    state.ui.selectedIndex = null;
  }
  render();
}

// the menu choice made on a wheel: each wheel kind has its own handler
export function pickWheelItem(value) {
  const wheel = state.ui.wheel;
  if (!wheel) return render();
  if (value === 'x') {
    dismissMenus();
    return render();
  }

  const handlers = {
    emoji: () => sendEmojiToRoom(state.game.heroes[wheel.heroIndex], value),
    place: () => submitAction({ type: 'place', cube: wheel.cube, skill: value }),
    barrierBuy: () => {
      submitAction({ type: 'buy_barrier', cube: wheel.cube, dir: value });
      state.ui.mode = '';
    },
    buildDir: () => openWheel({ cube: wheel.cube, kind: 'roll', dir: value, unit: null, items: rollItems() }),
    carry: () => (value === 'go' ? confirmCarry() : toggleCarry(value)),
    targetPick: () => {
      const target = indexFromPage(value.slice(1), state.game.heroes);
      if (target === null) return setMessage('That enemy is no longer there');
      openAttackChoice(wheel.heroIndex, target);
    },
    attackChoice: () => {
      if (value === 'atk') submitAction({ type: 'attack', hero: wheel.heroIndex, target: wheel.targetIndex });
      else submitAction({ type: 'mind_control', hero: wheel.heroIndex, target: wheel.targetIndex });
    },
    cede: () => submitAction({ type: 'cede', hero: wheel.heroIndex }),
    controlled: () => {
      if (value === 'skip') return submitAction({ type: 'skip_hero', hero: wheel.heroIndex });
      const hero = state.game.heroes[wheel.heroIndex];
      state.ui.selectedIndex = wheel.heroIndex;
      if (!canAct(hero, 'develop')) return setMessage('This hero cannot develop right now');
      state.ui.mode = 'develop';
      state.ui.devType = null;
      openWheel({ cube: hero.cube, kind: 'developType', items: developTypeItems() });
    },
    developType: () => {
      state.ui.devType = value;
      if (value === 'skill') setMessage('Click one of the highlighted heroes or objects to raise the chosen skill.');
    },
    developSkill: () => {
      const target = unitFromRef(wheel.unit);
      if (target.stats[skillStatName(value)] >= RULES.maxSkill) return setMessage('That skill is maxed');
      state.ui.devSkill = value;
      openWheel({ cube: target.cube, kind: 'roll', unit: wheel.unit, items: rollItems() });
    },
    roll: () => sendDevelop(wheel, value === 'take'),
    moveBonus: () => {
      if (value === 'hero') return sendMove(wheel.heroIndex, wheel.target, wheel.objectIndexes, { mode: 'hero' });
      const index = indexFromPage(value.slice(1), state.game.objects);
      if (index === null) return setMessage('That object is no longer there');
      return sendMove(wheel.heroIndex, wheel.target, wheel.objectIndexes, { mode: 'obj', index });
    },
  };

  closeWheel();
  const handler = handlers[wheel.kind];
  if (handler) handler();
  render();
}

// the full stat name for a skill code, used to read a unit's stats
const skillStatName = skill => ({ str: 'strength', def: 'defense', rng: 'range', int: 'intelligence' })[skill];
