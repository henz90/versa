/* Banners: the big event cards, the side chips, the queue that shows them one at a time,
   the roll cards, the symbols that replace words on banners, and the turn moment. */

import {
  SYM, SOURCE_STYLE, SOURCE_FRAME, DEFENDER_MARK, SKILL_NAME, SKILL_ICON,
  WIN_HEADLINES, LOSE_HEADLINES, PROJECTILE_HEADLINES, IMPACT_HEADLINES, TIMING, HERO_COLORS,
} from './config.js';
import { settings, state } from './state.js';
import { escapeHtml, markV } from './escape.js';
import { outcomeFill, inkFor, d6Html, d20BannerFace, d20Svg } from './dice.js';
import { myIndex, heroLabel } from './rules.js';
import { heroPosition, setViewBoxFor } from './board-position.js';
import { SOUNDS } from './audio.js';
import { flashUnits } from './board-draw.js';
import { el } from './dom.js';

// the coloured frame for a banner's source, following the palette
export function frameFor(source) {
  const palette = SOURCE_FRAME[settings.palette] || SOURCE_FRAME.standard;
  return palette[source] || palette.general;
}

// whether an event matters to the signed-in player, so it gets a big banner instead of a chip
export function isImportantEvent(event) {
  if (!event || !state.game) return false;
  const mine = myIndex();
  if (event.target === mine || event.actor === mine) return true;
  if (['turn', 'nuke', 'concede', 'disconnect', 'general'].includes(event.source)) return true;
  if (event.headline === 'Natural 20!') return true;
  return (event.affected || []).some(unit => unit.kind === 'hero'
    && state.game.heroes[unit.i] && state.game.heroes[unit.i].player === mine);
}

// whether an outcome is a success or a failure
export function outcomeOf(event) {
  if (event.source === 'move' || event.source === 'card' || event.source === 'buy') return 'win';
  if (LOSE_HEADLINES.includes(event.headline)) return 'lose';
  if (WIN_HEADLINES.includes(event.headline)) return 'win';
  return 'win';
}

// a develop's bonus is announced as its own roll, then its result; these recognise each part
const isBonusRoll = event => !!event && event.source === 'develop' && /^\+\d+ bonus$/.test(event.headline || '');
const isBonusResult = event => !!event && event.source === 'develop'
  && !isBonusRoll(event) && !['Natural 20!', 'Failed'].includes(event.headline);

// joins a develop's bonus roll and its result into one banner
export function mergeRollEvents(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const first = list[i];
    const next = list[i + 1];
    if (isBonusRoll(first) && isBonusResult(next)) {
      const bonus = first.headline.match(/\+(\d+)/)[1];
      const total = (first.detail || '').match(/total (\d+)/);
      const heroPart = (first.detail || '').split(' · ').slice(1).join(' · ');
      const detail = [total ? `total ${total[1]}` : null, `+${bonus} bonus`, heroPart].filter(Boolean).join(' · ');
      out.push({
        ...next,
        source: 'develop',
        dice: first.dice,
        detail,
        tone: next.tone || first.tone,
        affected: next.affected && next.affected.length ? next.affected : first.affected,
        actor: first.actor,
        target: first.target,
      });
      i++;
    } else {
      out.push(first);
    }
  }
  return out;
}

// the numbers shown for a roll, read from the event's detail text
export function shownTotal(event) {
  const detail = event.detail || '';
  const versus = detail.match(/(\d+)\s*vs\s*(\d+)/);
  if (versus) return { a: Number(versus[1]), b: Number(versus[2]), kind: 'vs' };
  const total = detail.match(/total (\d+)/) || detail.match(/got (\d+)/);
  if (total) return { a: Number(total[1]), kind: 'single' };
  return null;
}

