/* The one place that redraws the whole page. Other modules call render()
   rather than importing each panel, which avoids circular imports. */

import { state } from './state.js';
import { syncModeWithRules } from './rules.js';
import { drawBoard } from './board.js';
import { drawTop, drawHand, drawBuySide, drawBottomBar, drawWheel, drawCancel, drawTodo, drawModal } from './panels.js';
import { placeFeedback, maybePinchHint } from './layout.js';

// redraws everything that depends on the game state, then the layout
export function render() {
  if (state.game) syncModeWithRules();
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
  document.documentElement.style.setProperty('--top-h', document.getElementById('top').offsetHeight + 'px');
  document.documentElement.style.setProperty('--bottom-h', document.getElementById('bottom').offsetHeight + 'px');
  drawModal();
  placeFeedback();
  maybePinchHint();
  document.body.classList.toggle('wait', (!!state.game && !isWaiting()) || isDefeatedNow());
}

// empties the panels that only show during a game
function clearGamePanels() {
  document.getElementById('wheel').style.display = 'none';
  document.getElementById('cx').style.display = 'none';
  document.getElementById('defeated').style.display = 'none';
  ['top', 'hand', 'todo'].forEach(id => { document.getElementById(id).innerHTML = ''; });
}

// whether the player must wait for someone else's turn (used to dim the controls)
function isWaiting() {
  return state.game.current !== undefined && state.game.players[state.game.current].uid !== state.me && !isControllingNowFromRules();
}

// imported late so render.js itself has no import cycle with rules.js
import { isControllingNow as isControllingNowFromRules, isDefeated as isDefeatedNow } from './rules.js';
