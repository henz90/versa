/* Startup and wiring: connects every page event to its handler, signs in, checks the database
   version, loads saved names, rejoins a saved room, and opens the tutorial on first use. */

import { SETTINGS_KEY, EXPECTED_SCHEMA_VERSION, TUTORIAL_KEY, db } from './config.js';
import { state, settings } from './state.js';
import { el } from './dom.js';
import { isValidUsername } from './escape.js';
import { render } from './render.js';
import { applySettings } from './audio.js';
import { fetchSchemaVersion } from './server.js';
import {
  onCreateRoom, onJoinRoom, onStartGame, copyRoomCode, leaveRoom, loadSavedNames, onSaveLoadout,
  onLoadoutInput, onSaveUsername, onRename, onJoinFromField, enterRoom, toast,
} from './lobby.js';
import {
  onBoardPointerDown, onBoardPointerMove, onBoardPointerUp, onBoardClick, onBoardHover, onBoardLeave,
  onBuySideClick, onWheelClick,
} from './input.js';
import { onTouchDown, onBoardWheel } from './zoom.js';
import { onCardPointerDown } from './cards.js';
import { cancelMode } from './actions.js';
import {
  endTurnClick, toggleDrawer, showHand, showBuy, minimizeToggle, toggleMute, openLog, closeLog,
  reviewBoard, openHelp, openSettings, openLegend, leaveFromBar,
} from './buttons.js';
import {
  openOverlay, closeOverlay, handleOverlayClick, changeSetting,
} from './overlays.js';
import { placeFeedback } from './layout.js';

// the button actions reached by data-action attributes in the page
const ACTIONS = {
  'save-name': () => onSaveUsername(openOverlay),
  'rename': onRename,
  'create-room': onCreateRoom,
  'join-room': onJoinFromField,
  'copy-room': copyRoomCode,
  'save-loadout': onSaveLoadout,
  'start-game': onStartGame,
  'leave': leaveFromBar,
  'end-turn': endTurnClick,
  'cancel': cancelMode,
  'review-board': reviewBoard,
  'minimize': minimizeToggle,
  'drawer-hand': () => toggleDrawer('hand'),
  'drawer-buy': () => toggleDrawer('buy'),
  'toggle-mute': toggleMute,
  'open-help': openHelp,
  'open-legend': openLegend,
  'open-settings': openSettings,
  'open-log': openLog,
  'close-log': closeLog,
  'show-hand': showHand,
  'show-buy': showBuy,
};

// the one place page clicks on data-action buttons are routed
function onDocumentClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = ACTIONS[button.dataset.action];
  if (action) action();
}

// wires every page event to its handler; called once at startup
function wireEvents() {
  const svg = el('svg');
  svg.addEventListener('pointerdown', onTouchDown);
  svg.addEventListener('pointerdown', onBoardPointerDown);
  svg.addEventListener('click', onBoardClick);
  svg.addEventListener('pointermove', onBoardHover);
  svg.addEventListener('pointerleave', onBoardLeave);
  svg.addEventListener('wheel', onBoardWheel, { passive: false });

  window.addEventListener('pointermove', onBoardPointerMove);
  window.addEventListener('pointerup', onBoardPointerUp);
  window.addEventListener('pointercancel', onBoardPointerUp);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (state.overlay.kind) return closeOverlay();
    if (state.ui.logOpen) return closeLog();
    if (state.game) return cancelMode();
    return undefined;
  });
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', render);
  window.addEventListener('pointerdown', () => { import('./audio.js').then(m => m.audioContext()); }, { once: true });

  el('helpOverlay').addEventListener('click', handleOverlayClick);
  el('helpOverlay').addEventListener('input', event => {
    if (event.target.dataset.setting && event.target.type === 'range') changeSetting(event.target);
  });
  el('helpOverlay').addEventListener('change', event => {
    if (event.target.dataset.setting && event.target.type !== 'range') changeSetting(event.target);
  });

  el('wheel').addEventListener('click', onWheelClick);
  el('buyside').addEventListener('click', onBuySideClick);
  el('hand').addEventListener('pointerdown', onCardPointerDown);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('input', onLoadoutInput);
}

// checks that the database has the schema this page expects, and warns when it does not
async function checkDatabaseVersion() {
  const { version, failed } = await fetchSchemaVersion();
  state.dbVersion = version;
  const warning = el('dbWarn');
  if (failed || version !== EXPECTED_SCHEMA_VERSION) {
    warning.hidden = false;
    warning.textContent = failed
      ? 'Could not check the database version. Some features may fail.'
      : `Database is version ${version}; this app expects ${EXPECTED_SCHEMA_VERSION}. Run the newest files in sql/.`;
  }
}

// keeps the screen up to date with presence and offline warnings, once a second
function startTicker() {
  setInterval(async () => {
    if (!state.room || !state.game || state.game.winner) return;
    state.tick += 1;
    const { sendHeartbeat } = await import('./server.js');
    if (state.tick % 5 === 0) sendHeartbeat();
    else {
      const { updateOfflineBadges } = await import('./panels.js');
      updateOfflineBadges();
    }
  }, 1000);
}

// signs the player in anonymously, or reuses the session that is already there
async function signIn() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    state.me = session.user.id;
    return true;
  }
  const { data, error } = await db.auth.signInAnonymously();
  if (error) {
    toast('Sign-in failed: ' + error.message);
    return false;
  }
  state.me = data.user.id;
  return true;
}

// the first screen: wire, sign in, check the database, load names, rejoin, then tutorial
async function boot() {
  wireEvents();
  applySettings();
  if (!(await signIn())) return;
  checkDatabaseVersion();
  loadSavedNames();
  const savedRoom = localStorage.getItem('versa-room');
  if (savedRoom && isValidUsername(state.username)) enterRoom(savedRoom);
  if (isValidUsername(state.username) && !localStorage.getItem(TUTORIAL_KEY)) openOverlay('tutorial');
  render();
}

startTicker();
boot();
