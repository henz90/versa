/* The panels around the board: the top bar, the Buy panel, the hand, the bottom bar,
   the wheel's position, the to-do list, the game log and the modal dialogs. */

import {
  SKILL_NAME, SKILL_ICON, CARD_NAME, CARD_ICON, RULES, ROUND, ROUND_PHASE_NAME_UNUSED,
  OFFLINE_LIMIT_SECONDS, OFFLINE_SHOW_SECONDS, MUST_CHOOSE, LOADOUT_NAME_PATTERN,
} from './config.js';
import { state, settings, setMessage } from './state.js';
import { escapeHtml, markV, textWithV, colourLog, isValidUsername } from './escape.js';
import {
  myIndex, isMyTurn, isAlive, isDefeated, heroCount, objectCount, heroName, heroLabel,
  boardStepDone, actsForMe, canAct, ownerHasRemovableTile, phaseName, isControllingNow,
  currentRemovalOwner,
} from './rules.js';
import { screenPoint } from './board-position.js';
import { layoutMode } from './layout.js';
import { el } from './dom.js';
import { hexX, hexY } from './geometry.js';

// fills in saved hero and object names, padded to three each, for the name fields
export function padLoadout(saved) {
  const padded = list => [0, 1, 2].map(i => (list || [])[i] || '');
  return { heroes: padded(saved?.hero_names), objects: padded(saved?.object_names) };
}

// the seconds a player has been silent, from the last presence check
export function secondsSilent(uid) {
  const base = state.presenceSeen.data[uid];
  if (base == null) return null;
  return Number(base) + (Date.now() - state.presenceSeen.at) / 1000;
}

// the warnings about players who have gone quiet, shown in the top bar
export function offlineBadgesHtml() {
  if (!state.game) return '';
  return state.game.players.map((p, i) => {
    if (p.uid === state.me || !isAlive(i)) return '';
    const silent = secondsSilent(p.uid);
    if (silent === null || silent < OFFLINE_SHOW_SECONDS) return '';
    const left = Math.max(0, Math.ceil(OFFLINE_LIMIT_SECONDS - silent));
    return `<span class="alert">⏱ ${escapeHtml(p.name)} offline: ${left}s</span>`;
  }).join('');
}

// the top bar: whose turn, the round and phase, and each player's Versa and heroes
export function drawTop() {
  const game = state.game;
  const current = game.players[game.current];
  const chips = game.players.map((p, i) => {
    const status = isAlive(i) ? `${heroCount(i)} heroes` : 'out';
    return `<span class="pchip ${i === game.current ? 'cur' : ''} ${isAlive(i) ? '' : 'out'}" style="--c:${state.playerColors[i]}">${escapeHtml(p.name)} · ${markV(p.versa + ' V')} · ${status}</span>`;
  }).join('');
  const endButton = isMyTurn()
    ? `<button class="endb top-end" data-action="end-turn" ${boardStepDone() ? '' : 'disabled'}>➜ End Turn</button>`
    : '';
  const backButton = game.winner && state.ui.gameOverDismissed
    ? '<button class="endb" data-action="leave">Back to lobby</button>' : '';
  const exitButton = !game.winner && state.room
    ? '<button class="concede" data-action="leave">Concede</button>'
    : '<button class="ghost" data-action="leave">Leave</button>';
  el('top').innerHTML = `
    <span class="badge" style="background:${state.playerColors[game.current]}">${escapeHtml(current.name)}'s turn</span>
    <span class="chip">Round ${game.round} · ${phaseName()}</span>
    ${game.apocalypse ? '<span class="alert">☢ Apocalypse</span>' : ''}
    ${game.winner ? `<span class="alert">🏆 ${escapeHtml(game.winner)}</span>` : ''}
    <span id="offline">${offlineBadgesHtml()}</span>
    <span style="flex:1"></span>
    ${endButton}
    ${backButton}
    ${exitButton}
    ${chips}`;
  el('defeated').style.display = isDefeated() && !game.winner ? 'block' : 'none';
}