// the symbol line for an event: symbols and numbers only, with the shield when it was aimed at the player
export function symbolLine(event, rawHeadline, youDefend) {
  const won = outcomeOf(event) === 'win';
  const mark = won ? SYM.win : SYM.lose;
  const total = shownTotal(event);
  const versus = total && total.kind === 'vs' ? `${total.a} vs ${total.b}` : '';
  const single = total && total.kind === 'single' ? `${total.a}` : '';
  const prefix = youDefend ? `${DEFENDER_MARK} ` : '';

  switch (rawHeadline) {
    case 'Hit': case 'Miss':
      return `${prefix}${SYM.attack} ${mark} ${versus}`;
    case 'Through':
      return `${prefix}${SYM.barrier} ${SYM.win} ${total ? total.a : ''}`.trim();
    case 'Blocked':
      return `${prefix}${SYM.barrier} ${SYM.lose} ${total ? total.a : ''}`.trim();
    case 'Controlled': case 'Renewed': case 'Resisted': case 'Freed': case 'Released':
      return `${prefix}${SYM.mind} ${won ? SYM.win : SYM.lose} ${versus}`;
    case 'Failed':
      return `${prefix}${SYM.develop} ${SYM.lose} ${single}`;
    case 'Natural 20!':
      return `${SYM.nat20} 20`;
    case 'Defeated':
      return `${prefix}${SYM.kill}`;
    case 'Object lost': case 'Object absorbs':
      return `${prefix}${SYM.object} ${SYM.boom}`;
    case 'Nuke':
      return SYM.nuke;
    case 'Concede': return SYM.concede;
    case 'Disconnected': return SYM.disconnect;
    default: break;
  }

  if (/^\+\d+ bonus$/.test(rawHeadline)) return `${SYM.develop} ${SYM.plus}${rawHeadline.match(/\d+/)[0]}`;
  if (/^\+\d+ (Strength|Defense|Range|Intelligence)$/.test(rawHeadline)) {
    const skill = rawHeadline.split(' ')[1];
    const key = Object.keys(SKILL_NAME).find(k => SKILL_NAME[k] === skill) || 'str';
    return `${SYM.develop} ${SKILL_ICON[key]} ${SYM.plus}${rawHeadline.match(/\d+/)[0]}`;
  }
  if (/^Object DEF/.test(rawHeadline)) return `${SYM.develop} ${SYM.object} ${SYM.plus}${rawHeadline.match(/\d+/)[0]}`;

  if (/^▲ Barrier L(\d+)$/.test(rawHeadline) || rawHeadline === '▲ Barrier L3') {
    const level = rawHeadline.match(/\d+/)[0];
    return event.source === 'buy'
      ? `${SYM.buy} ${SYM.barrier} ${SYM.up} L${level} ${SYM.cost}5`
      : `${SYM.develop} ${SYM.barrier} ${SYM.up} L${level}`;
  }
  if (/^▼ Barrier L(\d+)$/.test(rawHeadline)) {
    const level = rawHeadline.match(/\d+/)[0];
    return event.source === 'buy'
      ? `${SYM.buy} ${SYM.barrier} ${SYM.down} L${level} ${SYM.cost}5`
      : `${SYM.develop} ${SYM.barrier} ${SYM.down} L${level}`;
  }
  if (rawHeadline === '▼ Barrier removed') {
    return `${event.source === 'buy' ? SYM.buy : SYM.develop} ${SYM.barrier} ${SYM.down} 0`;
  }
  if (rawHeadline === '+5 Versa') return `${SYM.versa} ${SYM.plus}5`;
  if (event.source === 'buy' && /^\+\d+ (Strength|Defense|Range|Intelligence)$/.test(rawHeadline)) {
    const key = Object.keys(SKILL_NAME).find(k => SKILL_NAME[k] === rawHeadline.split(' ')[1]) || 'str';
    return `${SYM.buy} ${SKILL_ICON[key]} ${SYM.cost}5`;
  }
  if (event.source === 'move') return `${SYM.move} ${mark} ${single}`;
  if (event.source === 'turn') return `${SYM.turn} ${SYM.hero} R${state.game ? state.game.round : ''}`;
  return rawHeadline;
}

// the words for an event, for screen readers and the live region
export function eventSpokenText(event) {
  return [event.headline, event.detail].filter(Boolean).join('. ');
}

// the banner background: the acting player's colour, or a blend from attacker to defender
export function bannerFillStyle(event) {
  const actor = event.actor != null && event.actor >= 0 ? state.playerColors[event.actor] : null;
  const target = event.target != null && event.target >= 0 ? state.playerColors[event.target] : null;
  if (event.source === 'combat' && actor && target && actor !== target) {
    return `background: linear-gradient(100deg, ${actor} 0%, ${actor} 45%, ${target} 55%, ${target} 100%);`;
  }
  if (actor) return `background: ${actor};`;
  return '';
}

