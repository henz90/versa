/* =============================================================
   VERSA: comprehension features (build 1)

   Loaded after game.js. It does not edit game.js. Each feature wraps
   a function that game.js defines: the wrapper calls the original
   first, then adds its own work. This keeps the core game unchanged
   until the modular rebuild.

   Features:
     1. Turn spine: round, phase, the next phase change in rounds,
        and how many heroes can still act this turn.
     2. Cost preview: choosing a buy option says what it costs and
        where it can be placed.
     3. Odds on the attack wheel: the chance each action succeeds,
        worked out from the same bonuses the server uses.
     4. Legend: every board symbol and banner symbol, opened from
        the bottom bar.
   ============================================================= */

/* =============================================================
   1. CONSTANTS
   ============================================================= */

// Stagnation starts one round before Decline
const STAGNATION_ROUND = ROUND.declineFrom - 1;

// what each buy option does, shown when the option is chosen
const BUY_PREVIEW = {
  barrier: 'Barrier · 5 V · tap a discovered tile next to one of your heroes. An empty tile gets a barrier you own; an existing one can be raised or lowered.',
  obj: 'Object · 5 V · tap a discovered tile with one of your heroes. Up to 3 per player.',
  hero: 'Hero · 30 V · tap a discovered tile with one of your heroes. Up to 3 per player.',
};

// the shape each player's heroes take, in the order of the player list
const PLAYER_TOKEN_NAMES = ['circle', 'diamond', 'square', 'triangle', 'hexagon', 'star'];

const BUY_COST_ROWS = [
  ['🛑', 'Barrier', '5 V. An empty tile builds one you own; existing barriers are raised or lowered.'],
  ['🔮', 'Object', '5 V. Up to 3 per player. Needs one of your heroes on the tile.'],
  ['👤', 'Hero', '30 V. Up to 3 per player.'],
  ['✊', 'Skill point', '5 V. Adds one point to a hero or object.'],
];

const TERRAIN_ROWS = [
  ['str', 'Strength', 'diagonal lines'],
  ['def', 'Defense', 'dots'],
  ['rng', 'Range', 'chevrons'],
  ['int', 'Intelligence', 'crosses'],
  ['bar', 'Barrier', 'bricks'],
];

const BANNER_SYMBOL_ROWS = [
  [SYM.attack, 'Attack'],
  [SYM.mind, 'Mind Control'],
  [SYM.barrier, 'Barrier'],
  [SYM.develop, 'Develop (a roll)'],
  [SYM.buy, 'Buy (costs 💰)'],
  [SYM.versa, 'Versa'],
  [SYM.move, 'Move'],
  [SYM.win, 'Success'],
  [SYM.lose, 'Failure'],
  [DEFENDER_MARK, 'Aimed at you'],
  [SYM.kill, 'Hero defeated'],
  [SYM.nat20, 'Natural 20'],
  [SYM.nuke, 'Nuke'],
  [SYM.turn, 'Turn change'],
];

/* =============================================================
   2. ODDS (pure functions: they read no game state)
   ============================================================= */

// the chance that one d20 plus a bonus beats another d20 plus a bonus.
// A tie is not a win, which matches the server.
function chanceD20Beats(attackerBonus, defenderBonus) {
  let wins = 0;
  for (let attackerRoll = 1; attackerRoll <= 20; attackerRoll++) {
    for (let defenderRoll = 1; defenderRoll <= 20; defenderRoll++) {
      if (attackerRoll + attackerBonus > defenderRoll + defenderBonus) wins++;
    }
  }
  return wins / 400;
}

// the chance that two six-sided dice total at least the target
function chanceTwoDiceReach(target) {
  let reaching = 0;
  for (let first = 1; first <= 6; first++) {
    for (let second = 1; second <= 6; second++) {
      if (first + second >= target) reaching++;
    }
  }
  return reaching / 36;
}

const percentText = chance => `${Math.round(chance * 100)}%`;

