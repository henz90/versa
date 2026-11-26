/* The lobby: names, creating and joining rooms, starting a game, and the realtime link to a room. */

import { LOADOUT_NAME_PATTERN, TIMING, USERNAME_PATTERN } from './config.js';
import { state } from './state.js';
import { isValidUsername } from './escape.js';
import { el } from './dom.js';
import { render } from './render.js';
import { db } from './config.js';
import {
  loadMyPrivateData, createRoom, joinRoom, startGame, fetchRoom, fetchSavedNames, saveLoadout,
  sendEmojiToRoom, submitAction,
} from './server.js';
import { applyRemoteState } from './sync.js';
import { showEmojiBubble } from './emoji.js';
import { padLoadout, nameFields } from './panels.js';

// shows a short message that fades away, in the notification area
export function toast(message) {
  const node = document.createElement('div');
  node.className = 'fx';
  node.textContent = message;
  el('fx').appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

// listens for changes to this room's row and for emoji sent by other players
export function openRoomChannel(code) {
  if (state.channel) db.removeChannel(state.channel);
  state.channel = db.channel('room-' + code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'code=eq.' + code },
      payload => onRoomUpdate(payload.new))
    .on('broadcast', { event: 'emoji' }, ({ payload }) => showEmojiBubble(payload))
    .subscribe();
}

// the room row changed: keep the lobby row, and apply the game state when it is newer
export function onRoomUpdate(row) {
  state.roomRow = row;
  if (!row.state) {
    state.game = null;
    render();
    return;
  }
  if (state.game && row.state.sequence <= (state.game.sequence || 0)) return;
  loadMyPrivateData().then(() => applyRemoteState(row.state));
}

// joins the room in the URL-free way: stores the code, subscribes, and loads its row
export async function enterRoom(code) {
  state.roomLoading = true;
  state.room = code;
  state.ui.gameOverDismissed = false;
  localStorage.setItem('versa-room', code);
  render();
  openRoomChannel(code);
  const { row, message } = await fetchRoom(code);
  if (message || !row) {
    toast('Room not found');
    return leaveRoom();
  }
  state.roomLoading = false;
  onRoomUpdate(row);
}

// creates a room on the server, then enters it
export async function onCreateRoom() {
  const { code, message } = await createRoom();
  if (message) return toast(message);
  enterRoom(code);
}

// joins a room by its code, then enters it
export async function onJoinRoom(code) {
  const message = await joinRoom(code);
  if (message) return toast(message);
  enterRoom(code);
}

// starts the game (host only); the server checks the player count and host
export async function onStartGame() {
  const message = await startGame();
  if (message) toast(message);
}

// copies the room code to the clipboard, falling back to a hidden text box
export async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(state.room);
  } catch (error) {
    const field = document.createElement('textarea');
    field.value = state.room;
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  toast(`Room code ${state.room} copied`);
}

// leaves the room: a player still in a game concedes first, after confirmation
export async function leaveRoom() {
  const game = state.game;
  if (game && !game.winner && state.room) {
    const ok = confirm('Concede this game? Your heroes and objects will be removed, and you cannot rejoin.');
    if (!ok) return render();
    await submitAction({ type: 'concede' });
  }
  if (state.channel) db.removeChannel(state.channel);
  state.channel = null;
  state.room = null;
  state.roomRow = null;
  state.game = null;
  state.priv = null;
  state.roomLoading = false;
  state.presenceSeen = { data: {}, at: 0 };
  state.ui.gameOverDismissed = false;
  state.ui.logOpen = false;
  state.lastSeenSequence = 0;
  state.bannerQueue = [];
  localStorage.removeItem('versa-room');
  render();
}

// loads the saved names for the signed-in player, then redraws the lobby
export async function loadSavedNames() {
  state.savedNames = await fetchSavedNames();
  state.loadoutDraft = null;
  render();
}

// saves the name fields: each name must match the allowed pattern
export async function onSaveLoadout() {
  if (!state.loadoutDraft) return;
  const heroes = state.loadoutDraft.heroes.map(name => name.trim());
  const objects = state.loadoutDraft.objects.map(name => name.trim());
  if ([...heroes, ...objects].some(name => !LOADOUT_NAME_PATTERN.test(name))) {
    return toast('Names use letters, numbers and spaces, up to 12');
  }
  const message = await saveLoadout(heroes, objects);
  if (message) return toast(message);
  state.savedNames = { hero_names: heroes, object_names: objects };
  toast('Names saved for every game');
}

// the field values typed into the name inputs, kept in the draft
export function onLoadoutInput(event) {
  const { loadout, slot } = event.target.dataset;
  if (loadout && state.loadoutDraft) state.loadoutDraft[loadout][Number(slot)] = event.target.value;
}

// saves the username typed on the first screen, then opens the tutorial the first time
export function onSaveUsername(overlayOpen) {
  const name = (el('nameIn')?.value || '').trim();
  if (!isValidUsername(name)) return toast('Use 2 to 16 letters or numbers');
  state.username = name;
  localStorage.setItem('versa-name', name);
  render();
  if (!localStorage.getItem(TIMING_TUTORIAL_KEY_NAME())) overlayOpen('tutorial');
}

// the tutorial key, read here to avoid a second import of config for one name
import { TUTORIAL_KEY } from './config.js';
function TIMING_TUTORIAL_KEY_NAME() {
  return TUTORIAL_KEY;
}

// clears the saved username so the player can choose another
export function onRename() {
  state.username = '';
  localStorage.removeItem('versa-name');
  render();
}

// reads the room code field, uppercases it, and joins
export function onJoinFromField() {
  const code = (el('codeIn')?.value || '').trim().toUpperCase();
  if (code) onJoinRoom(code);
}
