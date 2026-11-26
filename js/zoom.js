/* Zoom limits and pinch gestures on the board. */

import { state } from './state.js';
import { drawBoard } from './board-draw.js';

// the closest and furthest zoom, in board units: closer on phones, wider on desktop
export const zoomMin = () => (window.matchMedia('(max-width: 700px)').matches ? 120 : 380);
export const zoomMax = () => (window.matchMedia('(max-width: 700px)').matches ? 4000 : 1800);

// keeps a zoom value between the limits
export const clampZoom = zoom => Math.max(zoomMin(), Math.min(zoomMax(), zoom));

// the distance between the two active touches, never less than one pixel
export function pinchDistance() {
  const [a, b] = [...state.pointer.touches.values()];
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

// stops a click that follows a gesture from also acting on the board
export function suppressClicksBriefly() {
  state.pointer.suppressClick = true;
  setTimeout(() => { state.pointer.suppressClick = false; }, 150);
}

// starts a pinch when a second finger touches the board
export function onTouchDown(event) {
  if (event.pointerType !== 'touch') return;
  state.pointer.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (state.pointer.touches.size === 2) {
    state.pointer.drag = null;
    state.pointer.pan = null;
    document.getElementById('carry').style.display = 'none';
    state.pointer.pinch = { startDistance: pinchDistance(), startZoom: state.view.zoom };
  }
}

// zooms while two fingers move; returns true when the move belonged to a pinch
export function onTouchMove(event) {
  if (!state.pointer.touches.has(event.pointerId)) return false;
  state.pointer.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const pinch = state.pointer.pinch;
  if (!pinch || state.pointer.touches.size < 2) return false;
  state.view.zoom = clampZoom(pinch.startZoom * pinch.startDistance / pinchDistance());
  drawBoard();
  return true;
}

// ends a pinch when a finger lifts; returns true when the lift belonged to a touch
export function onTouchUp(event) {
  if (!state.pointer.touches.has(event.pointerId)) return false;
  state.pointer.touches.delete(event.pointerId);
  if (!state.pointer.pinch) return false;
  if (state.pointer.touches.size < 2) {
    state.pointer.pinch = null;
    suppressClicksBriefly();
  }
  return true;
}

// zooms with the mouse wheel
export function onBoardWheel(event) {
  event.preventDefault();
  state.view.zoom = clampZoom(state.view.zoom * (event.deltaY > 0 ? 1.1 : 0.9));
  drawBoard();
}
