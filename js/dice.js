/* Drawing of d20 hexagons and 2d6 square dice, in the current palette. */

import { OUTCOME_COLOURS } from './config.js';
import { settings } from './state.js';
import { escapeHtml } from './escape.js';

// the fill colour for a die or card in its current outcome, following the chosen palette
export function outcomeFill(outcome) {
  const palette = OUTCOME_COLOURS[settings.palette] || OUTCOME_COLOURS.standard;
  return palette[outcome] || palette.pending;
}

// text colour that stays readable on each outcome fill
export const inkFor = outcome => (outcome === 'lose' ? '#ffffff' : '#111111');

// the d20 hexagon. Used for every d20 roll; grey until painted green or red.
// A failed roll gets a dashed inner outline so it reads without colour.
export function d20Svg(value, outcome = 'pending') {
  const points = '50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27';
  const innerOutline = outcome === 'lose'
    ? '<polygon points="50,14 83,31 83,69 50,86 17,69 17,31" fill="none" stroke="#111" stroke-width="2.5" stroke-dasharray="4 3"/>'
    : '';
  return `<svg class="d20" viewBox="0 0 100 100" aria-hidden="true" style="width:100%;height:100%;display:block;overflow:visible">
    <polygon points="${points}" fill="${outcomeFill(outcome)}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
    ${innerOutline}
    <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="${value >= 10 ? 30 : 36}" font-weight="900" fill="${inkFor(outcome)}">${escapeHtml(value)}</text>
  </svg>`;
}

// the 2d6 square die. Only barrier checks and movement use it; hatched when failed.
export function d6Html(value, outcome = 'pending') {
  const hatch = outcome === 'lose' ? 'hatch' : '';
  return `<div class="roll-die d6 ${hatch}" data-v="${escapeHtml(value)}" style="background-color:${outcomeFill(outcome)};color:${inkFor(outcome)}" aria-hidden="true">${escapeHtml(value)}</div>`;
}

// a d20 hexagon sized for a banner, with its own animation delay
export function d20BannerFace(value, delay, outcome) {
  return `<span class="die-d20" style="--d:${delay}s">${d20Svg(value, outcome)}</span>`;
}
