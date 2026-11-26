/* Tooltips shown when a player hovers a hero, an object, the Nuke or a tile. */

import { SKILL_ICON, SKILL_NAME, UNOWNED_STROKE } from './config.js';
import { state } from './state.js';
import { escapeHtml } from './escape.js';
import { myIndex, isMine, heroLabel, reach, carryable, actsForMe, knowsTileType } from './rules.js';

// the four stats of a hero or object, in a row
export function statGrid(stats) {
  const rows = [
    ['✊', 'STR', stats.strength],
    ['🛡️', 'DEF', stats.defense],
    ['🏹', 'RNG', stats.range],
    ['🧠', 'INT', stats.intelligence],
  ];
  return `<div class="tstats">${rows.map(([icon, name, value]) =>
    `<div class="tstat">${icon}<b>${escapeHtml(value)}</b><small>${name}</small></div>`).join('')}</div>`;
}

// a bar showing how much of a unit's defence has been used up
export function damageBar(damage, limit) {
  return `<div class="tbar"><i style="width:${Math.min(100, damage / limit * 100)}%"></i></div>`;
}

// the tooltip for a hero: its name, stats, damage, actions left, reach and any control
export function heroTooltip(hero) {
  const actions = actsForMe(hero)
    ? `<div class="tsub">Actions: ${'●'.repeat(hero.actions)}${'✕'.repeat(Math.max(0, 2 - hero.actions))}</div>`
    : '';
  const control = hero.mindControl
    ? `<div class="tsub">🧠 Controlled by ${escapeHtml(state.game.players[hero.mindControl.by].name)}${hero.mindControl.ceded ? ' · ceded' : ''}</div>`
    : '';
  const rangeNote = carryable(hero).length ? ' (includes object Range on this tile)' : '';
  return {
    kind: 'hero',
    color: state.playerColors[hero.player],
    html: `<div class="th">🧍 ${escapeHtml(heroLabel(hero))}</div>${statGrid(hero.stats)}${damageBar(hero.damage, hero.stats.defense)}
      <div class="tsub">Damage ${escapeHtml(hero.damage)} of ${escapeHtml(hero.stats.defense)}</div>${actions}
      <div class="tsub">Reach ${reach(hero)}${rangeNote}</div>${control}`,
  };
}

// the tooltip for an object: its name, stats, damage, and whose it is
export function objectTooltip(obj) {
  const ownerNote = isMine(obj) ? '' : ' · owned by another player; taking it makes it yours';
  const rangeNote = obj.stats.range > 0
    ? `Range ${obj.stats.range}: a hero on this tile gains this Range for attacks and Mind Control`
    : '';
  const title = obj.name || `${state.game.players[obj.player].name}'s object`;
  return {
    kind: 'object',
    color: state.playerColors[obj.player],
    html: `<div class="th">${escapeHtml(obj.symbol || '🧱')} ${escapeHtml(title)}</div>${statGrid(obj.stats)}${damageBar(obj.damage, obj.stats.defense)}
      <div class="tsub">Damage ${escapeHtml(obj.damage)} of ${escapeHtml(obj.stats.defense)}</div>
      <div class="tsub">${escapeHtml(rangeNote)}${escapeHtml(ownerNote)}</div>`,
  };
}

// the tooltip for the Nuke
export function nukeTooltip(nuke) {
  return {
    kind: 'nuke',
    color: '#ff3d3d',
    html: `<div class="th">☢ Nuke</div>${damageBar(nuke.damage, nuke.stats.defense)}
      <div class="tsub">Hits ${escapeHtml(nuke.damage)} of ${escapeHtml(nuke.stats.defense)}. Each attack is one hit.</div>
      <div class="tsub">Destroying it triggers the Apocalypse.</div>`,
  };
}

// the tooltip for a tile: its type if known, its owner, and any barrier on it
export function tileTooltip(tile) {
  const seen = knowsTileType(tile, myIndex());
  const title = tile.groundZero ? '⬡ Ground Zero'
    : !seen ? '? Hidden HexTile'
    : tile.skill === 'bar' ? '🛑 Barrier HexTile'
    : `${SKILL_ICON[tile.skill]} ${SKILL_NAME[tile.skill]} HexTile`;
  const ownerName = tile.owner >= 0 ? state.game.players[tile.owner].name : 'Neutral';
  const barrierHolder = tile.barrierOwner != null && state.game.players[tile.barrierOwner]
    ? ' · held by ' + escapeHtml(state.game.players[tile.barrierOwner].name)
    : '';
  const barrierLine = tile.barrier
    ? `<div class="tsub">🛑 Barrier L${tile.barrier}${barrierHolder}</div>`
    : '';
  const status = tile.groundZero ? 'Ground Zero: +1 to d20 rolls for heroes on it'
    : tile.discovered ? 'Discovered'
    : tile.owner === myIndex() ? 'Yours, face down: only you can see its type'
    : 'Undiscovered: its type is hidden until its owner reveals it';
  return {
    kind: 'tile',
    color: tile.owner >= 0 ? state.playerColors[tile.owner] : UNOWNED_STROKE,
    html: `<div class="th">${title}</div><div class="tsub">Owner: ${escapeHtml(ownerName)}</div><div class="tsub">${status}</div>${barrierLine}`,
  };
}
