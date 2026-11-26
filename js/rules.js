/* Rules the page uses to decide what to offer. These only decide what is shown
   and enabled; the server checks every action again before it is applied. */

import { ROUND, RULES, MUST_CHOOSE } from './config.js';
import { state } from './state.js';
import { cubeDistance, cubeKey, sameTile } from './geometry.js';

// the tile at a cube position, or undefined if none is there
export const tileAt = cube => state.game.tiles[cubeKey(cube)];

// heroes alive on a tile
export const heroesAt = cube => state.game.heroes.filter(hero => hero.alive && sameTile(hero.cube, cube));

// living objects on a tile (not the Nuke)
export const objectsAt = cube => state.game.objects.filter(obj => obj.alive && sameTile(obj.cube, cube));

// the Nuke on a tile, if there is one
export const nukeAt = cube => state.game.objects.find(obj => obj.alive && obj.isNuke && sameTile(obj.cube, cube));

// how many living objects a player owns (the Nuke is never counted)
export const objectCount = player => state.game.objects.filter(obj => obj.alive && !obj.isNuke && obj.player === player).length;

// how many living heroes a player has
export const heroCount = player => state.game.heroes.filter(hero => hero.alive && hero.player === player).length;

// whether a player still has any living hero
export const isAlive = player => state.game.heroes.some(hero => hero.alive && hero.player === player);

// the index of the signed-in player in the player list, or -1
export const myIndex = () => (state.game ? state.game.players.findIndex(p => p.uid === state.me) : -1);

// whether a unit (hero or object) belongs to the signed-in player
export const isMine = unit => unit.player === myIndex();

// whether it is the signed-in player's turn
export const isMyTurn = () => !!state.game && !state.game.winner && state.game.players[state.game.current]?.uid === state.me;

// whether the signed-in player has lost every hero
export const isDefeated = () => myIndex() >= 0 && !isAlive(myIndex());

// the hero the player selected, or null
export const selectedHero = () => (state.ui.selectedIndex == null ? null : state.game.heroes[state.ui.selectedIndex] || null);

// a hero's display name, falling back to H1, H2 and so on
export const heroName = hero => state.game.players[hero.player].heroNames?.[hero.slot - 1] || `H${hero.slot}`;

// player name and hero name, for tooltips and wheels
export const heroLabel = hero => `${state.game.players[hero.player].name} · ${heroName(hero)}`;

// a hero's position in the game's hero list
export const heroIndex = hero => state.game.heroes.indexOf(hero);

// a reference that identifies a hero or object in a request to the server
export const unitRef = unit => (state.game.heroes.includes(unit)
  ? { kind: 'h', i: state.game.heroes.indexOf(unit) }
  : { kind: 'o', i: state.game.objects.indexOf(unit) });

// the hero or object a reference points to
export const unitFromRef = ref => (ref.kind === 'h' ? state.game.heroes[ref.i] : state.game.objects[ref.i]);

// the objects a hero can carry: the ones on its tile
export const carryable = hero => objectsAt(hero.cube);

// the best Range a hero can use: its own plus the best object Range on its tile
export const maxRangeWith = (hero, objects) => hero.stats.range + Math.max(0, ...objects.map(obj => obj.stats.range || 0));
export const reach = hero => maxRangeWith(hero, carryable(hero));

// whether the signed-in player is controlling another player's hero right now
export const isControllingNow = () => !!state.game && !state.game.winner && state.game.current !== myIndex()
  && state.game.heroes.some(hero => hero.alive && hero.player === state.game.current
    && hero.mindControl && hero.mindControl.ceded && hero.mindControl.by === myIndex());

// whether the signed-in player may give orders to this hero now
export const actsForMe = hero => !!state.game && !state.game.winner && hero.alive && (
  (isMine(hero) && isMyTurn() && !hero.mindControl)
  || (!!hero.mindControl && hero.mindControl.ceded && hero.mindControl.by === myIndex() && hero.player === state.game.current));

