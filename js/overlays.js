/* Overlays: the first-time tutorial, the rules and help screen, the settings panel, and the legend. */

import {
  TUTORIAL_KEY, APP_VERSION, EXPECTED_SCHEMA_VERSION, SYM, TILE_COLORS, TERRAIN_PATTERN,
  DEFENDER_MARK, HERO_COLORS, GROUND_ZERO_FILL, UNOWNED_STROKE, NEUTRAL_FILL, NEUTRAL_GREY,
} from './config.js';
import { state, settings } from './state.js';
import { escapeHtml } from './escape.js';
import { d20Svg, d6Html } from './dice.js';
import { polyPoints, tokenShape, TERRAIN_DEFS } from './geometry.js';
import { saveSettings } from './audio.js';
import { render } from './render.js';
import { el } from './dom.js';

const TUTORIAL_STEPS = [
  { title: 'Welcome to VERSA', body: 'A turn-based battle royale for two to six players. Your heroes move across a hex map, fight, and build. The last player with living heroes wins.' },
  { title: 'Your turn', body: 'Each turn you get 5 Versa (V). In the early rounds you place a hex tile next to your own. Each hero can move, attack, and develop. Press End Turn when you are finished.' },
  { title: 'Moving heroes', body: 'Select or hover a hero to see where it can go (dotted tiles) and who it can attack (dotted rings). Drag a hero onto an empty tile to move it. Drag it onto an enemy to choose Combat or Mind Control, once attacks unlock in round 4.' },
  { title: 'Banners', body: "Banners use symbols. The colour behind a banner is the colour of the player who started the action; attacks blend both players' colours. ⚔ attack, 🛑 barrier, 🧠 Mind Control, 🛠 develop, 🛒 buy, 💰 Versa. ✅ success, ❌ failure. A 🛡 means the action was aimed at you." },
  { title: 'Rolls', body: 'Dice start grey and turn green on success or red on failure; failed dice are hatched. d20 rolls use the hexagon. A barrier check uses two square dice and must meet the barrier level before any d20 is rolled.' },
  { title: 'Buying', body: 'The Buy panel costs 5 V for barriers, objects, and skill points. A hero costs 30 V. Greyed options show why they are unavailable when tapped. Barriers can be raised or lowered by anyone, but the first builder keeps ownership.' },
  { title: 'Traversal cards', body: 'Drag a card into the Buy panel to sell it: 5 V for the gold card, 2 V for the others. Drag a skill card onto one of your heroes or objects to use it. Drag the gold 5 V card onto the open board to play it.' },
  { title: 'Phones', body: 'On a phone in portrait, tap 🃏 or 🛒 in the bottom bar to open the Hand or Buy panel, and End in the bottom bar to end your turn. Turn the phone sideways to see the board with both panels beside it.' },
];

