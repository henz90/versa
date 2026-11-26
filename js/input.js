/* Input on the board and the Buy panel: taps, drags, pan, pinch, hover and wheel choices.
   Each gesture works out what the player meant, then calls the module that does it. */

import { NUKE_RADIUS } from './config.js';
import { state, setMessage } from './state.js';
import { indexFromPage, escapeHtml } from './escape.js';
import {
  heroesAt, nukeAt, myIndex, actsForMe, canAct, canHitNuke, boardStepDone, mustChoose,
  selectedHero, reach, unitRef, actingUnit, tileAt, isMyTurn, isControllingNow,
} from './rules.js';
import { cubeDistance, sameTile, keyToCube, nukePoint } from './geometry.js';
import { svgPoint } from './board-position.js';
import { tileUnderPoint, drawBoard, drawDragLayer, isValidTarget, clearFlash } from './board-draw.js';
import { el } from './dom.js';
import { onCardPointerDown, onCardPointerMove, onCardPointerUp } from './cards.js';
import {
  openAttackChoice, openTargetPick, moveTo, attackNukeWith, pickWheelItem,
  dismissMenus, controlledHeroItems, emojiItems, openPlacementWheel, handleDevelopClick,
  openWheel, developTypeItems, barrierBuyItems,
} from './wheel.js';
import { submitAction } from './server.js';
import { render } from './render.js';
import { pickBuy, explainBuyOption } from './buy.js';
import { onTouchDown, onTouchMove, onTouchUp, suppressClicksBriefly } from './zoom.js';

// the hero under a pointer press, with its index in the game's hero list, or null
function heroFromTarget(target) {
  const node = target.closest('[data-hero]');
  if (!node) return null;
  const index = indexFromPage(node.dataset.hero, state.game.heroes);
  return index === null ? null : { index, hero: state.game.heroes[index] };
}

// a press on a hero that can act starts a drag; anywhere else starts a pan of the board
export function onBoardPointerDown(event) {
  if (!state.game || state.game.winner || event.button !== 0) return;
  if (state.pointer.touches.size > 1) return;
  if (event.target.closest('[data-nuke]')) return;
  const found = heroFromTarget(event.target);
  const canDrag = found && !state.ui.mode && boardStepDone()
    && (canAct(found.hero, 'move') || canAct(found.hero, 'attack') || canHitNuke(found.hero));
  if (canDrag) {
    state.pointer.drag = {
      heroIndex: found.index, startX: event.clientX, startY: event.clientY,
      moved: false, point: null, hoverHero: null,
    };
  } else {
    state.pointer.pan = {
      startX: event.clientX, startY: event.clientY,
      startCx: state.view.cx, startCy: state.view.cy, moved: false,
    };
  }
}

// the label that follows the pointer while a hero is dragged
function updateDragLabel(event) {
  const label = el('carry');
  const drag = state.pointer.drag;
  const hero = state.game.heroes[drag.heroIndex];
  const target = drag.hoverHero;
  label.style.display = 'block';
  label.style.left = (event.clientX + 18) + 'px';
  label.style.top = (event.clientY + 18) + 'px';
  if (target) {
    const attackerName = escapeHtml(state.game.players[hero.player].name);
    const defenderName = escapeHtml(state.game.players[target.player].name);
    label.innerHTML = `⚔ ${attackerName}: STR ${hero.stats.strength} · INT ${hero.stats.intelligence}`
      + `<br>🛡 ${defenderName}: STR ${target.stats.strength} · DEF ${target.stats.defense} · INT ${target.stats.intelligence}`;
  } else {
    label.textContent = state.game.objects.some(o => o.alive && !o.isNuke && sameTile(o.cube, hero.cube))
      ? 'Objects here: choose which to take when you release'
      : 'Drop on a tile to move, or on an enemy hero to attack';
  }
}

