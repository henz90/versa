/* The one place that redraws the whole page. Every module that changes state calls render()
   instead of drawing panels itself. */

import { state } from './state.js';
import { syncModeWithRules, isMyTurn, isControllingNow, isDefeated } from './rules.js';
import { drawBoard } from './board-draw.js';
import {
  drawTop, drawHand, drawBuySide, drawBottomBar, drawWheel, drawCancel, drawTodo, drawModal,
} from './panels.js';
import { placeFeedback, maybePinchHint } from './layout.js';
import { el } from './dom.js';

// hides the panels that only appear during a game
function clearGamePanels() {
  el('wheel').style.display = 'none';
  el('cx').style.display = 'none';
  el('defeated').style.display = 'none';
  ['top', 'hand', 'todo'].forEach(id => { el(id).innerHTML = ''; });
}

// redraws everything that depends on the state, then the layout
export function render() {
  syncModeWithRules();
  drawBoard();
  if (state.game) {
    drawTop();
    drawHand();
    drawBuySide();
    drawWheel();
    drawCancel();
    drawTodo();
  } else {
    clearGamePanels();
  }
  drawBottomBar();
  document.documentElement.style.setProperty('--top-h', el('top').offsetHeight + 'px');
  document.documentElement.style.setProperty('--bottom-h', el('bottom').offsetHeight + 'px');
  drawModal();
  placeFeedback();
  maybePinchHint();
  document.body.classList.toggle('wait', (!!state.game && !isMyTurn() && !isControllingNow()) || isDefeated());
}