const REFERENCE_SECTIONS = [
  { title: 'Banner symbols', items: [
    '⚔ attack · 🧠 Mind Control · 🛑 barrier · 🛠 develop (a roll) · 🛒 buy (costs 💰) · 🔮 object · 🏃 move · 💰 Versa',
    '✅ success · ❌ failure · 🛡 aimed at you · ☠ hero defeated · 🎯 natural 20 · ☢ Nuke · ➜ turn',
    'Banner colour is the colour of the player who acted. Attack banners blend attacker and defender colours.',
  ] },
  { title: 'Phases', items: [
    'Rounds 1 to 3 are Peace: no attacks.',
    'Rounds 4 and 5 are War: attacks open, and placement ends after round 5.',
    'Round 6 is Stagnation. From round 7 is Decline: each turn, each player removes one tile of their own.',
  ] },
  { title: 'Heroes and actions', items: [
    'Each hero has two actions per turn. A hero may move once and use one Combat or Mind Control per turn. A failed attempt can be retried.',
    'Develop rolls d20 plus Intelligence. You need 10 or more. The bonus is 1 to 3 points, which goes to a skill or an object. A natural 20 lets the hero act again.',
    'Buying spends 5 V (or 30 V for a hero) and does not roll.',
    "Heroes heal fully at the start of their owner's turn. Objects heal the same way.",
  ] },
  { title: 'Reach and Range', items: [
    "A hero's reach is its own Range plus the highest Range of any object on its tile.",
    "Objects on the hero's tile add their Range to attacks and Mind Control, as well as to moves when carried.",
  ] },
  { title: 'Combat', items: [
    'A barrier on the target tile is checked first with two dice (2d6). If the total is below the barrier level, the attack fails and no d20 is rolled.',
    'If the barrier is met, both sides roll d20 plus Strength (attacker) or Defense (defender), with any object bonuses. A tie is a miss.',
    'An object absorbs damage first; the rest hits the hero. A natural 20 gives another attack, but only when the barrier check was met.',
  ] },
  { title: 'Mind Control', items: [
    "Roll d20 plus Intelligence against the target's d20 plus Intelligence, plus any barrier and object bonuses. Ties go to the defender.",
    'A controlled hero is linked to its controller by the purple chain. The owner must cede it before it acts for the controller.',
    "Control is renewed by winning again at the end of the controller's turn. It ends if the controller dies or does not renew.",
  ] },
  { title: 'Apocalypse', items: [
    'With three or more players, the Apocalypse begins when only two players still have living heroes.',
    'With two players, it begins when the Nuke is destroyed.',
    'Barriers and objects are destroyed. Barrier and object purchases stop; hero and skill purchases continue.',
  ] },
  { title: 'Leaving and disconnects', items: [
    'Concede removes your heroes and objects. The game continues if two or more players remain.',
    'A player silent for over a minute is treated as disconnected, with the same result.',
  ] },
];

// a legend row: a key drawn in a small box, then its name and a short note
function legendRow(keyHtml, label, note) {
  return `<div class="legend-row"><span class="legend-key">${keyHtml}</span>`
    + `<span class="legend-text"><b>${escapeHtml(label)}</b>${note ? ` <small>${escapeHtml(note)}</small>` : ''}</span></div>`;
}

// a legend section with a heading
function legendSection(title, rows) {
  return `<section class="legend-section"><h3>${escapeHtml(title)}</h3>${rows}</section>`;
}

// a small drawing box for legend keys
const keySvg = inner => `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}</svg>`;
const glyphKey = glyph => `<span class="legend-glyph" aria-hidden="true">${glyph}</span>`;
const PLAYER_SHAPES = ['circle', 'diamond', 'square', 'triangle', 'hexagon', 'star'];

