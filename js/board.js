/* The board: drawing the tiles, heroes and objects, and the pointer,
   touch and wheel input that moves and zooms it. */

import {
  HEX_RADIUS, NUKE_RADIUS, TIMING, TILE_COLORS, TERRAIN_PATTERN, HERO_COLORS, NEUTRAL_FILL,
  GROUND_ZERO_FILL, UNOWNED_STROKE, APOCALYPSE_RED, NUKE_OFFSET,
} from './config.js';
import { TERRAIN_DEFS, tokenShape, hexX, hexY, hexPoints, nukePoint, cubeKey, keyToCube, cubeDistance } from './geometry.js';
import { state, setMessage } from './state.js';
import { escapeHtml } from './escape.js';
import { indexFromPage } from './escape.js';
import {
  tileAt, heroesAt, objectsAt, nukeAt, myIndex, isMine, isMyTurn, isControllingNow, actsForMe,
  canAct, canHitNuke, canMindControl, reach, inRangeOf, selectedHero, actingUnit, boardStepDone,
  knowsTileType, barrierColor, heroIndex, heroLabel, heroName, isAlive, unitRef,
} from './rules.js';
import { heroPosition, setViewBoxFor } from './board-position.js';
import { attackNukeWith, openAttackChoice, openTargetPick, moveTo } from './wheel.js';
import { render, drawTooltipsOff } from './render.js';
import { clearFlash } from './banners.js';

// the placement, buy and develop modes highlight tiles that can take the next action
export function isValidTarget(cube) {
  const tile = tileAt(cube);
  const hero = selectedHero();
  switch (state.ui.mode) {
    case 'place':
      return state.game.round <= 5 && !state.game.boardStepDone && state.game.players[state.game.current].poolCount > 0 && !tile
        && neighbours(cube).some(n => { const t = tileAt(n); return t && (t.groundZero || t.owner === state.game.current); });
    case 'remove':
      return needsRemovalFor() && !!tile && !tile.groundZero && tile.owner === currentRemovalOwnerFor() && !heroesAt(cube).length;
    case 'develop':
      if (!tile || !hero || cubeDistance(hero.c, cube) > 1) return false;
      if (state.ui.devType === 'barrier') return !state.game.apocalypse && !!tile.discovered;
      if (state.ui.devType === 'object') return !state.game.apocalypse && !!tile.discovered && objectCountFor(state.game.current) < 3;
      return false;
    case 'obj':
      return !state.game.apocalypse && !!tile && !!tile.discovered && objectCountFor(myIndex()) < 3
        && state.game.heroes.some(h => h.alive && h.player === myIndex() && cubeKeyEquals(h.c, cube));
    case 'barrier':
      return !state.game.apocalypse && !!tile && !!tile.discovered
        && state.game.heroes.some(h => h.alive && h.player === myIndex() && cubeDistance(h.c, cube) <= 1);
    case 'hero':
      return !!tile && !!tile.discovered
        && state.game.heroes.some(h => h.alive && h.player === myIndex() && cubeKeyEquals(h.c, cube));
    default:
      return false;
  }
}
