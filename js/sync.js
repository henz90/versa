/* Applies a new game state from the server: merges in the private cards, keeps the board
   and banners in step, and shows a recap when updates were missed. */

import { TIMING } from './config.js';
import { state } from './state.js';
import { cubeKey } from './geometry.js';
import { render } from './render.js';
import { enqueueEvents, showRecap, playApocalypseAnimation } from './banners.js';

// merges a new game state with this player's private cards and secret tile skills, then shows it
export function applyRemoteState(serverState) {
  if (state.game && serverState.sequence <= (state.game.sequence || 0)) return;
  const hadGame = !!state.game;
  const wasApocalypse = hadGame && !!state.game.apocalypse;
  const oldNuke = hadGame ? state.game.objects.find(o => o.isNuke) : null;
  const priv = state.priv || { pool: [], hand: [], secretSkills: {} };
  const me = serverState.players.findIndex(p => p.uid === state.me);

  state.game = {
    ...serverState,
    players: serverState.players.map((p, i) => ({
      ...p,
      pool: i === me ? priv.pool : Array(p.poolCount).fill('?'),
      hand: i === me ? priv.hand : Array(p.handCount).fill('?'),
    })),
  };

  // this player's own face-down tiles show their true skill
  Object.values(state.game.tiles).forEach(tile => {
    const key = cubeKey(tile.cube);
    if (tile.owner === me && !tile.discovered && priv.secretSkills[key]) tile.skill = priv.secretSkills[key];
  });

  const newNuke = state.game.objects.find(o => o.isNuke);
  if (oldNuke && newNuke && newNuke.damage > oldNuke.damage) {
    state.nukeHitUntil = Date.now() + TIMING.nukeShakeMs;
    setTimeout(render, TIMING.nukeShakeMs + 20);
  }

  const gap = hadGame && serverState.sequence > state.lastSeenSequence + 1;
  if ((!hadGame || gap) && state.game.events && state.game.events.length) {
    showRecap(state.game.events, hadGame ? 'Missed updates' : 'Last action');
  }
  state.lastSeenSequence = serverState.sequence;

  if (hadGame && serverState.sequence !== state.lastAnimatedSequence && state.game.events
      && state.game.events.length && !gap) {
    state.lastAnimatedSequence = serverState.sequence;
    enqueueEvents(state.game.events);
  } else if (!hadGame) {
    state.lastAnimatedSequence = serverState.sequence;
  }

  if (hadGame && !wasApocalypse && state.game.apocalypse) playApocalypseAnimation();
  render();
}