// moves the board while panning, or the drag arrow while a hero is dragged
export function onBoardPointerMove(event) {
  if (onTouchMove(event)) return;
  if (state.pointer.card) return onCardPointerMove(event);
  const pan = state.pointer.pan;
  if (pan) {
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (!pan.moved && Math.hypot(dx, dy) < 5) return;
    pan.moved = true;
    const scale = el('svg').getBoundingClientRect().width / state.view.zoom;
    state.view.cx = pan.startCx - dx / scale;
    state.view.cy = pan.startCy - dy / scale;
    drawBoard();
    return;
  }
  const drag = state.pointer.drag;
  if (drag) {
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      drawBoard();
    }
    el('tip').style.display = 'none';
    drag.point = svgPoint(event.clientX, event.clientY);
    const cube = tileUnderPoint(drag.point);
    drag.hoverHero = cube ? heroesAt(cube).find(h => h.player !== myIndex()) || null : null;
    updateDragLabel(event);
    drawDragLayer();
  }
}

// decides what a dropped hero does: attack the Nuke, attack an enemy, or move
function handleDrop(index, point) {
  const hero = state.game.heroes[index];
  const cube = tileUnderPoint(point);
  if (!cube) return setMessage('Drop on a tile or an enemy hero to act');
  const nuke = nukeAt(cube);
  const [nukeX, nukeY] = nukePoint(cube);
  if (nuke && Math.hypot(nukeX - point.x, nukeY - point.y) < NUKE_RADIUS + 4) {
    if (canHitNuke(hero) && cubeDistance(hero.cube, cube) <= reach(hero)) attackNukeWith(index);
    else setMessage('Nuke attack needs range and an attack action left');
    return;
  }
  const enemies = state.game.heroes
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.alive && h.player !== myIndex() && sameTile(h.cube, cube))
    .map(({ i }) => i);
  if (enemies.length === 1) return openAttackChoice(index, enemies[0]);
  if (enemies.length > 1) return openTargetPick(index, cube, enemies);
  return moveTo(index, cube);
}

// ends a pan, a pinch, a card drag or a hero drag when the pointer lifts
export function onBoardPointerUp(event) {
  if (onTouchUp(event)) return;
  if (state.pointer.card) return onCardPointerUp(event);
  const pan = state.pointer.pan;
  if (pan) {
    if (pan.moved) suppressClicksBriefly();
    state.pointer.pan = null;
    return;
  }
  const drag = state.pointer.drag;
  if (drag) {
    state.pointer.drag = null;
    el('carry').style.display = 'none';
    drawDragLayer();
    if (!drag.moved) return;
    suppressClicksBriefly();
    handleDrop(drag.heroIndex, svgPoint(event.clientX, event.clientY));
    render();
  }
}

// a click on the board: a wheel choice first, then the current mode, then the tile or unit tapped
export function onBoardClick(event) {
  if (state.pointer.suppressClick || !state.game || state.game.winner) return;
  const node = event.target.closest('[data-k]');
  if (!node) {
    if (state.ui.wheel && !mustChoose(state.ui.wheel)) {
      dismissMenus();
      render();
    }
    return;
  }
  handleBoardClick(node.dataset.k, node.dataset.hero, node.dataset.obj, node.dataset.nuke === '1');
}

