/* The board: tiles, heroes, objects and the Nuke, drawn as SVG each time the state changes.
   This module draws only. Input (clicks, drags, zoom) lives in input.js. */

import {
  HEX_RADIUS, NUKE_RADIUS, TIMING, TILE_COLORS, TERRAIN_PATTERN, HERO_COLORS, NEUTRAL_FILL,
  GROUND_ZERO_FILL, UNOWNED_STROKE, APOCALYPSE_RED, ROUND, RULES, SKILL_ICON,
} from './config.js';
import {
  TERRAIN_DEFS, tokenShape, hexX, hexY, hexPoints, nukePoint, cubeKey, cubeDistance, neighbours, sameTile,
} from './geometry.js';
import { state } from './state.js';
import { escapeHtml } from './escape.js';
import {
  tileAt, heroesAt, objectsAt, myIndex, actsForMe, canAct, canMindControl, reach, inRangeOf,
  selectedHero, actingUnit, barrierColor, knowsTileType, needsRemoval, currentRemovalOwner, objectCount,
  isLiveFlashKey as unitIsAlive,
} from './rules.js';
import { heroPosition, setViewBoxFor } from './board-position.js';
import { heroTooltip, objectTooltip, nukeTooltip, tileTooltip } from './tooltips.js';

// whether a tile can be chosen in the current mode (place, remove, develop, buy)
export function isValidTarget(cube) {
  const tile = tileAt(cube);
  const hero = selectedHero();
  const game = state.game;
  const mine = myIndex();
  switch (state.ui.mode) {
    case 'place':
      return game.round <= ROUND.placementEnds && !game.boardStepDone
        && game.players[game.current].poolCount > 0 && !tile
        && neighbours(cube).some(n => {
          const neighbour = tileAt(n);
          return !!neighbour && (neighbour.groundZero || neighbour.owner === game.current);
        });
    case 'remove':
      return needsRemoval() && !!tile && !tile.groundZero
        && tile.owner === currentRemovalOwner() && !heroesAt(cube).length;
    case 'develop':
      if (!tile || !hero || cubeDistance(hero.cube, cube) > 1) return false;
      if (state.ui.devType === 'barrier') return !game.apocalypse && !!tile.discovered;
      if (state.ui.devType === 'object') {
        return !game.apocalypse && !!tile.discovered && objectCount(game.current) < RULES.maxObjects;
      }
      return false;
    case 'obj':
      return !game.apocalypse && !!tile && !!tile.discovered && objectCount(mine) < RULES.maxObjects
        && game.heroes.some(h => h.alive && h.player === mine && sameTile(h.cube, cube));
    case 'barrier':
      return !game.apocalypse && !!tile && !!tile.discovered
        && game.heroes.some(h => h.alive && h.player === mine && cubeDistance(h.cube, cube) <= 1);
    case 'hero':
      return !!tile && !!tile.discovered
        && game.heroes.some(h => h.alive && h.player === mine && sameTile(h.cube, cube));
    default:
      return false;
  }
}

// the empty tiles next to the board where a new tile may be placed
export function placementCandidates() {
  const keys = new Set();
  Object.values(state.game.tiles).forEach(tile => {
    neighbours(tile.cube).forEach(n => { if (!tileAt(n)) keys.add(cubeKey(n)); });
  });
  return [...keys].map(key => key.split(',').map(Number)).filter(isValidTarget);
}

// which tiles the selected or hovered hero can move to, and which enemies it can attack
export function hintSets() {
  const empty = { moves: new Set(), attacks: new Set() };
  const game = state.game;
  if (!game || game.winner || state.ui.mode || state.ui.wheel || (state.pointer.drag && state.pointer.drag.moved)) {
    return empty;
  }
  const source = state.ui.selectedIndex != null
    ? selectedHero()
    : (state.hoverIndex != null ? game.heroes[state.hoverIndex] : null);
  if (!source || !source.alive || !actsForMe(source)) return empty;

  const moves = new Set();
  const attacks = new Set();
  if (canAct(source, 'move')) {
    const range = reach(source);
    Object.values(game.tiles).forEach(tile => {
      const distance = cubeDistance(source.cube, tile.cube);
      if (distance >= 1 && distance <= range) moves.add(cubeKey(tile.cube));
    });
  }
  game.heroes.forEach((hero, i) => {
    if (!hero.alive || hero.player === myIndex() || !inRangeOf(source, hero)) return;
    if (canAct(source, 'attack') || canMindControl(source, hero)) attacks.add(i);
  });
  return { moves, attacks };
}