// the attack or Mind Control already used this turn, if any (a hero may use one per turn)
export const combatLock = hero => (hero.tries.find(t => t.type === 'attack' || t.type === 'mind') || {}).type || null;

// the name of the current phase
export const phaseName = () => {
  const round = state.game.round;
  if (round <= 3) return 'Peace · Growth';
  if (round <= ROUND.placementEnds) return 'War · Growth';
  if (round === 6) return 'Stagnation';
  return 'Decline';
};

// whether a tile's type is known to the signed-in player
export const knowsTileType = (tile, mine) => !!tile.discovered || (tile.owner === mine && tile.skill != null);

// the colour of the barrier glow on a tile: the occupant's colour, or grey when empty
export const barrierColor = cube => {
  const hero = heroesAt(cube)[0];
  return hero ? state.playerColors[hero.player] : '#9a9a9a';
};

// whether an owner has a tile they may give up in the Decline phase
export const ownerHasRemovableTile = owner =>
  Object.values(state.game.tiles).some(tile => !tile.groundZero && tile.owner === owner && !heroesAt(tile.cube).length);

// the next player who still has a tile to give up
export const currentRemovalOwner = () => state.game.removalOrder.find(ownerHasRemovableTile);

// whether a Decline removal is still due this turn
export const needsRemoval = () => state.game.round >= ROUND.declineFrom && currentRemovalOwner() !== undefined;

// whether the current player still has a tile to place this turn
export const needsPlacement = () => state.game.round <= ROUND.placementEnds
  && state.game.players[state.game.current].poolCount > 0;

// whether the turn's board step (placing or removing a tile) is still due
export const needsBoardStep = () => (state.game.round <= ROUND.placementEnds ? needsPlacement() : needsRemoval());
export const boardStepDone = () => state.game.boardStepDone || !needsBoardStep();

// whether a hero may repeat an action type (a failed attempt may be retried)
export const canRepeat = (hero, type) => !hero.tries.some(t => t.type === type && !t.fail) || !!hero.repeatable[type];

// whether a hero may perform an action now
export const canAct = (hero, type) => actsForMe(hero) && boardStepDone()
  && hero.actions > 0 && canRepeat(hero, type) && (type !== 'attack' || state.game.round >= ROUND.attacksFrom);

// whether a hero may attack the Nuke now
export const canHitNuke = hero => actsForMe(hero) && boardStepDone() && hero.actions > 0;

// a hero under a Mind Control cooldown cannot be controlled again straight away
export const canBeMindControlled = target => target.alive
  && !(target.mindControlCooldown != null
    && (state.game.round === target.mindControlCooldown || state.game.round === target.mindControlCooldown + 1));

// whether one hero is within reach of another
export const inRangeOf = (attacker, target) => cubeDistance(attacker.cube, target.cube) <= reach(attacker);

// whether a hero may attempt Mind Control on a target now
export const canMindControl = (attacker, target) => actsForMe(attacker) && boardStepDone()
  && attacker.actions > 0 && state.game.round >= ROUND.attacksFrom && !state.game.apocalypse
  && canRepeat(attacker, 'mind') && inRangeOf(attacker, target)
  && target.player !== myIndex() && canBeMindControlled(target);

// whether a unit can be the target of a skill purchase or a skill point from develop
export const actingUnit = unit => ('slot' in unit ? actsForMe(unit) : isMine(unit));

// whether a wheel must be answered rather than closed
export const mustChoose = wheel => !!wheel && MUST_CHOOSE.includes(wheel.kind);

// whether a Decline removal is needed, and whether the turn can end
export const syncModeWithRules = () => {
  if (!state.game) return;
  if (!isMyTurn() || state.game.winner) {
    if (state.ui.mode === 'place' || state.ui.mode === 'remove') state.ui.mode = '';
    return;
  }
  if (!boardStepDone()) state.ui.mode = state.game.round <= ROUND.placementEnds ? 'place' : 'remove';
  else if (state.ui.mode === 'place' || state.ui.mode === 'remove') state.ui.mode = '';
};
