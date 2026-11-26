/* Emoji reactions: a bubble that floats above a hero when a player sends one. */

import { state } from './state.js';
import { screenPoint } from './board-position.js';
import { heroPosition } from './board-position.js';
import { el } from './dom.js';

// shows an emoji above the hero it was sent for, for a short time
export function showEmojiBubble({ uid, k, e }) {
  if (!state.game) return;
  const owner = state.game.players.findIndex(p => p.uid === uid);
  const hero = state.game.heroes.find(h => h.alive && h.player === owner && h.slot === k);
  if (owner < 0 || !hero) return;
  const [x, y] = screenPoint(...heroPosition(hero));
  const node = document.createElement('div');
  node.className = 'emo';
  node.textContent = e;
  node.style.left = x + 'px';
  node.style.top = (y - 24) + 'px';
  el('svgwrap').appendChild(node);
  setTimeout(() => node.remove(), 2300);
}