// the costs and reasons for each buy option; a reason is shown when the option is greyed out
export function buyOptions() {
  const mine = myIndex();
  const player = state.game.players[mine >= 0 ? mine : state.game.current];
  const turnReason = () => {
    if (!isMyTurn()) return 'Your turn only';
    if (!boardStepDone()) return 'Finish your board step first';
    return '';
  };
  const reasonFor = (cost, extra = '') => turnReason() || extra
    || (player.versa < cost ? `Needs ${cost} V (you have ${player.versa})` : '');
  const apocalypse = state.game.apocalypse ? 'Apocalypse: no new barriers or objects' : '';
  const objectsFull = objectCount(mine) >= RULES.maxObjects ? `Object limit (${RULES.maxObjects}) reached` : '';
  const heroesFull = heroCount(mine) >= RULES.maxHeroes ? `Hero limit (${RULES.maxHeroes}) reached` : '';
  const option = (key, cls, icon, label, cost, reason) => ({ key, cls, icon, label, cost, reason });
  return {
    structures: [
      option('barrier', 'b-stone', '🛑', 'Barrier', '5V', reasonFor(RULES.actionCost, apocalypse)),
      option('obj', 'b-gold', '🔮', 'Object', '5V', reasonFor(RULES.actionCost, apocalypse || objectsFull)),
      option('hero', 'b-hero', '👤', 'Hero', '30V', reasonFor(RULES.heroCost, heroesFull)),
    ],
    skills: [
      option('skill:str', 'b-str', '✊', 'STR', '5V', reasonFor(RULES.actionCost)),
      option('skill:def', 'b-def', '🛡️', 'DEF', '5V', reasonFor(RULES.actionCost)),
      option('skill:rng', 'b-rng', '🏹', 'RNG', '5V', reasonFor(RULES.actionCost)),
      option('skill:int', 'b-int', '🧠', 'INT', '5V', reasonFor(RULES.actionCost)),
    ],
  };
}

// the one-line instruction under the Buy panel, for whatever mode is active
export function buyStatusText() {
  if (state.ui.mode === 'barrier') return 'Tap a tile next to one of your heroes';
  if (state.ui.mode === 'obj' || state.ui.mode === 'hero') return 'Tap a tile with one of your heroes';
  if (state.ui.mode === 'buyskill') return `Tap one of your heroes or objects to add ${SKILL_NAME[state.ui.devSkill]}`;
  return 'Greyed options: tap one to see why it is unavailable';
}

// the Buy panel: structures, skills, the player's Versa, and the sell drop zone
export function drawBuySide() {
  const mine = myIndex();
  const viewer = state.game.players[mine >= 0 ? mine : state.game.current];
  const opts = buyOptions();
  const isActive = item => item.key === state.ui.mode
    || (item.key.startsWith('skill:') && state.ui.mode === 'buyskill' && state.ui.devSkill === item.key.slice(6));
  const option = item => {
    const label = item.reason ? `${item.label}, ${item.cost}, unavailable: ${item.reason}` : `${item.label}, ${item.cost}`;
    return `<button class="bopt ${item.cls} ${isActive(item) ? 'on' : ''} ${item.reason ? 'is-off' : ''}"
      data-buy="${escapeHtml(item.key)}" data-reason="${escapeHtml(item.reason || '')}" aria-disabled="${!!item.reason}"
      aria-pressed="${isActive(item)}" title="${escapeHtml(item.reason || `${item.label} · ${item.cost}`)}" aria-label="${escapeHtml(label)}">
      <span class="bo-icon" aria-hidden="true">${item.icon}</span><span class="bo-label">${escapeHtml(item.label)}</span><span class="bo-cost">${markV(item.cost)}</span>
    </button>`;
  };
  const body = `<div class="bsection">Structures</div>
       <div class="bgrid" style="grid-template-columns:repeat(3,1fr)">${opts.structures.map(option).join('')}</div>
       <div class="bsection">Skills</div>
       <div class="bgrid" style="grid-template-columns:repeat(4,1fr)">${opts.skills.map(option).join('')}</div>
       <div class="buy-status" aria-live="polite">${escapeHtml(buyStatusText())}</div>`;
  const sellHint = state.pointer.sellHint;
  const sellText = sellHint != null ? `Drop to Sell: +${sellHint}V` : '';
  const sellZone = `<div id="sellzone">${sellText}<small>sold for cash, card returns to the deck</small></div>`;
  el('buyside').innerHTML = `<div class="vside">${markV(viewer.versa + ' V')}</div><div class="buy-body">${body}</div>${sellZone}`;
}

