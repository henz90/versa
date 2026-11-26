/* Input on the board and the Buy panel: taps, drags, pan, pinch, hover and the wheel.
   Each gesture works out what the player meant, then calls the module that does it. */

import { ROUND, TIMING, NUKE_RADIUS } from './config.js';
import { state, setMessage } from './state.js';
import { indexFromPage } from './escape.js';
import {
  heroesAt, nukeAt, myIndex, actsForMe, canAct, canHitNuke, heroIndex, boardStepDone,
  mustChoose, selectedHero, reach,
} from './rules.js';
import { cubeDistance, sameTile } from './geometry.js';
import { svgPoint } from './board-position.js';
import { nukePoint, keyToCube } from './geometry.js';
import { tileUnderPoint, drawBoard, drawDragLayer, isValidTarget, clearFlash } from './board-draw.js';
import { heroTooltip } from './tooltips.js';
import { el } from './dom.js';
import { onCardPointerDown, onCardPointerMove, onCardPointerUp } from './cards.js';
import {
  openAttackChoice, openTargetPick, moveTo, attackNukeWith, pickWheelItem,
  dismissMenus, controlledHeroItems, emojiItems, openPlacementWheel, handleDevelopClick,
  openWheel, closeWheel,
} from './wheel.js';
import { submitAction, sendEmojiToRoom } from './server.js';
import { render } from './render.js';
import { cancelMode } from './actions.js';
import { pickBuy, explainBuyOption } from './buy.js';
import { onTouchDown, onTouchMove, onTouchUp, suppressClicksBriefly, onBoardWheel } from './zoom.js';
import { unitRef, actingUnit } from './rules.js';

// the board's hero or object under a pointer press, if any
function heroFromEvent(target) {
  const node = target.closest('[data-hero]');
  if (!node) return null;
  const index = indexFromPage(node.dataset.hero, state.game.heroes);
  return index === null ? null : { index, hero: state.game.heroes[index] };
}

// a press on a hero starts a drag when the hero can act; anywhere else starts a pan of the board
export function onBoardPointerDown(event) {
  if (!state.game || state.game.winner || event.button !== 0) return;
  if (state.pointer.touches.size > 1) return;
  if (event.target.closest('[data-nuke]')) return;
  const found = heroFromEvent(event.target);
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

// moves the board while panning, or the dragged hero's arrow while dragging
export function onPointerMove(event) {
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

// ends a pan, a pinch, a card drag or a hero drag when the pointer lifts
export function onPointerUp(event) {
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
    label.innerHTML = `⚔ ${escapeLabel(hero)}: STR ${hero.stats.strength} · INT ${hero.stats.intelligence}`
      + `<br>🛡 ${escapeLabel(target)}: STR ${target.stats.strength} · DEF ${target.stats.defense} · INT ${target.stats.intelligence}`;
  } else {
    label.textContent = state.game.objects.some(o => o.alive && !o.isNuke && sameTile(o.cube, hero.cube))
      ? 'Objects here: choose which to take when you release'
      : 'Drop on a tile to move, or on an enemy hero to attack';
  }
}

// the escaped name of a hero, for the drag label
import { escapeHtml } from './escape.js';
function escapeLabel(hero) {
  return escapeHtml(state.game.players[hero.player].name + ' · ' + (state.game.players[hero.player].heroNames?.[hero.slot - 1] || 'H' + hero.slot));
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

// a click on the board: a wheel choice, a mode action, a tile, a hero or the Nuke
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

// routes one board click: controlled heroes, opponents' turns, modes, then selecting a hero
function handleBoardClick(keyText, heroText, objectText, clickedNuke) {
  setMessage('');
  if (state.ui.wheel) {
    if (!mustChoose(state.ui.wheel)) dismissMenus();
    return render();
  }

  const cube = keyToCube(keyText);
  const heroPosition = heroText !== undefined ? indexFromPage(heroText, state.game.heroes) : null;
  const hero = heroPosition !== null ? state.game.heroes[heroPosition] : null;
  const objectPosition = objectText !== undefined ? indexFromPage(objectText, state.game.objects) : null;
  const object = objectPosition !== null ? state.game.objects[objectPosition] : null;
  const unit = hero || object;

  // a hero under Mind Control that is yours: offer to cede it back
  if (hero && hero.player === myIndex() && hero.mindControl && !hero.mindControl.ceded && isMyTurnNow() && !state.ui.mode) {
    openWheel({
      cube: hero.cube, kind: 'cede', heroIndex: heroPosition,
      items: [{ v: 'cede', ic: '🤝', t: 'Cede to ' + state.game.players[hero.mindControl.by].name }],
    });
    return render();
  }

  // a hero you control: develop it, or skip its rest
  if (hero && hero.mindControl && actsForMe(hero) && !state.ui.mode) {
    openWheel({ cube: hero.cube, kind: 'controlled', heroIndex: heroPosition, items: controlledHeroItems() });
    return render();
  }

  // not your turn: a tap on your own hero opens the emoji menu
  if (!isMyTurnNow() && !isControllingNowNow()) {
    if (hero && hero.player === myIndex()) {
      openWheel({ cube: hero.cube, kind: 'emoji', heroIndex: heroPosition, items: emojiItems() });
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
      } else if (tileAt2(cube).barrier > 0) {
        openWheel({ cube, kind: 'barrierBuy', items: barrierBuyItems2(cube) });
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
      if (!unit || !actingUnit(unit)) setMessage('Pick one of your own heroes or objects');
      else { submitAction({ type: 'buy_skill', skill: state.ui.devSkill, unit: unitRef(unit) }); state.ui.mode = ''; }
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
    state.ui.selectedIndex = heroPosition;
    if (!canAct(hero, 'develop')) {
      setMessage(hero.actions < 1 ? 'No actions left for this hero this turn' : 'This hero cannot develop right now');
    } else {
      state.ui.mode = 'develop';
      state.ui.devType = null;
      openWheel({ cube: hero.cube, kind: 'developType', items: developTypeOptions() });
    }
  }
  render();
}

// the develop menu's choices, from the rules module's list (kept here so input does not import wheel's internals)
import { developTypeItems as developTypeOptions } from './wheel.js';
import { barrierBuyItems as barrierBuyItems2 } from './wheel.js';
import { tileAt as tileAt2, isMyTurn as isMyTurnNow, isControllingNow as isControllingNowNow } from './rules.js';

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

// the hover handler: shows the tooltip for the item under the pointer and lifts the hovered hero's highlights
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

// the hover handler's exit: hides the tooltip and clears the hovered hero
export function onBoardLeave() {
  el('tip').style.display = 'none';
  if (state.hoverIndex !== null) {
    state.hoverIndex = null;
    drawBoard();
  }
}

// the hero tooltip helper, exported so the lobby can use the same format if needed
export { heroTooltip, onBoardWheel, closeWheel, heroIndex, ROUND, TIMING, clearFlash };