// coloured dots showing who acted, who was hit, and which heroes were involved
export function whoLine(event) {
  const dots = [];
  const playerDot = index => (index != null && index >= 0 && state.game.players[index]
    ? `<span class="pdot" style="--c:${state.playerColors[index]}" title="${escapeHtml(state.game.players[index].name)}"></span>`
    : '');
  if (event.actor != null && event.actor >= 0) dots.push(playerDot(event.actor));
  if (event.target != null && event.target >= 0 && event.target !== event.actor) dots.push('→', playerDot(event.target));
  (event.affected || []).forEach(unit => {
    if (unit.kind === 'hero' && state.game.heroes[unit.i]) {
      const hero = state.game.heroes[unit.i];
      dots.push(`<span class="hdot" style="--c:${state.playerColors[hero.player]};--hc:${HERO_COLORS[(hero.slot - 1) % HERO_COLORS.length]}" title="${escapeHtml(heroLabel(hero))}"></span>`);
    }
  });
  return dots.length ? `<div class="event-who" aria-hidden="true">${dots.join(' ')}</div>` : '';
}

// the dice in a banner: d20 always uses the hexagon; 2d6 uses the square die
export function diceBlock(event, rawHeadline) {
  const dice = event.dice || [];
  if (!dice.length) return '';
  const outcome = outcomeOf(event);
  const is2d6 = event.source === 'move' || rawHeadline === 'Through' || rawHeadline === 'Blocked';
  const face = (value, delay) => (is2d6
    ? `<span class="die${outcome === 'lose' ? ' hatch' : ''}" style="--d:${delay}s;background-color:${outcomeFill(outcome)};color:${inkFor(outcome)}">${escapeHtml(value)}</span>`
    : d20BannerFace(value, delay, outcome));
  const isAttack = event.source === 'combat' && (rawHeadline === 'Hit' || rawHeadline === 'Miss') && dice.length === 2;
  if (isAttack) {
    return `<div class="event-roll-pair">
      <div><small aria-hidden="true">${SYM.attack}</small>${face(dice[0], 0)}</div>
      <div><small aria-hidden="true">${DEFENDER_MARK}</small>${face(dice[1], 0.15)}</div>
    </div>`;
  }
  return `<div class="event-dice">${dice.map((value, i) => face(value, i * 0.15)).join(' ')}</div>`;
}

// the HTML of a big banner for an event
export function eventCardHtml(event) {
  const source = SOURCE_STYLE[event.source] || SOURCE_STYLE.general;
  const rawHeadline = event.headline || 'Something happened';
  const youDefend = event.source === 'combat' && event.target === myIndex();
  const line = symbolLine(event, rawHeadline, youDefend);
  return `<div class="event-card" style="${escapeHtml(bannerFillStyle(event))}" role="img" aria-label="${escapeHtml(eventSpokenText(event))}">
    <div class="event-source" aria-hidden="true">${source.icon}${youDefend ? ` ${DEFENDER_MARK}` : ''}</div>
    <div class="event-headline" aria-hidden="true">${markV(escapeHtml(line))}</div>
    ${whoLine(event)}${diceBlock(event, rawHeadline)}
  </div>`;
}

// the words of the event, put into the live region for screen readers
export function announce(event) {
  const live = el('live');
  if (live) live.textContent = eventSpokenText(event);
}

// a small chip in the side stack, for an event that does not matter to this player
export function showSideChip(event, source) {
  const stack = el('sideStack');
  const chip = document.createElement('div');
  chip.className = 'side-chip';
  chip.style.setProperty('--frame', frameFor(source));
  const line = symbolLine(event, event.headline || '', event.target === myIndex());
  chip.textContent = `${(SOURCE_STYLE[source] || SOURCE_STYLE.general).icon} ${line}`;
  chip.setAttribute('aria-label', eventSpokenText(event));
  stack.appendChild(chip);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  setTimeout(() => chip.remove(), TIMING.minorChipMs);
}

// shows a card listing recent events, on first load or after missed updates
export function showRecap(events, title) {
  const card = document.createElement('div');
  card.className = 'side-card';
  const lines = events.slice(0, 8).map(event => {
    const detail = event.detail ? ` <span class="muted">· ${escapeHtml(event.detail)}</span>` : '';
    return `<div>${escapeHtml(event.headline)}${detail}</div>`;
  }).join('');
  card.innerHTML = `<b>${escapeHtml(title)}</b>${lines}<div class="muted">Full history is in the 📜 Log.</div>`;
  el('sideStack').appendChild(card);
  setTimeout(() => card.remove(), 9000);
}

