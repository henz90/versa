/* Traversal cards: dragging a card in the hand to sell it, use it on a unit, or play the 5 Versa card. */

import { CARD_SELL_VALUE, CARD_ICON, CARD_NAME } from './config.js';
import { state, setMessage } from './state.js';
import { el } from './dom.js';
import { indexFromPage } from './escape.js';
import { isMyTurn, myIndex } from './rules.js';
import { submitAction } from './server.js';
import { render } from './render.js';

// the unit (hero or object) under a drop, with its index checked against the game state
export function cardTargetUnit(target) {
  if (target.dataset.hero !== undefined) {
    const index = indexFromPage(target.dataset.hero, state.game.heroes);
    return index === null ? null : { kind: 'h', i: index };
  }
  const index = indexFromPage(target.dataset.obj, state.game.objects);
  return index === null ? null : { kind: 'o', i: index };
}

// starts dragging a card, if it is this player's turn and the card exists
export function onCardPointerDown(event) {
  if (!isMyTurn() || event.button !== 0) return;
  const cardEl = event.target.closest('.tcard');
  if (!cardEl) return;
  const cardIndex = indexFromPage(cardEl.dataset.card, state.priv ? state.priv.hand : []);
  if (cardIndex === null) return;
  state.pointer.card = { index: cardIndex, startX: event.clientX, startY: event.clientY, moved: false, ghost: null, node: cardEl };
}

// shows the card following the pointer, and the sell zone once the drag has begun
export function onCardPointerMove(event) {
  const card = state.pointer.card;
  if (!card.moved) {
    if (Math.hypot(event.clientX - card.startX, event.clientY - card.startY) < 6) return;
    card.moved = true;
    const name = state.priv.hand[card.index];
    card.node.classList.add('dragging-out');
    state.pointer.sellHint = CARD_SELL_VALUE[name] ?? 2;
    el('buycol').classList.add('dragging');
    updateSellZoneHook();
    card.ghost = document.createElement('div');
    card.ghost.className = 'ghostc';
    card.ghost.textContent = `${CARD_ICON[name]} ${CARD_NAME[name]}`;
    document.body.appendChild(card.ghost);
  }
  card.ghost.style.left = event.clientX + 'px';
  card.ghost.style.top = event.clientY + 'px';
}

// ends the drag: removes the ghost and the sell zone, then acts on what the card was dropped on
export function onCardPointerUp(event) {
  const finished = state.pointer.card;
  state.pointer.card = null;
  el('buycol').classList.remove('dragging');
  state.pointer.sellHint = null;
  updateSellZoneHook();
  if (finished.ghost) finished.ghost.remove();
  if (finished.node) finished.node.classList.remove('dragging-out');
  if (!finished.moved) return;

  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (under && el('hand').contains(under)) return;
  const card = state.priv.hand[finished.index];

  if (under && el('buycol').contains(under)) {
    return submitAction({ type: 'sell_card', index: finished.index + 1 });
  }

  const target = under?.closest('[data-hero],[data-obj]');
  if (target) {
    if (card === 'v') {
      setMessage('The 5V card is played on open board or sold in the Buy panel');
      return render();
    }
    const unit = cardTargetUnit(target);
    if (!unit) {
      setMessage('That is not one of the units you can use this card on');
      return render();
    }
    return submitAction({ type: 'apply_card', index: finished.index + 1, unit });
  }

  if (card === 'v' && under && el('svgwrap').contains(under)) {
    return submitAction({ type: 'play_versa', index: finished.index + 1 });
  }
  setMessage('Drop a card in the Buy panel to sell it, on a hero or object to use it, or the 5V card on the board to play it');
  render();
}

// the sell zone's text is updated in panels.js; imported late to keep the module graph acyclic at load time
import { updateSellZone } from './panels.js';
function updateSellZoneHook() {
  updateSellZone();
}

// whether the pointer belongs to this module's card drag
export const isCardDragging = () => !!state.pointer.card && state.pointer.card.moved;

// unused by callers, kept for clarity of the card index rule
export const handHasCard = index => !!myIndex() && index < (state.priv ? state.priv.hand.length : 0);