// the symbol for each skill, drawn on a tile
const TILE_SYMBOL = { str: '✊', def: '🛡️', rng: '🏹', int: '🧠', bar: '🛑' };

// the SVG for one tile: its fill, terrain pattern, barrier glow and symbol
export function tileSvg(tile) {
  const cube = tile.cube;
  const key = cubeKey(cube);
  const seen = knowsTileType(tile, myIndex());
  const valid = isValidTarget(cube);
  const highlight = valid && ['develop', 'obj', 'barrier', 'hero'].includes(state.ui.mode);
  const removable = valid && state.ui.mode === 'remove';
  const hinted = state.currentHints.moves.has(key);
  const fill = tile.groundZero ? GROUND_ZERO_FILL : tile.discovered ? TILE_COLORS[tile.skill] : NEUTRAL_FILL;
  const stroke = tile.owner >= 0 ? state.playerColors[tile.owner] : UNOWNED_STROKE;
  const symbol = tile.groundZero ? '⬡' : !seen ? '?' : (TILE_SYMBOL[tile.skill] || '?');
  const label = tile.barrier && seen && tile.skill === 'bar' ? `🛑${tile.barrier}` : symbol;
  const classes = [highlight ? 'ok' : '', removable ? 'rm' : '', hinted ? 'hint' : ''].join(' ');
  state.tooltips['t' + key] = tileTooltip(tile);

  const texture = seen && tile.discovered && !tile.groundZero && TERRAIN_PATTERN[tile.skill]
    ? `<polygon class="tex" points="${hexPoints(cube)}" fill="url(#${TERRAIN_PATTERN[tile.skill]})"/>`
    : '';
  const glowColor = barrierColor(cube);
  const glow = tile.barrier > 0
    ? `<polygon class="barglow" points="${hexPoints(cube, HEX_RADIUS - 9)}" stroke="${glowColor}" style="filter:drop-shadow(0 0 1.5px ${glowColor})"/>`
    : '';
  const barrierTag = tile.barrier && !(seen && tile.skill === 'bar')
    ? `<text x="${hexX(cube) + HEX_RADIUS * 0.5}" y="${hexY(cube) + HEX_RADIUS * 0.6}" font-size="8" font-weight="bold" fill="#ffd54f" stroke="#000" stroke-width="1" paint-order="stroke">🛑${tile.barrier}</text>`
    : '';

  return `<polygon data-k="${key}" data-tip="t${key}" class="${classes}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" points="${hexPoints(cube)}"/>`
    + texture
    + glow
    + `<text x="${hexX(cube)}" y="${hexY(cube)}" font-size="${label.length > 2 ? 22 : 34}" fill="#fff">${escapeHtml(label)}</text>`
    + barrierTag;
}

