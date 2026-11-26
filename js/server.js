/* Every call from the page to the database. Other modules use these functions and never call
   the database directly. The server checks each action again; the page only sends requests. */

import { db } from './config.js';
import { state } from './state.js';
import { indexFromPage } from './escape.js';

// loads this player's private pool, hand and secret tile skills for the current room
export async function loadMyPrivateData() {
  const [mine, secrets] = await Promise.all([
    db.from('player_private').select('pool, hand').eq('room_code', state.room).eq('uid', state.me).maybeSingle(),
    db.from('tile_secrets').select('cube_key, skill').eq('room_code', state.room).eq('owner', state.me),
  ]);
  if (mine.error) console.error('private data failed to load:', mine.error.message);
  if (secrets.error) console.error('tile secrets failed to load:', secrets.error.message);
  if (mine.error || secrets.error) return;
  state.priv = {
    pool: mine.data?.pool || [],
    hand: mine.data?.hand || [],
    secretSkills: Object.fromEntries((secrets.data || []).map(row => [row.cube_key, row.skill])),
  };
}

// sends one action to the server; returns the server's reply and any error message
export async function submitAction(action) {
  const { setMessage } = await import('./state.js');
  setMessage('');
  const { SOUNDS } = await import('./audio.js');
  const { clearFlash } = await import('./board-draw.js');
  const { render } = await import('./render.js');
  clearFlash();
  SOUNDS.tick();
  const { data, error } = await db.rpc('submit_action', { p_room: state.room, p_action: action });
  const message = error ? error.message : '';
  if (message && !message.includes('DISCOVERY_CHOICE')) setMessage(message);
  render();
  return { data, message };
}

// starts the game (host only)
export async function startGame() {
  const { error } = await db.rpc('start_game', { p_room: state.room });
  return error ? error.message : '';
}

// creates a room with a server-made code
export async function createRoom() {
  const { data, error } = await db.rpc('create_room', { p_name: state.username });
  return { code: data, message: error ? error.message : '' };
}

// joins a room by its code
export async function joinRoom(code) {
  const { error } = await db.rpc('join_room', { p_room: code, p_name: state.username });
  return error ? error.message : '';
}

// the game state of a room, as a row from the rooms table
export async function fetchRoom(code) {
  const { data, error } = await db.from('rooms').select('*').eq('code', code).maybeSingle();
  return { row: data, message: error ? error.message : '' };
}

// the saved hero and object names of the signed-in player
export async function fetchSavedNames() {
  const { data, error } = await db.from('player_names').select('hero_names, object_names').eq('uid', state.me).maybeSingle();
  if (error) console.error('saved names failed to load:', error.message);
  return data || { hero_names: [], object_names: [] };
}

// saves the hero and object names for every future game
export async function saveLoadout(heroes, objects) {
  const { error } = await db.rpc('set_loadout', { p_heroes: heroes, p_objects: objects });
  return error ? error.message : '';
}

// the database schema version, to warn when the page and database disagree
export async function fetchSchemaVersion() {
  const { data, error } = await db.rpc('get_schema_version');
  return { version: error ? 'unknown' : String(data), failed: !!error };
}

// the presence of each player in the room, in seconds since they were last heard from
export async function sendHeartbeat() {
  const hb = await db.rpc('heartbeat', { p_room: state.room });
  if (hb.error) console.error('heartbeat failed:', hb.error.message);
  const status = await db.rpc('presence_status', { p_room: state.room });
  if (status.error) console.error('presence status failed:', status.error.message);
  else state.presenceSeen = { data: status.data || {}, at: Date.now() };
  const check = await db.rpc('apply_disconnects', { p_room: state.room });
  if (check.error) console.error('disconnect check failed:', check.error.message);
}

// the index a page value names, checked against the list it refers to (re-exported for input code)
export { indexFromPage };
