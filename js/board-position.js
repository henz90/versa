/* Screen positions of heroes on the board, and the board's view box.
   Kept separate so the board and the banners can both use them without importing each other. */

import { hexX, hexY } from './geometry.js';
import { heroesAt } from './rules.js';
import { state } from './state.js';

// where a hero is drawn: its tile's centre, offset when more than one hero shares the tile
export function heroPosition(hero) {
  const here = heroesAt(hero.cube);
  const index = here.indexOf(hero);
  const count = here.length;
  return [hexX(hero.cube) + (index - (count - 1) / 2) * 13, hexY(hero.cube) + 10];
}

// sets the SVG's visible area from the current zoom and centre
export function setViewBoxFor(svg) {
  const rect = svg.getBoundingClientRect();
  const aspect = rect.width ? rect.height / rect.width : 0.6;
  const height = state.view.zoom * aspect;
  svg.setAttribute('viewBox', `${state.view.cx - state.view.zoom / 2} ${state.view.cy - height / 2} ${state.view.zoom} ${height}`);
}

// converts a point on the screen to a point on the board
export function svgPoint(x, y) {
  const svg = document.getElementById('svg');
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

// converts a point on the board to a point inside the board's wrapper on screen
export function screenPoint(x, y) {
  const svg = document.getElementById('svg');
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const matrix = point.matrixTransform(svg.getScreenCTM());
  const wrapper = document.getElementById('svgwrap').getBoundingClientRect();
  return [matrix.x - wrapper.left, matrix.y - wrapper.top];
}