/* =============================================================
   3. ODDS FROM THE GAME STATE
   These mirror the bonuses that act_attack and act_mind_control
   add on the server. If the server rule changes, change these too.
   ============================================================= */

// Ground Zero adds 1 to a hero's d20 roll
function groundZoneBonus(hero) {
  const tile = tileAt(hero.c);
  return tile && tile.gz ? 1 : 0;
}

// the barrier level on the tile a hero stands on
function barrierLevelOn(hero) {
  const tile = tileAt(hero.c);
  return tile ? Number(tile.bar || 0) : 0;
}

// the first living object a player has on a tile, as the server chooses it
function firstObjectOwnedOn(player, cube) {
  return G.objs.find(obj => obj.alive && !obj.nuke && obj.p === player && sameTile(obj.c, cube)) || null;
}

// the chance an attack gets through the barrier, then wins the d20 contest
function combatOdds(attacker, defender) {
  const attackerObject = firstObjectOwnedOn(attacker.p, attacker.c);
  const defenderObject = firstObjectOwnedOn(defender.p, defender.c);
  const attackBonus = attacker.s.str + groundZoneBonus(attacker) + (attackerObject ? attackerObject.s.str : 0);
  const defenseBonus = defender.s.def + groundZoneBonus(defender) + (defenderObject ? defenderObject.s.def : 0);
  const barrier = barrierLevelOn(defender);
  return {
    barrier,
    throughBarrier: barrier > 0 ? chanceTwoDiceReach(barrier) : 1,
    hit: chanceD20Beats(attackBonus, defenseBonus),
  };
}

// the chance Mind Control succeeds. The defender's barrier adds to its defence.
function mindControlOdds(attacker, defender) {
  const attackerObject = firstObjectOwnedOn(attacker.p, attacker.c);
  const defenderObject = firstObjectOwnedOn(defender.p, defender.c);
  const attackBonus = attacker.s.int + groundZoneBonus(attacker) + (attackerObject ? attackerObject.s.int : 0);
  const defenseBonus = defender.s.int + barrierLevelOn(defender) + (defenderObject ? defenderObject.s.int : 0);
  return chanceD20Beats(attackBonus, defenseBonus);
}

// writes the odds onto the attack wheel's buttons, and explains the barrier check
function annotateAttackWheel(wheel) {
  const attacker = G.heroes[wheel.heroIndex];
  const defender = G.heroes[wheel.targetIndex];
  if (!attacker || !defender) return;

  const combat = combatOdds(attacker, defender);
  const mindChance = mindControlOdds(attacker, defender);

  wheel.items.forEach(item => {
    if (item.dis) return;
    if (item.v === 'atk') item.t = `Combat ${percentText(combat.throughBarrier * combat.hit)}`;
    if (item.v === 'mind') item.t = `Mind Control ${percentText(mindChance)}`;
  });

  if (combat.barrier > 0) {
    setMessage(`Barrier L${combat.barrier}: ${percentText(combat.throughBarrier)} to get through first. Combat odds include this.`);
  }
}

/* =============================================================
   4. TURN SPINE
   ============================================================= */

function roundsLeftText(roundsLeft) {
  return roundsLeft === 1 ? '1 round' : `${roundsLeft} rounds`;
}

// the next phase change, counted down in rounds
function nextPhaseText(round) {
  if (round < ROUND.attacksFrom) {
    return `attacks open in ${roundsLeftText(ROUND.attacksFrom - round)}`;
  }
  if (round < STAGNATION_ROUND) {
    return `stagnation in ${roundsLeftText(STAGNATION_ROUND - round)}`;
  }
  if (round < ROUND.declineFrom) {
    return `decline in ${roundsLeftText(ROUND.declineFrom - round)}`;
  }
  return 'decline is active';
}

function heroesReadyToAct() {
  return G.heroes.filter(hero => hero.alive && actsForMe(hero) && hero.acts > 0).length;
}