// routes one board click through the rules in order
function handleBoardClick(keyText, heroText, objectText, clickedNuke) {
  setMessage('');
  if (state.ui.wheel) {
    if (!mustChoose(state.ui.wheel)) dismissMenus();
    return render();
  }

  const cube = keyToCube(keyText);
  const heroIndex = heroText !== undefined ? indexFromPage(heroText, state.game.heroes) : null;
  const hero = heroIndex !== null ? state.game.heroes[heroIndex] : null;
  const objectIndex = objectText !== undefined ? indexFromPage(objectText, state.game.objects) : null;
  const object = objectIndex !== null ? state.game.objects[objectIndex] : null;
  const unit = hero || object;

  // your own hero under someone else's control: offer to cede it back
  if (hero && hero.player === myIndex() && hero.mindControl && !hero.mindControl.ceded && isMyTurn() && !state.ui.mode) {
    openWheel({
      cube: hero.cube, kind: 'cede', heroIndex,
      items: [{ v: 'cede', ic: '🤝', t: 'Cede to ' + state.game.players[hero.mindControl.by].name }],
    });
    return render();
  }

  // a hero you control: develop it, or skip its rest
  if (hero && hero.mindControl && actsForMe(hero) && !state.ui.mode) {
    openWheel({ cube: hero.cube, kind: 'controlled', heroIndex, items: controlledHeroItems() });
    return render();
  }

  // not your turn: a tap on your own hero opens the emoji menu
  if (!isMyTurn() && !isControllingNow()) {
    if (hero && hero.player === myIndex()) {
      openWheel({ cube: hero.cube, kind: 'emoji', heroIndex, items: emojiItems() });
    }
    return render();
  }

  if (clickedNuke && !state.ui.mode) {
    const attacker = selectedHero();
    if (attacker && canHitNuke(attacker) && cubeDistance(attacker.cube, cube) <= reach(attacker)) {
      attackNukeWith(state.ui.selectedIndex);
    }
    return render();
  }

  switch (state.ui.mode) {
    case 'obj':
      if (isValidTarget(cube)) { submitAction({ type: 'buy_object', cube }); state.ui.mode = ''; }
      else setMessage('Click a discovered tile with one of your heroes');
      return render();
    case 'barrier':
      if (!isValidTarget(cube)) {
        setMessage('Click a discovered tile next to one of your heroes');
      } else if (tileAt(cube).barrier > 0) {
        openWheel({ cube, kind: 'barrierBuy', items: barrierBuyItems(cube) });
      } else {
        submitAction({ type: 'buy_barrier', cube });
        state.ui.mode = '';
      }
      return render();
    case 'hero':
      if (isValidTarget(cube)) { submitAction({ type: 'buy_hero', cube }); state.ui.mode = ''; }
      else setMessage('Click a discovered tile with one of your heroes');
      return render();
    case 'buyskill':
      if (!unit || !actingUnit(unit)) {
        setMessage('Pick one of your own heroes or objects');
      } else {
        submitAction({ type: 'buy_skill', skill: state.ui.devSkill, unit: unitRef(unit) });
        state.ui.mode = '';
      }
      return render();
    case 'place':
      if (isValidTarget(cube)) openPlacementWheel(cube);
      return render();
    case 'remove':
      if (isValidTarget(cube)) submitAction({ type: 'remove_tile', cube });
      return render();
    case 'develop':
      handleDevelopClick(cube, unit);
      return;
    default:
      break;
  }

  // no mode: a tap on your own hero selects it and offers develop
  if (hero && actsForMe(hero)) {
    state.ui.selectedIndex = heroIndex;
    if (!canAct(hero, 'develop')) {
      setMessage(hero.actions < 1 ? 'No actions left for this hero this turn' : 'This hero cannot develop right now');
    } else {
      state.ui.mode = 'develop';
      state.ui.devType = null;
      openWheel({ cube: hero.cube, kind: 'developType', items: developTypeItems() });
    }
  }
  render();
}

// a press on the Buy panel: a greyed option explains itself, a live one is chosen
export function onBuySideClick(event) {
  const button = event.target.closest('[data-buy]');
  if (!button) return;
  if (button.classList.contains('is-off')) return explainBuyOption(button.dataset.reason);
  pickBuy(button.dataset.buy);
}

// a press on a wheel button: the choice it names
export function onWheelClick(event) {
  const button = event.target.closest('[data-w]');
  if (button && !button.disabled) pickWheelItem(button.dataset.w);
}

// hover: shows the tooltip under the pointer and highlights the hovered hero's reach
export function onBoardHover(event) {
  const heroNode = event.target.closest('[data-hero]');
  const index = heroNode ? indexFromPage(heroNode.dataset.hero, state.game.heroes) : null;
  if (index !== state.hoverIndex) {
    state.hoverIndex = index;
    drawBoard();
  }
  const node = event.target.closest('[data-tip]');
  const info = node && state.tooltips[node.dataset.tip];
  const tip = el('tip');
  if (!info || state.pointer.drag) {
    tip.style.display = 'none';
    return;
  }
  tip.className = 'kind-' + info.kind;
  tip.style.setProperty('--pc', info.color);
  tip.innerHTML = info.html;
  tip.style.display = 'block';
  tip.style.left = Math.min(event.clientX + 16, innerWidth - 300) + 'px';
  tip.style.top = (event.clientY + 16) + 'px';
}

// the pointer leaving the board: hides the tooltip and clears the hovered hero
export function onBoardLeave() {
  el('tip').style.display = 'none';
  if (state.hoverIndex !== null) {
    state.hoverIndex = null;
    drawBoard();
  }
}

// Escape: closes an open menu, or cancels the current mode
export function onEscape() {
  if (state.ui.wheel) dismissMenus();
  if (state.game) return cancelMode();
  return render();
}

import { cancelMode } from './actions.js';
