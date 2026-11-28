/* Button actions in the bottom bar: end turn, the phone drawers, mute, minimise, the log,
   the help and settings, and leaving a room. Each action changes state, then redraws. */

import { state, settings, setMessage } from './state.js';
import { saveSettings, SOUNDS } from './audio.js';
import { isMyTurn, boardStepDone, actsForMe } from './rules.js';
import { submitAction } from './server.js';
import { render } from './render.js';
import { leaveRoom } from './lobby.js';
import { openOverlay } from './overlays.js';

// the number of this player's heroes that still have an action this turn
function unusedActionCount() {
  return state.game.heroes.filter(h => h.alive && actsForMe(h) && h.actions > 0).length;
}

// ends the turn, after a confirmation if any hero still has actions left
export function endTurnClick() {
  if (!isMyTurn()) return;
  if (!boardStepDone()) {
    setMessage('Finish your board step first');
    return render();
  }
  const unused = unusedActionCount();
  if (unused > 0) {
    const plural = unused === 1 ? 'hero still has' : 'heroes still have';
    if (!window.confirm(`${unused} ${plural} actions left. End your turn anyway?`)) return undefined;
  }
  return submitAction({ type: 'end_turn' });
}

// opens the hand or buy drawer on a phone, or closes it if it is already open
export function toggleDrawer(tab) {
  state.ui.drawer = state.ui.drawer === tab ? null : tab;
  render();
}

// shows the full bottom bar on desktop, or hides it again
export function minimizeToggle() {
  state.ui.botMinimized = !state.ui.botMinimized;
  render();
}

// turns sound on or off, and plays a short click when turning it back on
export function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  if (!settings.muted) SOUNDS.tick();
  render();
}

// opens the game log
export function openLog() {
  state.ui.logOpen = true;
  render();
}

// closes the game log
export function closeLog() {
  state.ui.logOpen = false;
  render();
}

// the game-over screen's "review board" choice: keep the board, hide the dialog
export function reviewBoard() {
  state.ui.gameOverDismissed = true;
  render();
}

// shows the hand on a phone, or expands the bottom bar on desktop
export function showHand() {
  if (state.ui.drawer !== undefined && window.matchMedia('(max-width: 700px)').matches) toggleDrawer('hand');
  else { state.ui.botMinimized = false; render(); }
}

// shows the buy panel on a phone, or expands the bottom bar on desktop
export function showBuy() {
  if (window.matchMedia('(max-width: 700px)').matches) toggleDrawer('buy');
  else { state.ui.botMinimized = false; render(); }
}

// cancels the current mode, using the shared cancel in actions.js through the render path
export function cancelFromBar() {
  state.ui.mode = '';
  state.ui.wheel = null;
  setMessage('');
  render();
}

// leaves the room, through the lobby's confirmation and concede flow
export function leaveFromBar() {
  return leaveRoom();
}

// opens the help overlay (rules, symbols and the tutorial replay)
export function openHelp() {
  openOverlay('help');
}

// opens the settings overlay
export function openSettings() {
  openOverlay('settings');
}

// opens the legend overlay of symbols and terrain
export function openLegend() {
  openOverlay('legend');
}
