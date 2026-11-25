/* The client's state. One object holds everything the page knows, and modules
   read and update its properties. The server remains the authority on rules. */

import { DEFAULT_SETTINGS, PALETTES, SETTINGS_KEY } from './config.js';

// display settings the player chose, merged over the defaults
export const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };

export const state = {
  game: null,            // the room's game state from the server, with private cards merged in
  priv: null,            // this player's private pool, hand, and secret tile skills
  me: null,              // this player's user id
  room: null,            // the room code being played
  roomRow: null,         // the latest row from the rooms table (the lobby uses it)
  channel: null,         // the realtime channel for the room
  roomLoading: false,
  username: localStorage.getItem('versa-name') || '',
  playerColors: PALETTES.standard.players,
  dbVersion: 'unknown',

  view: { cx: 0, cy: 0, zoom: 900 },   // the board's centre and zoom, in board units
  pointer: {
    pan: null,           // a pan of the board in progress
    drag: null,          // a hero being dragged on the board
    card: null,          // a traversal card being dragged
    sellHint: null,      // the sale value shown while dragging a card over the Buy panel
    touches: new Map(),  // the active touch points, for pinch zoom
    pinch: null,         // a pinch gesture in progress
    suppressClick: false,
  },

  ui: {
    mode: '',            // what a tap on the board does: '', place, remove, develop, obj, barrier, hero, buyskill
    selectedIndex: null, // the hero the player selected
    devType: null,       // what a develop attempt raises: barrier, object or skill
    devSkill: 'str',
    wheel: null,         // the open wheel menu, if any
    carry: null,         // the objects a hero will carry on its next move
    message: '',         // the one-line message in the bottom bar
    drawer: null,        // the open phone drawer: hand or buy
    botMinimized: false,
    logOpen: false,
    gameOverDismissed: false,
  },

  flashKeys: new Set(),  // units to highlight after an event, as 'h3' or 'o1'
  flashTimer: null,
  bannerQueue: [],
  bannerBusy: false,
  nukeHitUntil: 0,
  hoverIndex: null,
  currentHints: { moves: new Set(), attacks: new Set() },
  tooltips: {},
  presenceSeen: { data: {}, at: 0 },
  tick: 0,
  lastAnimatedSeq: null,
  lastSeenSeq: 0,
  savedNames: null,
  loadoutDraft: null,
  overlay: { kind: null, step: 0, returnFocus: null },
  seenTodo: new Set(),
  pinchTimer: null,
};

// records a message for the bottom bar
export function setMessage(text) {
  state.ui.message = text;
}