function turnSpineText() {
  const parts = [`Round ${G.rd}`, phaseName(), nextPhaseText(G.rd)];
  if (isMyTurn()) {
    const ready = heroesReadyToAct();
    parts.push(`${ready} ${ready === 1 ? 'hero' : 'heroes'} ready`);
  }
  return parts.join(' · ');
}

// replaces the round chip in the top bar with the turn spine
function decorateTopBar() {
  const roundChip = el('top').querySelector('.chip');
  if (roundChip) roundChip.textContent = turnSpineText();
}

/* =============================================================
   5. LEGEND
   ============================================================= */

// the legend's symbol keys are drawn in a 40 by 40 box
const keySvg = inner => `<svg viewBox="0 0 40 40" aria-hidden="true">${inner}</svg>`;
const glyphKey = glyph => `<span class="legend-glyph" aria-hidden="true">${glyph}</span>`;

function legendRow(keyHtml, label, note) {
  return `<div class="legend-row">
    <span class="legend-key">${keyHtml}</span>
    <span class="legend-text"><b>${escapeHtml(label)}</b>${note ? ` <small>${escapeHtml(note)}</small>` : ''}</span>
  </div>`;
}

function legendSection(title, rowsHtml) {
  return `<section class="legend-section"><h3>${escapeHtml(title)}</h3>${rowsHtml}</section>`;
}

function playerRowsHtml() {
  return PLAYER_TOKEN_NAMES.map((shapeName, index) => legendRow(
    keySvg(tokenShape(index, 20, 20, 12, HERO_COLORS[index], PLAYER_COLORS[index], 3)),
    `Player ${index + 1}`,
    `heroes are a ${shapeName}, outlined in the player's colour`,
  )).join('');
}

function boardRowsHtml() {
  return [
    legendRow(glyphKey('🛑'), 'Barrier level', 'L3 to L12. Built at L3; below L3 it is removed.'),
    legendRow(
      keySvg(`<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="${GROUND_ZERO_FILL}" stroke="${UNOWNED_STROKE}" stroke-width="2"/>`),
      'Ground Zero', '+1 to d20 rolls for heroes on it.'),
    legendRow(glyphKey(SYM.nuke), 'Nuke', 'each attack is one hit. Destroying it triggers the Apocalypse.'),
    legendRow(
      keySvg('<line x1="3" y1="20" x2="37" y2="20" stroke="rgba(199,125,255,.9)" stroke-width="3" stroke-dasharray="5 3" stroke-linecap="round"/>'),
      'Purple chain', 'a Mind Controlled hero and the hero controlling it.'),
    legendRow(
      keySvg(`<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="${NEUTRAL_FILL}" stroke="#ffffffd0" stroke-width="1.5" stroke-dasharray="3 3"/>`),
      'Dotted tile', 'the selected hero can move here.'),
    legendRow(
      keySvg('<circle cx="20" cy="20" r="13" fill="none" stroke="#ff9a9a" stroke-width="2" stroke-dasharray="2 2"/>'),
      'Dotted red ring', 'an enemy the selected hero can attack.'),
    legendRow(
      keySvg('<circle cx="20" cy="20" r="13" fill="none" stroke="#ffe066" stroke-width="3"/>'),
      'Gold pulse', 'named in the banners now showing. It clears when they finish.'),
    legendRow(
      keySvg(`<rect x="10" y="10" width="20" height="20" rx="4" fill="${PLAYER_COLORS[0]}" stroke="#0e0e12" stroke-width="2"/>`),
      'Object (square)', 'takes its owner\'s colour. Adds its Strength or Defense in combat.'),
  ].join('');
}

function terrainRowsHtml() {
  return TERRAIN_ROWS.map(([skill, label, pattern]) => legendRow(
    keySvg(`<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="${TILE_COLORS[skill]}" stroke="#0e0e12" stroke-width="1.5"/>`
      + `<polygon points="${polyPoints(20, 20, 17, 6, 0)}" fill="url(#${TERRAIN_PATTERN[skill]})"/>`),
    label,
    `pattern: ${pattern}`,
  )).join('');
}