// the purple line joining a controlled hero to the hero controlling it
export function chainSvg(controller, controlled) {
  const [x1, y1] = heroPosition(controller);
  const [x2, y2] = heroPosition(controlled);
  return `<line class="mc-chain" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

// whether an enemy hero is within reach of the hero being dragged
export function isEnemyInDragReach(hero) {
  const drag = state.pointer.drag;
  if (!drag || !drag.moved) return false;
  const dragged = state.game.heroes[drag.heroIndex];
  return hero.player !== myIndex() && cubeDistance(dragged.cube, hero.cube) <= reach(dragged);
}

// whether a unit can be chosen as the target of a skill point from Develop
export function isDevelopSkillTarget(unit) {
  const hero = selectedHero();
  return state.ui.mode === 'develop' && state.ui.devType === 'skill' && !!hero
    && actingUnit(unit) && cubeDistance(unit.cube, hero.cube) <= 1;
}

// the SVG for one hero: its shape, rings for its state, and its actions left
export function heroSvg(hero, index) {
  const [x, y] = heroPosition(hero);
  const actable = actsForMe(hero);
  const mindControlRing = hero.mindControl ? `<circle class="ring-mc" cx="${x}" cy="${y}" r="9"/>` : '';
  const marching = actable && hero.actions > 0 && !state.ui.mode && !state.pointer.drag
    ? `<circle class="ring-march" cx="${x}" cy="${y}" r="8"/>` : '';
  const attackRing = isEnemyInDragReach(hero) ? `<circle class="ring-atk" cx="${x}" cy="${y}" r="10"/>` : '';
  const hintRing = state.currentHints.attacks.has(index) ? `<circle class="ring-hint" cx="${x}" cy="${y}" r="11"/>` : '';
  const skillRing = isDevelopSkillTarget(hero) ? `<circle class="ring-selh" cx="${x}" cy="${y}" r="10"/>` : '';
  const flash = state.flashKeys.has('h' + index) && hero.alive
    ? `<circle class="ring-flash" cx="${x}" cy="${y}" r="12"/>` : '';
  const selected = state.ui.selectedIndex === index;
  const actionDots = actable
    ? `<text x="${x}" y="${y - 9}" font-size="6" fill="#ffe8a3" stroke="#000" stroke-width="1" paint-order="stroke">${'●'.repeat(hero.actions)}${'✕'.repeat(Math.max(0, 2 - hero.actions))}</text>`
    : '';
  const damage = hero.damage
    ? `<text x="${x + 8}" y="${y - 6}" font-size="7" font-weight="bold" fill="#ff5252">-${hero.damage}</text>` : '';
  const muted = state.ui.mode === 'develop' && state.ui.devType === 'skill' && !isDevelopSkillTarget(hero) ? 'mute' : '';
  state.tooltips['h' + index] = heroTooltip(hero);
  const token = tokenShape(hero.player, x, y, 6, HERO_COLORS[index % HERO_COLORS.length],
    state.playerColors[hero.player], selected ? 2.5 : 1.5);
  return `<g class="${muted}" data-hero="${index}" data-k="${cubeKey(hero.cube)}" data-tip="h${index}">`
    + token + mindControlRing + marching + attackRing + hintRing + skillRing + flash + actionDots + damage + `</g>`;
}

// the SVG for one object: a small square in its owner's colour with its defence value
export function objectSvg(obj, index) {
  const row = objectsAt(obj.cube).filter(o => !o.isNuke);
  const position = row.indexOf(obj);
  const x = hexX(obj.cube) + (position - (row.length - 1) / 2) * 15;
  const y = hexY(obj.cube) - 20;
  const ring = isDevelopSkillTarget(obj)
    ? `<rect class="ring-o" x="${x - 10}" y="${y - 10}" width="20" height="20" rx="4"/>` : '';
  const flash = state.flashKeys.has('o' + index) && obj.alive
    ? `<rect class="ring-flash" x="${x - 10}" y="${y - 10}" width="20" height="20" rx="4"/>` : '';
  const muted = state.ui.mode === 'develop' && state.ui.devType === 'skill' && !isDevelopSkillTarget(obj) ? 'mute' : '';
  state.tooltips['o' + index] = objectTooltip(obj);
  return `<g class="${muted}" data-obj="${index}" data-k="${cubeKey(obj.cube)}" data-tip="o${index}">`
    + `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="${state.playerColors[obj.player]}" stroke="#0e0e12" stroke-width="1"/>`
    + ring + flash
    + `<text x="${x}" y="${y - 1}" font-size="9">${escapeHtml(obj.symbol || '🧱')}</text>`
    + `<text x="${x + 5}" y="${y + 5}" font-size="5" font-weight="bold" fill="#fff" stroke="#000" stroke-width=".8" paint-order="stroke">${escapeHtml(obj.stats.defense)}</text>`
    + `</g>`;
}

// the SVG for the Nuke: a small glowing circle in the corner of its tile
export function nukeSvg(nuke) {
  const [x, y] = nukePoint(nuke.cube);
  state.tooltips.nuke = nukeTooltip(nuke);
  const ring = state.pointer.drag && state.pointer.drag.moved
    ? `<circle class="ring-nk" cx="${x}" cy="${y}" r="${NUKE_RADIUS + 3}"/>` : '';
  const shaking = Date.now() < state.nukeHitUntil ? ' nuke-hit' : '';
  return `<g class="nuke-g${shaking}" data-k="${cubeKey(nuke.cube)}" data-nuke="1" data-tip="nuke">`
    + `<circle cx="${x}" cy="${y}" r="13" fill="transparent"/>`
    + `<circle class="nuke-core" cx="${x}" cy="${y}" r="${NUKE_RADIUS}" fill="#2a0a0a" stroke="#ff3d3d" stroke-width="1.2"/>`
    + `<text x="${x}" y="${y}" font-size="8" fill="#ff3d3d">☢</text>`
    + ring + `</g>`;
}

// the large faded symbol behind the board during the Apocalypse
export function apocalypseSymbol() {
  const size = Math.round(11 * Math.sqrt(3) * HEX_RADIUS);
  return `<text x="0" y="0" font-size="${size}" fill="#ff6b6b" opacity=".4">☢</text>`;
}

// whether a highlighted unit is still alive, so flashes on the dead are dropped
export function isLiveFlashKey(key) {
  return unitIsAlive(key);
}

// highlights the units named by an event for a short time
export function flashUnits(units) {
  const next = new Set(state.flashKeys);
  units.forEach(unit => next.add((unit.kind === 'hero' ? 'h' : 'o') + unit.i));
  state.flashKeys = next;
  clearTimeout(state.flashTimer);
  state.flashTimer = setTimeout(clearFlash, TIMING.flashSafetyMs);
  drawBoard();
}

// removes every highlight from the board
export function clearFlash() {
  clearTimeout(state.flashTimer);
  if (state.flashKeys.size === 0) return;
  state.flashKeys = new Set();
  drawBoard();
}

// the tile under a point on the board, if any
export function tileUnderPoint(point) {
  const hit = Object.values(state.game.tiles).find(t =>
    Math.hypot(hexX(t.cube) - point.x, hexY(t.cube) - point.y) < HEX_RADIUS);
  return hit ? hit.cube : null;
}

// draws the dashed arrow shown while a hero is being dragged
export function drawDragLayer() {
  const layer = document.getElementById('dragLayer');
  const drag = state.pointer.drag;
  if (!state.game || !drag || !drag.moved || !drag.point) {
    layer.innerHTML = '';
    return;
  }
  setViewBoxFor(layer);
  const [hx, hy] = heroPosition(state.game.heroes[drag.heroIndex]);
  layer.innerHTML = '<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">'
    + '<path d="M0,0 L6,3 L0,6 z" fill="#ffe066"/></marker></defs>'
    + `<line x1="${hx}" y1="${hy}" x2="${drag.point.x}" y2="${drag.point.y}" stroke="#ffe066" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#arrow)"/>`;
}

