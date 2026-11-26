/* Hex-grid maths and the shapes drawn on the board. Pure functions: no game state is read. */

import { DIRECTIONS, HEX_RADIUS, NUKE_OFFSET } from './config.js';

// a tile's identifier as a string, from its cube coordinates
export const cubeKey = cube => cube.join(',');
export const keyToCube = key => key.split(',').map(Number);
export const sameTile = (a, b) => cubeKey(a) === cubeKey(b);

// the number of steps between two tiles
export const cubeDistance = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 2;

// the six tiles that touch a tile
export const neighbours = cube => DIRECTIONS.map(d => [cube[0] + d[0], cube[1] + d[1], cube[2] + d[2]]);

// screen position of a tile's centre, in board units
export const hexX = cube => Math.sqrt(3) * HEX_RADIUS * (cube[0] + cube[2] / 2);
export const hexY = cube => 1.5 * HEX_RADIUS * cube[2];

// the Nuke sits in the corner of its tile, so it can be told apart from the tile's own symbol
export const nukePoint = cube => [hexX(cube) - NUKE_OFFSET, hexY(cube) + NUKE_OFFSET];

// the corner points of a hexagon, for drawing a tile
export function hexPoints(cube, radius = HEX_RADIUS - 4) {
  return [0, 1, 2, 3, 4, 5].map(i => {
    const angle = Math.PI / 3 * i + Math.PI / 6;
    return (hexX(cube) + radius * Math.cos(angle)).toFixed(1) + ',' + (hexY(cube) + radius * Math.sin(angle)).toFixed(1);
  }).join(' ');
}

// the corner points of a regular polygon with the given number of sides
export function polyPoints(x, y, radius, sides, startAngle = -Math.PI / 2) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * 2 * Math.PI / sides;
    points.push((x + radius * Math.cos(angle)).toFixed(1) + ',' + (y + radius * Math.sin(angle)).toFixed(1));
  }
  return points.join(' ');
}

// the points of a five-pointed star
export function starPoints(x, y, radius) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const length = i % 2 ? radius * 0.45 : radius;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    points.push((x + length * Math.cos(angle)).toFixed(1) + ',' + (y + length * Math.sin(angle)).toFixed(1));
  }
  return points.join(' ');
}

// each player's heroes have their own shape, so they can be told apart without colour
export function tokenShape(player, x, y, radius, fill, stroke, strokeWidth) {
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"`;
  switch (player % 6) {
    case 1: return `<polygon points="${x},${(y - radius).toFixed(1)} ${(x + radius).toFixed(1)},${y} ${x},${(y + radius).toFixed(1)} ${(x - radius).toFixed(1)},${y}" ${attrs}/>`;
    case 2: return `<rect x="${(x - radius * 0.85).toFixed(1)}" y="${(y - radius * 0.85).toFixed(1)}" width="${(radius * 1.7).toFixed(1)}" height="${(radius * 1.7).toFixed(1)}" rx="1.5" ${attrs}/>`;
    case 3: return `<polygon points="${polyPoints(x, y, radius, 3)}" ${attrs}/>`;
    case 4: return `<polygon points="${polyPoints(x, y, radius, 6, 0)}" ${attrs}/>`;
    case 5: return `<polygon points="${starPoints(x, y, radius)}" ${attrs}/>`;
    default: return `<circle cx="${x}" cy="${y}" r="${radius}" ${attrs}/>`;
  }
}

// the terrain patterns, defined once and referenced by each tile
export const TERRAIN_DEFS = `<defs>
  <pattern id="pat-str" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" stroke-opacity=".22" stroke-width="3"/></pattern>
  <pattern id="pat-def" width="10" height="10" patternUnits="userSpaceOnUse">
    <circle cx="5" cy="5" r="1.6" fill="#ffffff" fill-opacity=".25"/></pattern>
  <pattern id="pat-rng" width="12" height="12" patternUnits="userSpaceOnUse">
    <path d="M0 9 L6 3 L12 9" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="2"/></pattern>
  <pattern id="pat-int" width="12" height="12" patternUnits="userSpaceOnUse">
    <path d="M6 0 V12 M0 6 H12" stroke="#ffffff" stroke-opacity=".18" stroke-width="1.5"/></pattern>
  <pattern id="pat-bar" width="14" height="8" patternUnits="userSpaceOnUse">
    <path d="M0 4 H14 M7 0 V4 M0 4 V8" stroke="#ffffff" stroke-opacity=".22" stroke-width="1.5" fill="none"/></pattern>
</defs>`;