// updates the sell zone text while a card is dragged, without redrawing the panel
export function updateSellZone() {
  const zone = el('sellzone');
  if (!zone) {
    drawBuySide();
    return;
  }
  const sellHint = state.pointer.sellHint;
  zone.firstChild.textContent = sellHint != null ? `Drop to Sell: +${sellHint}V` : '';
}

// the HTML of one traversal card in the hand
export function cardHtml(card, index) {
  const name = CARD_NAME[card] || card;
  const icon = CARD_ICON[card] || '?';
  const value = card === 'v' ? '5 Versa' : '+1 point';
  return `<div class="tcard ${escapeHtml(card)}" data-card="${index}" role="img" aria-label="${escapeHtml(name)} card, ${value}">
    <div class="tc-top" aria-hidden="true">${card === 'v' ? 'Versa' : 'Skill'}</div>
    <div class="tc-art" aria-hidden="true">${icon}</div>
    <div class="tc-name" aria-hidden="true">${escapeHtml(name)}</div>
    <div class="tc-value" aria-hidden="true">${value}</div>
  </div>`;
}

// the hand: the player's own traversal cards, or a note when there are none
export function drawHand() {
  const hand = el('hand');
  const mine = myIndex();
  if (mine < 0) {
    hand.innerHTML = '<span class="muted">Spectating</span>';
    return;
  }
  const cards = state.game.players[mine].hand || [];
  if (!cards.length) {
    hand.innerHTML = '<span class="muted small">No traversal cards yet. Move a hero to draw one.</span>';
    return;
  }
  hand.innerHTML = cards.map((card, i) => cardHtml(card, i)).join('');
}

// the bottom bar: the message, End, the phone drawer buttons, and the utility buttons
export function drawBottomBar() {
  const mode = layoutMode();
  const bottom = el('bottom');
  const phonePortrait = mode === 'phone-portrait';
  const drawer = state.ui.drawer;
  const collapsed = phonePortrait ? !drawer : (mode !== 'phone-landscape' && state.ui.botMinimized);
  bottom.classList.toggle('minimized', collapsed);
  bottom.dataset.drawer = phonePortrait && drawer ? drawer : '';

  const handSize = state.game && myIndex() >= 0 ? (state.game.players[myIndex()].hand || []).length : 0;
  const endEnabled = !!state.game && isMyTurn() && boardStepDone();
  const muteLabel = settings.muted ? 'Unmute sound' : 'Mute sound';
  el('bar').innerHTML = `
    <span class="msg" aria-live="polite">${textWithV(state.ui.message)}</span>
    <button class="endb bar-end" data-action="end-turn" ${endEnabled ? '' : 'disabled'} aria-label="End turn">➜ End</button>
    <button class="sbtn phone-only" data-action="drawer-hand" aria-expanded="${drawer === 'hand'}" aria-label="Hand, ${handSize} cards">🃏 ${handSize}</button>
    <button class="sbtn phone-only" data-action="drawer-buy" aria-expanded="${drawer === 'buy'}" aria-label="Buy panel">🛒 Buy</button>
    <button class="sbtn" data-action="toggle-mute" aria-pressed="${settings.muted}" aria-label="${muteLabel}" title="${muteLabel}">${settings.muted ? '🔇' : '🔊'}</button>
    <button class="sbtn" data-action="open-help" aria-label="Help and tutorial" title="Help and tutorial">❓</button>
    <button class="sbtn" data-action="open-legend" aria-label="Legend of symbols" title="Legend of symbols">🗺</button>
    <button class="sbtn" data-action="open-settings" aria-label="Settings" title="Settings">⚙</button>
    <button class="sbtn" data-action="open-log" title="Game log">📜 Log</button>
    <button class="sbtn desk-only" data-action="minimize" aria-expanded="${!state.ui.botMinimized}">${state.ui.botMinimized ? '▴ Expand' : '▾ Minimize'}</button>`;
  el('handcol').querySelector('.sec-head').textContent = `🃏 Hand (${handSize})`;
}