// the sound for an event, chosen from its headline and source
export function outcomeSoundName(event) {
  const headline = event.headline || '';
  if (headline === 'Natural 20!' || event.source === 'nuke') return 'fanfare';
  if (event.source === 'turn') return 'turn';
  if (['Defeated', 'Conceded', 'Disconnected'].includes(headline)
    || event.source === 'concede' || event.source === 'disconnect') return 'down';
  if (headline === 'Hit' || headline === 'Object lost') return 'hit';
  if (headline === 'Miss' || headline === 'Failed') return 'miss';
  if (headline === 'Through' || headline === 'Blocked') return 'clank';
  if (event.source === 'mind') return ['Resisted', 'Released', 'Freed'].includes(headline) ? 'miss' : 'mind';
  if (event.source === 'barrier') return 'clank';
  if (event.source === 'buy' || event.source === 'card' || headline.includes('Versa')) return 'coin';
  if (event.source === 'develop' || event.source === 'object' || event.source === 'hero') return 'chime';
  return 'tick';
}

// plays the sound for an event
export function playOutcomeSound(event) {
  SOUNDS[outcomeSoundName(event)]();
}

// whether the player has asked for less motion
export function motionReduced() {
  return document.body.classList.contains('reduce-motion');
}

// a message box that appears over the board and fades away
export function showFloat(html, extraClass = '', durationMs = 3000, frame = null) {
  const node = document.createElement('div');
  node.className = 'fx ' + extraClass;
  if (frame) node.style.setProperty('--frame', frame);
  node.innerHTML = markV(html);
  el('fx').appendChild(node);
  setTimeout(() => node.remove(), durationMs);
}

// a short flash over the whole board for the Apocalypse, with a fanfare
export function playApocalypseAnimation() {
  const svg = el('svg');
  svg.classList.remove('apoc-flash');
  void svg.offsetWidth;
  svg.classList.add('apoc-flash');
  setTimeout(() => svg.classList.remove('apoc-flash'), 1700);
  SOUNDS.fanfare();
  showFloat(`<span>☢</span> ${SYM.boom}`, 'nat', 2600);
}

// the signature moment: when a turn passes to the signed-in player, the turn badge pulses once
// and the turn sound plays. Skipped under reduce motion.
export function startOfMyTurnMoment() {
  if (motionReduced()) {
    SOUNDS.turn();
    return;
  }
  state.ui.turnPulse = true;
  SOUNDS.turn();
  setTimeout(() => {
    state.ui.turnPulse = false;
    const badge = document.querySelector('#top .badge');
    if (badge) badge.classList.remove('turn-pulse');
  }, 1200);
}

// the label on a roll card: what was rolled
export function rollLabel(event) {
  const headline = event.headline || '';
  if (headline === 'Through' || headline === 'Blocked') return '2d6 · barrier';
  if (event.source === 'combat' && event.dice.length === 2) return `${SYM.attack} d20 vs d20`;
  if (event.source === 'mind' && event.dice.length === 2) return `${SYM.mind} d20 vs d20`;
  if (event.source === 'move') return `${SYM.move} 2d6`;
  if (event.source === 'develop') return `${SYM.develop} d20`;
  return 'd20';
}

// the total shown under a roll card
export function rollTotalsHtml(event) {
  const dice = event.dice;
  const total = shownTotal(event);
  if (dice.length === 2 && total && total.kind === 'vs') {
    return `<div class="roll-pair">
      <div><small aria-hidden="true">${SYM.attack}</small>${total.a}</div>
      <div><small aria-hidden="true">${DEFENDER_MARK}</small>${total.b}</div>
    </div>`;
  }
  if (dice.length === 2) return `${dice[0] + dice[1]}`;
  return total ? `${total.a}` : `${dice[0]}`;
}

// a roll card: black, with a grey border until it is painted green or red
export function rollCardHtml(event) {
  const rawHeadline = event.headline || '';
  const is2d6 = event.source === 'move' || rawHeadline === 'Through' || rawHeadline === 'Blocked';
  const faces = event.dice.map(value => (is2d6
    ? d6Html(value, 'pending')
    : `<div class="roll-die d20-die" data-v="${escapeHtml(value)}" aria-hidden="true">${d20Svg(value, 'pending')}</div>`)).join('');
  const spoken = `${rollLabel(event)}: ${event.dice.join(' and ')}`;
  return `<div class="roll-card pending" role="img" aria-label="${escapeHtml(spoken)}">
    <div class="roll-label" aria-hidden="true">${escapeHtml(rollLabel(event))}</div>
    <div class="roll-dice">${faces}</div>
    <div class="roll-total" aria-hidden="true">${rollTotalsHtml(event)}</div>
  </div>`;
}