function diceRowsHtml() {
  return [
    legendRow(d20Svg(9, 'pending'), 'Grey', 'a roll still being decided'),
    legendRow(d20Svg(14, 'win'), 'Green', 'the roll succeeded'),
    legendRow(d20Svg(7, 'lose'), 'Red, dashed inner shape', 'the roll failed'),
    legendRow(d6Html(5, 'lose'), 'Square dice', '2d6 for barrier checks and movement; hatched when failed'),
  ].join('');
}

function buyRowsHtml() {
  return BUY_COST_ROWS.map(([glyph, label, note]) => legendRow(glyphKey(glyph), label, note)).join('');
}

function bannerRowsHtml() {
  return BANNER_SYMBOL_ROWS.map(([glyph, label]) => legendRow(glyphKey(glyph), label, '')).join('');
}

// the legend's hidden pattern definitions, so the terrain keys draw even in the lobby
function legendHtml() {
  return `<div class="ov-card legend-card" role="document">
    <svg class="legend-defs" aria-hidden="true">${TERRAIN_DEFS}</svg>
    <h2 id="helpTitle">Legend</h2>
    ${legendSection('Heroes and players', playerRowsHtml())}
    ${legendSection('Board', boardRowsHtml())}
    ${legendSection('Terrain', terrainRowsHtml())}
    ${legendSection('Dice', diceRowsHtml())}
    ${legendSection('Buying', buyRowsHtml())}
    ${legendSection('Banner symbols', bannerRowsHtml())}
    <div class="ov-actions"><button class="endb" data-ov="close">Close</button></div>
  </div>`;
}

// adds the 🗺 button to the bottom bar; the bar is rebuilt on each render, so the button is added each time
function decorateBottomBar() {
  el('bar').insertAdjacentHTML('beforeend',
    '<button class="sbtn" data-action="open-legend" aria-label="Legend of symbols" title="Legend of symbols">🗺</button>');
}

/* =============================================================
   6. COST PREVIEW
   ============================================================= */

function buyPreviewFor(key) {
  if (key.startsWith('skill:')) {
    const skill = key.slice('skill:'.length);
    return `${SKILL_NAME[skill]} · 5 V · tap one of your heroes or objects to add 1 point`;
  }
  return BUY_PREVIEW[key] || '';
}

// true when the buy option is the one now waiting for a tap on the board
function buyOptionIsWaiting(key) {
  if (key.startsWith('skill:')) {
    return ui.mode === 'buyskill' && ui.devSkill === key.slice('skill:'.length);
  }
  return ui.mode === key;
}

/* =============================================================
   7. WIRING: WRAP THE GAME'S FUNCTIONS
   Each wrapper calls the original first. The game calls these by
   name, so the wrapper is used everywhere.
   ============================================================= */

const renderWithoutFeatures = render;
render = function renderWithFeatures() {
  renderWithoutFeatures();
  decorateBottomBar();
  if (G) decorateTopBar();
};

const pickBuyWithoutPreview = pickBuy;
pickBuy = function pickBuyWithPreview(key) {
  pickBuyWithoutPreview(key);
  const preview = buyPreviewFor(key);
  if (preview && buyOptionIsWaiting(key)) {
    setMessage(preview);
    render();
  }
};

const openAttackChoiceWithoutOdds = openAttackChoice;
openAttackChoice = function openAttackChoiceWithOdds(attackerIdx, defenderIdx) {
  openAttackChoiceWithoutOdds(attackerIdx, defenderIdx);
  if (ui.wheel && ui.wheel.kind === 'attackChoice') annotateAttackWheel(ui.wheel);
};

const renderOverlayWithoutLegend = renderOverlay;
renderOverlay = function renderOverlayWithLegend() {
  if (overlayState.kind === 'legend') {
    el('helpOverlay').innerHTML = legendHtml();
    return;
  }
  renderOverlayWithoutLegend();
};

// the legend button is outside the game's own click routing, so it is handled here
document.addEventListener('click', event => {
  if (event.target.closest('[data-action="open-legend"]')) openOverlay('legend');
});