// the wheel menu, placed over the tile it belongs to
export function drawWheel() {
  const wheelEl = el('wheel');
  const wheel = state.ui.wheel;
  if (!wheel) {
    wheelEl.style.display = 'none';
    wheelEl.innerHTML = '';
    return;
  }
  const [x, y] = screenPoint(hexX(wheel.cube), hexY(wheel.cube));
  wheelEl.style.left = x + 'px';
  wheelEl.style.top = y + 'px';
  wheelEl.style.display = 'block';
  const count = wheel.items.length;
  const buttons = wheel.items.map((item, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
    const emojiClass = wheel.kind === 'emoji' ? 'emoji-btn' : '';
    return `<button class="wbtn ${emojiClass} ${item.on ? 'on' : ''}" data-w="${escapeHtml(item.v)}" ${item.dis ? 'disabled' : ''}
      aria-label="${escapeHtml(item.t || item.ic)}"
      style="left:calc(${Math.cos(angle).toFixed(3)} * var(--r));top:calc(${Math.sin(angle).toFixed(3)} * var(--r))">
      <span class="wi" aria-hidden="true">${escapeHtml(item.ic)}</span>${item.t ? `<small>${markV(escapeHtml(item.t))}</small>` : ''}</button>`;
  }).join('');
  const closeButton = MUST_CHOOSE.includes(wheel.kind)
    ? '' : '<button class="wbtn wx" data-w="x" aria-label="Close menu">✕</button>';
  wheelEl.innerHTML = buttons + closeButton;
}

// the cancel button shown while a placement or buy mode is waiting for a tap
export function drawCancel() {
  const cancel = el('cx');
  const mode = state.ui.mode;
  const show = !!mode && mode !== 'place' && mode !== 'remove' && !state.ui.wheel;
  cancel.style.display = show ? 'block' : 'none';
  cancel.innerHTML = show
    ? '<button class="xbtn" data-action="cancel" aria-label="Cancel current action">✕</button>' : '';
}

// the to-do list: what the player can still do this turn
export function todoItems() {
  const game = state.game;
  if (game.winner) return [{ text: game.winner }];
  if (isDefeated()) return [{ text: 'You have been defeated. Watch the game.' }];
  if (!isMyTurn() && !isControllingNow()) return [{ text: `Waiting for ${game.players[game.current].name}…` }];
  const myTurn = isMyTurn();
  const items = [];

  if (myTurn && game.round <= ROUND.placementEnds) {
    items.push({ text: 'Place a tile', done: boardStepDone() });
  }

  if (myTurn && game.round >= ROUND.declineFrom && game.removalPlan.length) {
    items.push({
      text: 'Remove one tile per player',
      head: true,
      done: boardStepDone(),
      children: game.removalPlan.map(owner => ({
        text: owner === game.current ? 'One of your tiles' : `${game.players[owner].name} (eliminated)`,
        done: !game.removalOrder.includes(owner) || !ownerHasRemovableTile(owner),
      })),
    });
  }

  if (boardStepDone()) {
    game.heroes.filter(h => h.alive && actsForMe(h)).forEach(hero => {
      const used = type => hero.tries.some(t => t.type === type && !t.fail);
      const name = hero.mindControl ? `${heroLabel(hero)} (controlled)` : heroName(hero);
      items.push({
        text: `${name}: ${hero.actions} action${hero.actions === 1 ? '' : 's'} left`,
        head: true,
        done: hero.actions < 1,
        children: [
          { text: 'Move', done: used('move'), dim: !used('move') && !canAct(hero, 'move') },
          {
            text: game.round < ROUND.attacksFrom ? 'Attack (from round 4)' : 'Attack or Mind Control',
            done: used('attack') || used('mind'),
            dim: !used('attack') && !used('mind') && !canAct(hero, 'attack'),
          },
          { text: 'Develop', done: used('develop'), dim: !used('develop') && !canAct(hero, 'develop') },
        ],
      });
    });
  }

  if (myTurn && game.heroes.some(h => h.alive && h.player === myIndex() && h.mindControl && !h.mindControl.ceded)) {
    items.push({ text: 'Click a hero under Mind Control to cede it, or leave it with its controller' });
  }

  if (myTurn && boardStepDone() && !game.heroes.some(h => h.alive && actsForMe(h) && h.actions > 0)) {
    items.push({ text: 'Nothing left: end your turn', head: true });
  }

  if (state.ui.wheel) {
    items.unshift({ text: `Choose: ${state.ui.wheel.items.map(i => i.t || i.ic).join(' · ')}`, temp: true });
  }
  return items;
}