// the legend's contents: heroes, board, terrain, dice, buying and banner symbols
export function legendHtml() {
  const players = PLAYER_SHAPES.map((shape, i) => legendRow(
    keySvg(tokenShape(i, 20, 20, 12, HERO_COLORS[i], state.playerColors[i], 3)),
    `Player ${i + 1}`, `heroes are a ${shape}, outlined in the player's colour`)).join('');
  const board = [
    legendRow(glyphKey('🛑'), 'Barrier level', 'L3 to L12. Built at L3; below L3 it is removed. The glow is the holder\'s colour.'),
    legendRow(keySvg(`<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="${GROUND_ZERO_FILL}" stroke="${UNOWNED_STROKE}" stroke-width="2"/>`
      + `<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="url(#${TERRAIN_PATTERN.gz})"/>`),
      'Ground Zero', 'hex-grid texture. +1 to d20 rolls for heroes on it.'),
    legendRow(glyphKey(SYM.nuke), 'Nuke', 'each attack is one hit. Destroying it triggers the Apocalypse.'),
    legendRow(keySvg('<line x1="3" y1="20" x2="37" y2="20" stroke="rgba(199,125,255,.9)" stroke-width="3" stroke-dasharray="5 3" stroke-linecap="round"/>'),
      'Purple chain', 'a Mind Controlled hero and the hero controlling it.'),
    legendRow(keySvg(`<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="${NEUTRAL_FILL}" stroke="#ffffffd0" stroke-width="1.5" stroke-dasharray="3 3"/>`),
      'Dotted tile', 'the selected hero can move here.'),
    legendRow(keySvg('<circle cx="20" cy="20" r="13" fill="none" stroke="#ff9a9a" stroke-width="2" stroke-dasharray="2 2"/>'),
      'Dotted red ring', 'an enemy the selected hero can attack.'),
    legendRow(keySvg('<circle cx="20" cy="20" r="13" fill="none" stroke="#ffe066" stroke-width="3"/>'),
      'Gold pulse', 'marks units named in the banners now showing. It clears when they finish.'),
    legendRow(keySvg(`<rect x="10" y="10" width="20" height="20" rx="4" fill="${state.playerColors[0]}" stroke="#0e0e12" stroke-width="2"/>`),
      'Object (square)', "takes its owner's colour. Adds its Strength or Defense in combat."),
  ].join('');
  const terrain = [
    ['str', 'Strength', 'diagonal lines'], ['def', 'Defense', 'dots'], ['rng', 'Range', 'chevrons'],
    ['int', 'Intelligence', 'crosses'], ['bar', 'Barrier', 'bricks'],
  ].map(([skill, label, pattern]) => legendRow(
    keySvg(`<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="${TILE_COLORS[skill]}" stroke="#0e0e12" stroke-width="1.5"/>`
      + `<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="url(#${TERRAIN_PATTERN[skill]})"/>`),
    label, `pattern: ${pattern}`)).join('');
  const dice = [
    legendRow(d20Svg(9, 'pending'), 'Grey', 'a roll still being decided'),
    legendRow(d20Svg(14, 'win'), 'Green', 'the roll succeeded'),
    legendRow(d20Svg(7, 'lose'), 'Red, dashed inner shape', 'the roll failed'),
    legendRow(d6Html(5, 'lose'), 'Square dice', '2d6 for barrier checks and movement; hatched when failed'),
  ].join('');
  const buying = [
    ['🛑', 'Barrier', '5 V. An empty tile builds one you own; existing barriers are raised or lowered.'],
    ['🔮', 'Object', '5 V. Up to 3 per player. Needs one of your heroes on the tile.'],
    ['👤', 'Hero', '30 V. Up to 3 per player.'],
    ['✊', 'Skill point', '5 V. Adds one point to a hero or object.'],
  ].map(([glyph, label, note]) => legendRow(
    `<span class="legend-glyph legend-buy" style="background:${NEUTRAL_GREY}" aria-hidden="true">${glyph}</span>`,
    label, note)).join('');
  const banner = [
    [SYM.attack, 'Attack'], [SYM.mind, 'Mind Control'], [SYM.barrier, 'Barrier'], [SYM.develop, 'Develop (a roll)'],
    [SYM.buy, 'Buy (costs 💰)'], [SYM.versa, 'Versa'], [SYM.move, 'Move'], [SYM.win, 'Success'],
    [SYM.lose, 'Failure'], [DEFENDER_MARK, 'Aimed at you'], [SYM.kill, 'Hero defeated'],
    [SYM.nat20, 'Natural 20'], [SYM.nuke, 'Nuke'], [SYM.turn, 'Turn change'],
  ].map(([glyph, label]) => legendRow(glyphKey(glyph), label, '')).join('');
  return `<div class="ov-card legend-card" role="document">
    <svg class="legend-defs" aria-hidden="true">${TERRAIN_DEFS}</svg>
    <h2 id="helpTitle">Legend</h2>
    ${legendSection('Heroes and players', players)}
    ${legendSection('Board', board)}
    ${legendSection('Terrain', terrain)}
    ${legendSection('Dice', dice)}
    ${legendSection('Buying', buying)}
    ${legendSection('Banner symbols', banner)}
    <div class="ov-actions"><button class="endb" data-ov="close">Close</button></div>
  </div>`;
}

// the tutorial's current step
export function tutorialHtml() {
  const step = TUTORIAL_STEPS[state.overlay.step];
  const last = state.overlay.step === TUTORIAL_STEPS.length - 1;
  return `<div class="ov-card" role="document">
    <div class="muted">Step ${state.overlay.step + 1} of ${TUTORIAL_STEPS.length}</div>
    <h2 id="helpTitle">${escapeHtml(step.title)}</h2>
    <p>${escapeHtml(step.body)}</p>
    <div class="ov-actions">
      <button data-ov="skip">Skip</button>
      ${state.overlay.step > 0 ? '<button data-ov="back">Back</button>' : ''}
      <button class="endb" data-ov="${last ? 'finish' : 'next'}">${last ? 'Start playing' : 'Next'}</button>
    </div></div>`;
}

