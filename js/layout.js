/* Layout: where the banners, roll cards, chips and cancel button sit on each screen shape. */

import { PINCH_KEY, TIMING } from './config.js';
import { state } from './state.js';
import { el } from './dom.js';

// the layout for the current screen: a phone held sideways, a phone held upright, or a desktop
export function layoutMode() {
  if (window.matchMedia('(orientation: landscape) and (max-height: 540px)').matches) return 'phone-landscape';
  if (window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches) return 'phone-portrait';
  return 'desktop';
}

// positions the floating panels (banners, rolls, chips, cancel) for the current layout
export function placeFeedback() {
  const mode = layoutMode();
  const fx = el('fx');
  const rolls = el('rollStage');
  const chips = el('sideStack');
  const cancel = el('cx');
  [fx, rolls, chips, cancel].forEach(node => {
    Object.assign(node.style, {
      left: '', right: '', top: '', bottom: '', width: '', maxWidth: '',
      transform: '', justifyContent: '', alignItems: '',
    });
  });

  if (mode === 'phone-portrait') {
    Object.assign(fx.style, { left: '.5em', right: '.5em', top: 'calc(var(--top-h) + .4em)', transform: 'none', alignItems: 'stretch' });
    Object.assign(rolls.style, { left: '3.6em', right: '.5em', bottom: 'calc(var(--bottom-h) + .5em)', top: 'auto', transform: 'none', justifyContent: 'center' });
    Object.assign(chips.style, { left: '.5em', right: '.5em', top: 'calc(var(--top-h) + 6em)', bottom: 'auto', maxWidth: 'none' });
    Object.assign(cancel.style, { left: '.5em', top: 'auto', bottom: 'calc(var(--bottom-h) + .5em)' });
    return;
  }

  if (mode === 'phone-landscape') {
    Object.assign(fx.style, { left: '.5em', right: 'auto', top: 'calc(var(--top-h) + 6em)', width: '38%', maxWidth: '38%', transform: 'none', alignItems: 'stretch' });
    Object.assign(rolls.style, { left: '.5em', right: 'auto', top: 'calc(var(--top-h) + .5em)', width: '38%', maxWidth: '38%', transform: 'none', justifyContent: 'flex-start' });
    Object.assign(chips.style, { left: 'auto', right: '.5em', bottom: '.5em', top: 'auto', maxWidth: '38%' });
    Object.assign(cancel.style, { left: 'calc(38% + 1em)', top: 'calc(var(--top-h) + .5em)' });
    return;
  }

  const width = 'clamp(220px, 24vw, 320px)';
  Object.assign(fx.style, { left: '.5em', right: 'auto', top: 'calc(var(--top-h) + 9em)', width, maxWidth: width, transform: 'none', alignItems: 'stretch' });
  Object.assign(rolls.style, { left: '.5em', right: 'auto', top: 'calc(var(--top-h) + .5em)', width, maxWidth: width, transform: 'none', justifyContent: 'flex-start' });
  Object.assign(chips.style, { left: '.5em', right: 'auto', bottom: 'calc(var(--bottom-h) + .5em)', top: 'auto', maxWidth: width });
  Object.assign(cancel.style, { left: `calc(${width} + 1.5em)`, top: 'calc(var(--top-h) + .5em)' });
}

// shows a one-time hint about pinch and pan on touch screens
export function showPinchHint() {
  if (el('pinchHint')) return;
  const node = document.createElement('div');
  node.id = 'pinchHint';
  node.className = 'pinch-hint';
  node.setAttribute('role', 'status');
  node.innerHTML = '<b>Pinch</b> to zoom · <b>two fingers</b> to pan<br><small>Tap to dismiss</small>';
  const dismiss = () => {
    localStorage.setItem(PINCH_KEY, '1');
    clearTimeout(state.pinchTimer);
    node.remove();
  };
  node.addEventListener('click', dismiss);
  document.body.appendChild(node);
  state.pinchTimer = setTimeout(dismiss, TIMING.pinchHintMs);
}

// shows the pinch hint once, on a touch layout, during a game
export function maybePinchHint() {
  const touch = layoutMode() === 'phone-portrait' || layoutMode() === 'phone-landscape';
  if (!state.game || !touch || localStorage.getItem(PINCH_KEY)) return;
  showPinchHint();
}