// paints a roll card green or red once its dice have finished tumbling
export function paintRoll(card, outcome) {
  const ink = inkFor(outcome);
  card.classList.remove('pending');
  card.classList.add(outcome);
  card.querySelectorAll('.d20-die').forEach(die => { die.innerHTML = d20Svg(Number(die.dataset.v), outcome); });
  card.querySelectorAll('.roll-die.d6').forEach(die => {
    die.style.backgroundColor = outcomeFill(outcome);
    die.style.color = ink;
    if (outcome === 'lose') die.classList.add('hatch');
  });
}

// shows a roll card, paints it when the tumble ends, then removes it
export function showRollStage(event) {
  const stage = el('rollStage');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = rollCardHtml(event);
  const card = wrapper.firstElementChild;
  stage.appendChild(card);
  const outcome = outcomeOf(event);
  setTimeout(() => { if (card.isConnected) paintRoll(card, outcome); }, TIMING.rollTumbleMs);
  setTimeout(() => card.remove(), TIMING.rollMs);
}

// whether an event is an attack or Mind Control between two heroes, so a projectile can fly
export function isProjectileEvent(event) {
  const heroes = (event.affected || []).filter(unit => unit.kind === 'hero');
  return PROJECTILE_HEADLINES.includes(event.headline) && heroes.length >= 2
    && (event.source === 'combat' || event.source === 'mind');
}

// draws a short projectile from the attacker to the target
export function animateProjectile(event) {
  const heroes = event.affected.filter(unit => unit.kind === 'hero');
  const attacker = state.game.heroes[heroes[0].i];
  const target = state.game.heroes[heroes[1].i];
  if (!attacker || !target) return;
  const [x1, y1] = heroPosition(attacker);
  const [x2, y2] = heroPosition(target);
  const colour = event.source === 'mind' ? '#c77dff' : '#ffe066';
  const impact = IMPACT_HEADLINES.includes(event.headline);
  const layer = el('animLayer');
  setViewBoxFor(layer);
  const beginImpact = `${TIMING.projectileMs / 1000}s`;
  layer.innerHTML = `<circle r="5" fill="${colour}">
      <animateMotion dur="${TIMING.projectileMs / 1000}s" fill="freeze" path="M${x1},${y1} L${x2},${y2}"/>
    </circle>`
    + (impact ? `<circle cx="${x2}" cy="${y2}" r="4" fill="none" stroke="${colour}" stroke-width="3">
      <animate attributeName="r" from="4" to="30" dur="0.5s" begin="${beginImpact}" fill="freeze"/>
      <animate attributeName="opacity" from="1" to="0" dur="0.5s" begin="${beginImpact}" fill="freeze"/>
    </circle>` : '');
  setTimeout(() => { el('animLayer').innerHTML = ''; }, TIMING.projectileMs + 800);
}

// shows one event as a big banner or a side chip, and returns how long to wait before the next
export function presentEvent(event) {
  const important = isImportantEvent(event);
  const source = SOURCE_STYLE[event.source] ? event.source : 'general';
  if (event.affected && event.affected.length) flashUnits(event.affected);
  announce(event);

  if (!important) {
    showSideChip(event, source);
    return TIMING.minorGapMs;
  }

  const hasDice = (event.dice || []).length > 0;
  if (hasDice) {
    SOUNDS.roll();
    showRollStage(event);
  }
  setTimeout(() => playOutcomeSound(event), hasDice ? 450 : 0);
  if (isProjectileEvent(event) && !motionReduced()) animateProjectile(event);
  showFloat(eventCardHtml(event), 'event slow', TIMING.importantBannerMs, frameFor(source));
  return TIMING.importantGapMs;
}

// shows the next queued event, then waits before showing the one after it
export function pumpBanners() {
  if (state.bannerBusy) return;
  const next = state.bannerQueue.shift();
  if (!next) return;
  state.bannerBusy = true;
  const wait = presentEvent(next);
  setTimeout(() => { state.bannerBusy = false; pumpBanners(); }, wait);
}

// queues events so banners appear one at a time, keeping the important ones when the queue is full
export function enqueueEvents(events) {
  const usable = events.filter(event => event && event.headline);
  mergeRollEvents(usable).forEach(event => state.bannerQueue.push(event));
  while (state.bannerQueue.length > TIMING.bannerQueueMax) {
    const minorIndex = state.bannerQueue.findIndex(event => !isImportantEvent(event));
    state.bannerQueue.splice(minorIndex >= 0 ? minorIndex : 0, 1);
  }
  pumpBanners();
}

// drops every queued banner, used when the player leaves a room
export function clearBannerQueue() {
  state.bannerQueue = [];
}
