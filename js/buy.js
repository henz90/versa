/* The Buy panel: choosing a structure or a skill, and the message shown for greyed-out options. */

import { state, setMessage } from './state.js';
import { closeWheel } from './wheel.js';
import { render } from './render.js';

// chooses a Buy option: switches the board into the matching mode, or toggles it off
export function pickBuy(key) {
  setMessage('');
  closeWheel();
  if (key === 'obj' || key === 'barrier' || key === 'hero') {
    state.ui.mode = state.ui.mode === key ? '' : key;
    state.ui.devType = null;
  } else if (key.startsWith('skill:')) {
    const skill = key.slice('skill:'.length);
    state.ui.mode = state.ui.mode === 'buyskill' && state.ui.devSkill === skill ? '' : 'buyskill';
    state.ui.devSkill = skill;
  }
  render();
}

// shows why a greyed-out Buy option cannot be used, instead of choosing it
export function explainBuyOption(reason) {
  setMessage(reason || '');
  render();
}