// one line of the to-do list, with its sub-items; newly finished lines get a strike animation once
export function todoLineHtml(item, depth) {
  const key = `${state.game.round}|${state.game.current}|${item.text}`;
  const animate = item.done && !state.seenTodo.has(key);
  if (item.done) state.seenTodo.add(key);
  const classes = ['td', depth ? 'sub' : '', item.head ? 'head' : '', item.temp ? 'temp' : '',
    item.dim ? 'dim' : '', item.done ? 'done' : '', animate ? 'strike' : ''].join(' ');
  const mark = item.done ? '☑' : item.head ? '▸' : '☐';
  const children = (item.children || []).map(child => todoLineHtml(child, depth + 1)).join('');
  return `<div class="${classes}">${mark} ${textWithV(item.text)}</div>${children}`;
}

// the to-do panel
export function drawTodo() {
  el('todo').innerHTML = '<b>To do</b>' + todoItems().map(item => todoLineHtml(item, 0)).join('');
}

// groups the log's lines by turn, oldest first
export function logRounds() {
  const oldestFirst = [...(state.game.log || [])].reverse();
  const rounds = [{ title: 'Start of game', lines: [] }];
  oldestFirst.forEach(line => {
    const turnStart = line.text.match(/^—\s*(.+?)\s*·\s*Round\s+(\d+)/);
    if (turnStart) rounds.push({ title: `Round ${turnStart[2]} · ${turnStart[1]}`, lines: [] });
    rounds[rounds.length - 1].lines.push(line);
  });
  return rounds.filter(round => round.lines.length > 0);
}

// the game log HTML: the newest round first, each line in its player's colour
export function logHtml() {
  const rounds = logRounds().reverse();
  if (!rounds.length) return '<div>No events yet.</div>';
  return rounds.map((round, index) => {
    const lines = [...round.lines].reverse().map(line => {
      const color = line.player >= 0 ? state.playerColors[line.player] : '#b0b0c4';
      return `<div style="color:${color}">${colourLog(line.text)}</div>`;
    }).join('');
    return `<details ${index === 0 ? 'open' : ''}>
      <summary>${escapeHtml(round.title)} <span class="muted">(${round.lines.length})</span></summary>
      ${lines}
    </details>`;
  }).join('');
}

// the name fields for the hero or object names on the main screen
export function nameFields(group, placeholder) {
  return state.loadoutDraft[group].map((name, slot) =>
    `<input class="name-in" aria-label="${placeholder} name ${slot + 1}" data-loadout="${group}" data-slot="${slot}" maxlength="12"
      placeholder="${placeholder} ${slot + 1}" value="${escapeHtml(name)}">`).join('');
}