// the rules and help screen
export function helpHtml() {
  const sections = REFERENCE_SECTIONS.map(section => `
    <div class="ov-ref"><h3>${escapeHtml(section.title)}</h3>
      <ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`).join('');
  return `<div class="ov-card" role="document">
    <h2 id="helpTitle">Rules and help</h2>
    ${sections}
    <div class="ov-actions">
      <button data-ov="replay">Replay tutorial</button>
      <button class="endb" data-ov="close">Close</button>
    </div></div>`;
}

// the settings panel: volume, sound, colours, motion and text size, and the version
export function settingsHtml() {
  const check = (key, label) => `<label class="ov-row"><span>${label}</span>
    <input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}></label>`;
  return `<div class="ov-card" role="document">
    <h2 id="helpTitle">Settings</h2>
    <label class="ov-row"><span>Volume</span>
      <input type="range" min="0" max="100" step="1" value="${settings.volume}" data-setting="volume"
        aria-valuetext="${settings.volume} percent" aria-label="Volume"></label>
    ${check('muted', 'Mute all sound')}
    <label class="ov-row"><span>Colours</span>
      <select data-setting="palette" aria-label="Colour palette">
        <option value="standard" ${settings.palette === 'standard' ? 'selected' : ''}>Standard</option>
        <option value="cb" ${settings.palette === 'cb' ? 'selected' : ''}>Colour-blind safe</option>
      </select></label>
    ${check('reduceMotion', 'Reduce motion')}
    ${check('largeText', 'Larger text')}
    <p class="muted">Hero and object names are set on the main screen and apply from the next game you start.</p>
    <p class="muted">App ${escapeHtml(APP_VERSION)} · database ${escapeHtml(state.dbVersion)} (expects ${escapeHtml(EXPECTED_SCHEMA_VERSION)})</p>
    <div class="ov-actions"><button class="endb" data-ov="close">Close</button></div></div>`;
}

// draws whichever overlay is open into the overlay element
export function renderOverlay() {
  const host = el('helpOverlay');
  const kind = state.overlay.kind;
  if (kind === 'tutorial') host.innerHTML = tutorialHtml();
  else if (kind === 'help') host.innerHTML = helpHtml();
  else if (kind === 'settings') host.innerHTML = settingsHtml();
  else if (kind === 'legend') host.innerHTML = legendHtml();
}

// opens an overlay and moves focus into it
export function openOverlay(kind) {
  state.overlay = { kind, step: 0, returnFocus: document.activeElement };
  el('helpOverlay').hidden = false;
  renderOverlay();
  const first = el('helpOverlay').querySelector('button, input, select');
  if (first) first.focus();
}

// closes the overlay, remembers that the tutorial was seen, and returns focus
export function closeOverlay() {
  const back = state.overlay.returnFocus;
  if (state.overlay.kind === 'tutorial') localStorage.setItem(TUTORIAL_KEY, '1');
  state.overlay = { kind: null, step: 0, returnFocus: null };
  el('helpOverlay').hidden = true;
  el('helpOverlay').innerHTML = '';
  if (back && back.focus) back.focus();
}

// moves the tutorial forward or back, or handles a button in the overlay
export function handleOverlayClick(event) {
  const button = event.target.closest('[data-ov]');
  if (!button) return;
  const action = button.dataset.ov;
  if (action === 'next') state.overlay.step += 1;
  else if (action === 'back') state.overlay.step -= 1;
  else if (action === 'skip' || action === 'finish' || action === 'close') return closeOverlay();
  else if (action === 'replay') { state.overlay.kind = 'tutorial'; state.overlay.step = 0; }
  renderOverlay();
  const first = el('helpOverlay').querySelector('button, input, select');
  if (first) first.focus();
}

// a settings change: saves it, and redraws the parts it affects
export function changeSetting(target) {
  const key = target.dataset.setting;
  if (target.type === 'checkbox') settings[key] = target.checked;
  else if (target.type === 'range') settings[key] = Number(target.value);
  else settings[key] = target.value;
  saveSettings();
  if (key === 'palette' || key === 'reduceMotion') render();
  if (key === 'palette') renderOverlay();
}