// draws the whole board: tiles, chains, heroes, objects and the Nuke
export function drawBoard() {
  const svg = document.getElementById('svg');
  const game = state.game;
  state.tooltips = {};
  svg.style.background = game && game.apocalypse ? APOCALYPSE_RED : '';
  if (!game) {
    svg.innerHTML = '';
    state.currentHints = { moves: new Set(), attacks: new Set() };
    return;
  }
  state.flashKeys = new Set([...state.flashKeys].filter(isLiveFlashKey));
  state.currentHints = hintSets();
  setViewBoxFor(svg);

  let out = TERRAIN_DEFS;
  if (game.apocalypse) out += apocalypseSymbol();
  if (state.ui.mode === 'place') {
    placementCandidates().forEach(c => {
      out += `<polygon class="cand" data-k="${cubeKey(c)}" points="${hexPoints(c)}"/>`;
    });
  }
  Object.values(game.tiles).forEach(tile => { out += tileSvg(tile); });
  game.heroes.forEach(hero => {
    if (!hero.alive || !hero.mindControl) return;
    const controller = game.heroes[hero.mindControl.source];
    if (controller && controller.alive) out += chainSvg(controller, hero);
  });
  game.heroes.forEach((hero, i) => { if (hero.alive) out += heroSvg(hero, i); });
  game.objects.forEach((obj, i) => { if (obj.alive && !obj.isNuke) out += objectSvg(obj, i); });
  const nuke = game.objects.find(obj => obj.alive && obj.isNuke);
  if (nuke) out += nukeSvg(nuke);
  svg.innerHTML = out;
  drawDragLayer();
}