// the HTML of the room-lobby panel, showing players and the start button
function roomHtml() {
  const row = state.roomRow;
  const players = row.players || [];
  const startButton = row.host === state.me
    ? `<div class="row"><button class="endb" data-action="start-game" ${players.length < 2 ? 'disabled' : ''}>Start game</button></div>`
    : '<div class="muted">Waiting for the host to start…</div>';
  return `<div class="card"><h2 style="margin:0">Room</h2>
    <div class="muted">Click the code to copy it, then share it with your opponent. The first player is chosen at random.</div>
    <div class="row"><button class="roomcode" data-action="copy-room" title="Copy room code">${escapeHtml(state.room)}</button></div>
    <div>${players.map((p, i) => `<div style="color:${state.playerColors[i]}">${i + 1}. ${escapeHtml(p.name)}${p.uid === state.me ? ' (you)' : ''}</div>`).join('')}</div>
    <div class="muted">Names are set on the main screen and copied in when the game starts.</div>
    ${startButton}
    <div class="row"><button class="ghost" data-action="leave">Leave room</button></div></div>`;
}

// the modal dialog: username, main screen, room, loading, log or game over
export function drawModal() {
  const modal = el('modal');
  let html = '';

  if (state.ui.logOpen && state.game) {
    html = `<div class="card" role="dialog" aria-labelledby="logTitle">
      <h2 id="logTitle" style="margin:0">📜 Game log</h2>
      <div class="muted">Room code: <span class="plain-code">${escapeHtml(state.room)}</span></div>
      <div class="logfull">${logHtml()}</div>
      <div class="row"><button class="endb" data-action="close-log">Close</button></div></div>`;
  } else if (!state.username || !isValidUsername(state.username)) {
    html = `<div class="card"><h2 style="margin:0">VERSA</h2>
      <div class="muted">Choose a username (2 to 16 letters or numbers)</div>
      <input id="nameIn" maxlength="16" aria-label="Username">
      <div class="row"><button class="endb" data-action="save-name">Continue</button></div></div>`;
  } else if (!state.room) {
    if (!state.loadoutDraft) state.loadoutDraft = padLoadout(state.savedNames);
    html = `<div class="card"><h2 style="margin:0">Play VERSA</h2>
      <div class="muted">Playing as <b>${escapeHtml(state.username)}</b></div>
      <div class="muted">Your hero and object names are kept for every game. Blank names use the defaults.</div>
      <div class="name-row"><span>Heroes</span>${nameFields('heroes', 'Hero')}</div>
      <div class="name-row"><span>Objects</span>${nameFields('objects', 'Object')}</div>
      <div class="row"><button data-action="save-loadout">Save names</button></div>
      <div class="row"><button class="endb" data-action="create-room">Create room</button></div>
      <div class="row"><input id="codeIn" maxlength="6" placeholder="Room code" aria-label="Room code"><button data-action="join-room">Join room</button></div>
      <div class="row"><button class="ghost" data-action="rename">Change username</button></div></div>`;
  } else if (state.roomLoading || (!state.game && !state.roomRow)) {
    html = `<div class="card"><h2 style="margin:0">Loading room ${escapeHtml(state.room)}…</h2>
      <div class="row"><button class="ghost" data-action="leave">Back to lobby</button></div></div>`;
  } else if (!state.game && state.roomRow) {
    html = roomHtml();
  } else if (state.game && state.game.winner && !state.ui.gameOverDismissed) {
    html = `<div class="card"><h2 style="margin:0">🏆 ${escapeHtml(state.game.winner)}</h2>
      <div class="muted">The board stays visible so you can review the game. This room closes after an hour.</div>
      <div class="row">
        <button class="ghost" data-action="review-board">Review board</button>
        <button class="endb" data-action="leave">Back to lobby</button>
      </div></div>`;
  }

  modal.innerHTML = html;
  modal.style.display = html ? 'flex' : 'none';
  const nameInput = el('nameIn');
  if (nameInput) nameInput.value = state.username;
}

// the names allowed in the loadout fields, reused by the lobby's save check
export { LOADOUT_NAME_PATTERN, SKILL_ICON, SKILL_NAME, currentRemovalOwner, ROUND_PHASE_NAME_UNUSED };

// the points of an unused import list, kept so the module keeps its exports stable
export const UNUSED_SETTINGS_REFERENCE = settings;
