/* =============================================================
   VERSA client
   The server owns every rule. This file decides what to show,
   what to offer, and what to send. Sections:
     1 configuration     2 utilities      3 hex geometry
     4 client state      5 lookups        6 action rules
     7 server state      8 presence       9 lobby
    10 turn controls    11 placement     12 movement
    13 combat           14 develop/buy   15 UI helpers
    16 zoom/pan         17 board pointer 18 hand and selling
    19 board clicks     20 wheel menus   21 feedback/tooltips
    22 board drawing    23 panels        24 to-do
    25 modal            26 render        27 buttons      28 wiring
    29 startup
   ============================================================= */

/* =============================================================
   1. CONFIGURATION
   ============================================================= */

const SUPABASE_URL = 'https://jbdfcqqobtatxmmhmipa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_74fKEI9ilefM-7pR8A8bnw_cIYLsfqu';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PLAYER_COLORS = ['#e4572e', '#29b6f6', '#66bb6a', '#ffca28', '#ab47bc', '#ff8a65'];
const HERO_COLORS = ['#ff8fab', '#7cf0ff', '#c3f584', '#ffd166', '#b28dff', '#ffa94d', '#f1faee', '#90e0ef', '#e76f51', '#2ec4b6', '#f72585', '#caf0f8', '#fbf8cc', '#a0c4ff', '#ffadad', '#9bf6ff', '#bdb2ff', '#ffc6ff'];
const TILE_COLORS = { str: '#7a2e38', def: '#24527a', rng: '#4f6b26', int: '#5b3478', bar: '#7a5a22' };
const NEUTRAL_FILL = '#2a2a38';
const GROUND_ZERO_FILL = '#4d4118';
const UNOWNED_STROKE = '#c9a227';
const UNOCCUPIED_BARRIER = '#9a9a9a';
const APOCALYPSE_RED = '#4a1d1d';
const OFFLINE_LIMIT_S = 60;
const OFFLINE_SHOW_S = 10;

const SKILLS = ['str', 'def', 'rng', 'int'];
const SKILL_ICON = { str: '✊', def: '🛡️', rng: '🏹', int: '🧠', bar: '🛑' };
const SKILL_NAME = { str: 'Strength', def: 'Defense', rng: 'Range', int: 'Intelligence', bar: 'Barrier' };
const CARD_NAME = { str: 'Strength', def: 'Defense', rng: 'Range', int: 'Intelligence', v: '5 Versa' };
const CARD_ICON = { str: '✊', def: '🛡️', rng: '🏹', int: '🧠', v: '💰' };
const CARD_SELL_VALUE = { str: 2, def: 2, rng: 2, int: 2, v: 5 };
const EMOJIS = ['😂', '👏', '😱', '🔥', '🤔', '💀', '🎯', '🙃'];

const DIRECTIONS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
const HEX_RADIUS = 36;
const NUKE_OFFSET = 21;
const NUKE_RADIUS = 7;
const APOCALYPSE_SYMBOL_SIZE = Math.round(11 * Math.sqrt(3) * HEX_RADIUS);

// zoom limits in board units across the visible width; phones can zoom closer
const isPhone = () => window.matchMedia('(max-width: 700px)').matches;
const zoomMin = () => (isPhone() ? 120 : 380);
const zoomMax = () => (isPhone() ? 4000 : 1800);

const ROUND = { placementEnds: 5, attacksFrom: 4, declineFrom: 7 };
const RULES = { maxHeroes: 3, maxObjects: 3, maxSkill: 5, maxBarrier: 12, actionCost: 5, heroCost: 30 };

// banner timing: each event card stays for EVENT_CARD_MS and the next one starts EVENT_GAP_MS later
const EVENT_CARD_MS = 5200;
const EVENT_GAP_MS = 2600;
// how long units named in an event stay highlighted on the board
const FLASH_MS = 4200;

// frame colour and icon for each event source; keys must match add_event's list in sql/20_helpers.sql
const SOURCE_STYLE = {
  combat: { icon: '⚔️', label: 'Combat' },
  mind: { icon: '🧠', label: 'Mind Control' },
  barrier: { icon: '🛑', label: 'Barrier' },
  object: { icon: '🔮', label: 'Object' },
  hero: { icon: '🧍', label: 'Hero' },
  develop: { icon: '🛠', label: 'Develop' },
  card: { icon: '💰', label: 'Traversal card' },
  nuke: { icon: '☢', label: 'Nuke' },
  turn: { icon: '➜', label: 'Turn' },
  concede: { icon: '🏳', label: 'Concede' },
  disconnect: { icon: '⏱', label: 'Disconnect' },
  move: { icon: '🏃', label: 'Move' },
  general: { icon: '•', label: '' },
};

// the headline a defender sees instead of the attacker's wording
const DEFENDER_HEADLINES = {
  Hit: 'You were hit',
  Miss: 'You held',
  Through: 'Barrier failed',
  Blocked: 'Barrier held',
  Defeated: 'Your hero fell',
  'Object lost': 'Your object fell',
};

const MUST_CHOOSE = ['moveBonus'];
const DISCOVERY_CHOICE = 'DISCOVERY_CHOICE';
const LOADOUT_NAME_PATTERN = /^[A-Za-z0-9 ]{0,12}$/;

/* =============================================================
   2. UTILITIES
   ============================================================= */

const el = id => document.getElementById(id);
const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const markV = html => html.replace(/(\d+) ?V\b/g, '$1<span class="vs">V</span>');
const textWithV = text => markV(escapeHtml(text));
const dieHtml = (value, delay) => `<span class="die" style="--d:${delay}s">${value}</span>`;
const isValidName = name => /^[A-Za-z0-9]{2,16}$/.test(name);

// one pass over a log line: each kind of thing gets its own colour
// groups: 1 Versa amount, 2 barrier level, 3 hero label, 4 object, 5 barrier word, 6 damage word, 7 plain number
const LOG_RULE = /(\d+\s?V\b)|(\bL\d+\b)|(\bH\d\b)|(\bobjects?\b)|(\bbarriers?\b)|(\b(?:hit|hits|miss|blocked|dies|destroyed|lost|damage|killed)\b)|(\b\d+\b)/gi;

function colourLog(text) {
  return escapeHtml(text).replace(LOG_RULE, (match, versa, barLevel, hero, object, barrierWord, damage, number) => {
    if (versa) return `<span class="lg-v">${match}</span>`;
    if (barLevel || barrierWord) return `<span class="lg-bar">${match}</span>`;
    if (hero) return `<span class="lg-hero">${match}</span>`;
    if (object) return `<span class="lg-obj">${match}</span>`;
    if (damage) return `<span class="lg-dmg">${match}</span>`;
    if (number) return `<span class="lg-num">${match}</span>`;
    return match;
  });
}

/* =============================================================
   3. HEX GEOMETRY
   Tiles use cube coordinates [x, y, z]. Map keys look like "x,y,z".
   ============================================================= */

const cubeKey = cube => cube.join(',');
const keyToCube = key => key.split(',').map(Number);
const sameTile = (a, b) => cubeKey(a) === cubeKey(b);
const cubeDistance = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 2;
const neighbours = cube => DIRECTIONS.map(d => [cube[0] + d[0], cube[1] + d[1], cube[2] + d[2]]);
const hexX = cube => Math.sqrt(3) * HEX_RADIUS * (cube[0] + cube[2] / 2);
const hexY = cube => 1.5 * HEX_RADIUS * cube[2];
const nukePoint = cube => [hexX(cube) - NUKE_OFFSET, hexY(cube) + NUKE_OFFSET];

// corners of a pointy-top hexagon, optionally at a smaller radius
function hexPoints(cube, radius = HEX_RADIUS - 4) {
  return [0, 1, 2, 3, 4, 5].map(i => {
    const angle = Math.PI / 3 * i + Math.PI / 6;
    return (hexX(cube) + radius * Math.cos(angle)).toFixed(1) + ',' + (hexY(cube) + radius * Math.sin(angle)).toFixed(1);
  }).join(' ');
}

/* =============================================================
   4. CLIENT STATE
   G             shared game state, written only by the server
   PRIV          this player's hand, pool, and the types of tiles they placed
   presenceSeen  seconds since each player's last heartbeat, as the server measured them
   savedNames    this player's hero and object names, kept across games
   loadoutDraft  names being typed in the lobby, kept while the modal redraws
   flashKeys     units named in the latest event, e.g. 'h2' or 'o0', highlighted briefly
   ui            local interaction state: open menus, the active mode, messages
   ============================================================= */

let G = null;
let PRIV = null;
let ME = null;
let ROOM = null;
let ROOM_ROW = null;
let channel = null;
let roomLoading = false;
let username = localStorage.getItem('versa-name') || '';
let view = { cx: 0, cy: 0, zoom: 900 };
let pan = null;
let drag = null;
let cardDrag = null;
let sellHint = null;
let suppressClick = false;
let botMinimized = false;
let logOpen = false;
let gameOverDismissed = false;
let tooltips = {};
let presenceSeen = { data: {}, at: 0 };
let tick = 0;
let lastAnimatedSeq = null;
let savedNames = null;
let loadoutDraft = null;
let flashKeys = new Set();
let flashTimer = null;
const seenTodo = new Set();

const touches = new Map();
let pinch = null;

const ui = {
  mode: '',
  selectedIndex: null,
  devType: null,
  devSkill: 'str',
  wheel: null,
  carry: null,
  message: '',
};

/* =============================================================
   5. LOOKUPS
   Read-only questions about the game state.
   ============================================================= */

const tileAt = cube => G.tiles[cubeKey(cube)];
const heroesAt = cube => G.heroes.filter(h => h.alive && sameTile(h.c, cube));
const objectsAt = cube => G.objs.filter(o => o.alive && sameTile(o.c, cube));
const nukeAt = cube => G.objs.find(o => o.alive && o.nuke && sameTile(o.c, cube));
const objectCount = player => G.objs.filter(o => o.alive && !o.nuke && o.p === player).length;
const isAlive = player => G.heroes.some(h => h.alive && h.p === player);
const myIndex = () => (G ? G.pl.findIndex(p => p.uid === ME) : -1);
const isMine = unit => unit.p === myIndex();
const isMyTurn = () => !!G && !G.over && G.pl[G.cur]?.uid === ME;
const isDefeated = () => myIndex() >= 0 && !isAlive(myIndex());
const selectedHero = () => (ui.selectedIndex == null ? null : G.heroes[ui.selectedIndex] || null);

// a hero's name from the player's saved names, or the default H1, H2, H3
const heroName = hero => G.pl[hero.p].hn?.[hero.k - 1] || `H${hero.k}`;
const heroLabel = hero => `${G.pl[hero.p].name} · ${heroName(hero)}`;
const heroIndex = hero => G.heroes.indexOf(hero);
const unitRef = unit => (G.heroes.includes(unit) ? { kind: 'h', i: G.heroes.indexOf(unit) } : { kind: 'o', i: G.objs.indexOf(unit) });
const unitFromRef = ref => (ref.kind === 'h' ? G.heroes[ref.i] : G.objs[ref.i]);
const carryable = hero => objectsAt(hero.c);
const maxRangeWith = (hero, objects) => hero.s.rng + Math.max(0, ...objects.map(o => o.s.rng || 0));
const reach = hero => maxRangeWith(hero, carryable(hero));

const isControllingNow = () => !!G && !G.over && G.cur !== myIndex()
  && G.heroes.some(h => h.alive && h.p === G.cur && h.mc && h.mc.ceded && h.mc.by === myIndex());

const actsForMe = hero => !!G && !G.over && hero.alive && (
  (isMine(hero) && isMyTurn() && !hero.mc)
  || (!!hero.mc && hero.mc.ceded && hero.mc.by === myIndex() && hero.p === G.cur));

const combatLock = hero => (hero.t.find(x => x.type === 'attack' || x.type === 'mind') || {}).type || null;

const phaseName = () => {
  if (G.rd <= 3) return 'Peace · Growth';
  if (G.rd <= ROUND.placementEnds) return 'War · Growth';
  if (G.rd === 6) return 'Stagnation';
  return 'Decline';
};

const knowsTileType = (tile, mine) => !!tile.disc || (tile.own === mine && tile.sk != null);
const barrierIsMine = (tile, hero) => tile.barOwn === hero.p || heroesAt(tile.c).some(h => h.p === hero.p);
const barrierColor = cube => {
  const hero = heroesAt(cube)[0];
  return hero ? PLAYER_COLORS[hero.p] : UNOCCUPIED_BARRIER;
};

/* =============================================================
   6. ACTION RULES
   Whether a board step or hero action can be offered right now.
   The server checks the same rules again before accepting anything.
   ============================================================= */

const ownerHasRemovableTile = owner =>
  Object.values(G.tiles).some(t => !t.gz && t.own === owner && !heroesAt(t.c).length);
const currentRemovalOwner = () => G.remOrder.find(ownerHasRemovableTile);
const needsRemoval = () => G.rd >= ROUND.declineFrom && currentRemovalOwner() !== undefined;
const needsPlacement = () => G.rd <= ROUND.placementEnds && G.pl[G.cur].poolN > 0;
const needsBoardStep = () => (G.rd <= ROUND.placementEnds ? needsPlacement() : needsRemoval());
const boardStepDone = () => G.done || !needsBoardStep();
const canRepeat = (hero, type) => !hero.t.some(x => x.type === type && !x.fail) || hero.ok[type];
const canAct = (hero, type) => actsForMe(hero) && boardStepDone()
  && hero.acts > 0 && canRepeat(hero, type) && (type !== 'attack' || G.rd >= ROUND.attacksFrom);
const canHitNuke = hero => actsForMe(hero) && boardStepDone() && hero.acts > 0;
const canBeMindControlled = target => target.alive
  && !(target.mcCooldown != null && (G.rd === target.mcCooldown || G.rd === target.mcCooldown + 1));
const inRangeOf = (attacker, target) => cubeDistance(attacker.c, target.c) <= reach(attacker);
const canMindControl = (attacker, target) => actsForMe(attacker) && boardStepDone()
  && attacker.acts > 0 && G.rd >= ROUND.attacksFrom && !G.apoc
  && canRepeat(attacker, 'mind') && inRangeOf(attacker, target)
  && target.p !== myIndex() && canBeMindControlled(target);

/* =============================================================
   7. SERVER STATE, PRIVATE DATA AND EVENTS
   ============================================================= */

async function loadMyPrivateData() {
  const [mine, secrets] = await Promise.all([
    db.from('player_private').select('pool, hand').eq('room_code', ROOM).eq('uid', ME).maybeSingle(),
    db.from('tile_secrets').select('cube_key, skill').eq('room_code', ROOM).eq('owner', ME),
  ]);
  if (mine.error) console.error('private data failed to load:', mine.error.message);
  if (secrets.error) console.error('tile secrets failed to load:', secrets.error.message);
  if (mine.error || secrets.error) return;
  PRIV = {
    pool: mine.data?.pool || [],
    hand: mine.data?.hand || [],
    secretSkills: Object.fromEntries((secrets.data || []).map(row => [row.cube_key, row.skill])),
  };
}

// Event card: source, headline, detail, who acted and who was affected, then the rolls.
// A defender sees the headline written for them.
function eventCardHtml(event) {
  const source = SOURCE_STYLE[event.source] || SOURCE_STYLE.general;
  const rawHeadline = event.headline || event.t || 'Something happened';
  const youDefend = event.source === 'combat' && event.target === myIndex();
  const headline = youDefend ? (DEFENDER_HEADLINES[rawHeadline] || rawHeadline) : rawHeadline;
  const srcLine = source.label ? `<div class="event-source">${source.icon} ${source.label}</div>` : '';
  const detail = event.detail ? `<div class="event-detail">${textWithV(event.detail)}</div>` : '';
  return `<div class="event-card">${srcLine}
    <div class="event-headline">${textWithV(headline)}</div>
    ${detail}${playerWho(event)}${unitsLine(event)}${diceBlock(event, rawHeadline)}
  </div>`;
}

// names the acting and affected players, so inactive players see who did what
function playerWho(event) {
  const parts = [];
  if (event.actor != null && event.actor >= 0 && G.pl[event.actor]) parts.push(`by ${escapeHtml(G.pl[event.actor].name)}`);
  if (event.target != null && event.target >= 0 && G.pl[event.target]) parts.push(`affects ${escapeHtml(G.pl[event.target].name)}`);
  return parts.length ? `<div class="event-who">${parts.join(' · ')}</div>` : '';
}

// the heroes and objects the action touched, by their names
function unitsLine(event) {
  if (!event.affected || !event.affected.length) return '';
  const names = event.affected.map(u => {
    if (u.kind === 'hero') return G.heroes[u.i] ? heroLabel(G.heroes[u.i]) : null;
    const obj = G.objs[u.i];
    return obj ? (obj.nm || `${G.pl[obj.p].name}'s object`) : null;
  }).filter(Boolean);
  return names.length ? `<div class="event-who">Affected: ${names.map(name => escapeHtml(name)).join(', ')}</div>` : '';
}

// an attack shows both rolls labelled by side; other events show their dice in a row
function diceBlock(event, rawHeadline) {
  const dice = event.dice || [];
  if (!dice.length) return '';
  const isAttack = event.source === 'combat' && (rawHeadline === 'Hit' || rawHeadline === 'Miss') && dice.length === 2;
  if (isAttack) {
    return `<div class="event-roll-pair">
      <div><small>Attacker</small>${dieHtml(dice[0], 0)}</div>
      <div><small>Defender</small>${dieHtml(dice[1], 0.15)}</div>
    </div>`;
  }
  return `<div class="event-dice">${dice.map((value, i) => dieHtml(value, i * 0.15)).join(' ')}</div>`;
}

// highlights the named heroes and objects on the board for a few seconds
function flashUnits(units) {
  flashKeys = new Set(units.map(u => (u.kind === 'hero' ? 'h' : 'o') + u.i));
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashKeys = new Set(); drawBoard(); }, FLASH_MS);
  drawBoard();
}

// shows each event of the latest action one after another, slowly enough to read
function playEvents(events) {
  events
    .filter(event => event && (event.headline || event.t))
    .forEach((event, index) => {
      const tone = ['good', 'bad', 'info', 'gold'].includes(event.tone) ? event.tone : 'info';
      const source = SOURCE_STYLE[event.source] ? event.source : 'general';
      setTimeout(() => {
        if (event.affected && event.affected.length) flashUnits(event.affected);
        showFloat(eventCardHtml(event), `event slow tone-${tone} src-${source}`, EVENT_CARD_MS);
      }, index * EVENT_GAP_MS);
    });
}

function applyRemoteState(state) {
  if (G && state.seq <= (G.seq || 0)) return;
  const hadGame = !!G;
  const wasApocalypse = hadGame && !!G.apoc;
  const priv = PRIV || { pool: [], hand: [], secretSkills: {} };
  const me = state.pl.findIndex(p => p.uid === ME);

  G = {
    ...state,
    pl: state.pl.map((p, i) => ({
      ...p,
      pool: i === me ? priv.pool : Array(p.poolN).fill('?'),
      hand: i === me ? priv.hand : Array(p.handN).fill('?'),
    })),
  };

  // my own face-down tiles show their type only to me
  Object.values(G.tiles).forEach(tile => {
    const key = cubeKey(tile.c);
    if (tile.own === me && !tile.disc && priv.secretSkills[key]) tile.sk = priv.secretSkills[key];
  });

  if (hadGame && state.seq !== lastAnimatedSeq && G.events && G.events.length) {
    lastAnimatedSeq = state.seq;
    playEvents(G.events);
  }
  if (hadGame && !wasApocalypse && G.apoc) playApocalypseAnimation();
  render();
}

function onRoomUpdate(row) {
  ROOM_ROW = row;
  if (!row.state) { G = null; render(); return; }
  if (G && row.state.seq <= (G.seq || 0)) return;
  loadMyPrivateData().then(() => applyRemoteState(row.state));
}

// sends one action to the server; the server applies the rules and publishes the result
async function submitAction(action) {
  setMessage('');
  console.debug('submit_action payload', JSON.stringify(action));
  const { data, error } = await db.rpc('submit_action', { p_room: ROOM, p_action: action });
  const message = error ? error.message : '';
  if (message && !message.includes(DISCOVERY_CHOICE)) setMessage(message);
  render();
  return { data, message };
}

/* =============================================================
   8. PRESENCE AND EMOJI (heartbeat)
   The server applies the disconnect penalty. The page only reports
   heartbeats and shows the countdown.
   ============================================================= */

function secondsSilent(uid) {
  const base = presenceSeen.data[uid];
  if (base == null) return null;
  return Number(base) + (Date.now() - presenceSeen.at) / 1000;
}

async function syncPresence() {
  if (!ROOM || !G || G.over) return;
  const hb = await db.rpc('heartbeat', { p_room: ROOM });
  if (hb.error) console.error('heartbeat failed:', hb.error.message);
  const status = await db.rpc('presence_status', { p_room: ROOM });
  if (status.error) console.error('presence status failed:', status.error.message);
  else presenceSeen = { data: status.data || {}, at: Date.now() };
  const check = await db.rpc('apply_disconnects', { p_room: ROOM });
  if (check.error) console.error('disconnect check failed:', check.error.message);
  updateOfflineBadges();
}

// the countdown HTML for players who have gone quiet
function offlineBadgesHtml() {
  if (!G) return '';
  return G.pl.map((p, i) => {
    if (p.uid === ME || !isAlive(i)) return '';
    const silent = secondsSilent(p.uid);
    if (silent === null || silent < OFFLINE_SHOW_S) return '';
    const left = Math.max(0, Math.ceil(OFFLINE_LIMIT_S - silent));
    return `<span class="alert">⏱ ${escapeHtml(p.name)} offline: ${left}s</span>`;
  }).join('');
}

// updates only the countdown, so the top bar's buttons are not rebuilt every second
function updateOfflineBadges() {
  const slot = el('offline');
  if (slot) slot.innerHTML = offlineBadgesHtml();
}

function showEmoji({ uid, k, e }) {
  if (!G) return;
  const owner = G.pl.findIndex(p => p.uid === uid);
  const hero = G.heroes.find(h => h.alive && h.p === owner && h.k === k);
  if (owner < 0 || !hero) return;
  const [x, y] = screenPoint(...heroPosition(hero));
  const node = document.createElement('div');
  node.className = 'emo';
  node.textContent = e;
  node.style.left = x + 'px';
  node.style.top = (y - 24) + 'px';
  el('svgwrap').appendChild(node);
  setTimeout(() => node.remove(), 2300);
}

function sendEmoji(hero, emoji) {
  const payload = { uid: ME, k: hero.k, e: emoji };
  if (channel) channel.send({ type: 'broadcast', event: 'emoji', payload });
  showEmoji(payload);
}

/* =============================================================
   9. LOBBY AND ROOMS
   ============================================================= */

function openRoomChannel(code) {
  if (channel) db.removeChannel(channel);
  channel = db.channel('room-' + code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'code=eq.' + code }, p => onRoomUpdate(p.new))
    .on('broadcast', { event: 'emoji' }, ({ payload }) => showEmoji(payload))
    .subscribe();
}

async function enterRoom(code) {
  roomLoading = true;
  render();
  ROOM = code;
  gameOverDismissed = false;
  localStorage.setItem('versa-room', code);
  openRoomChannel(code);
  const { data, error } = await db.from('rooms').select('*').eq('code', code).maybeSingle();
  if (error || !data) { toast('Room not found'); leaveRoom(); return; }
  roomLoading = false;
  onRoomUpdate(data);
}

async function createRoom() {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { error } = await db.from('rooms').insert({ code, host: ME, players: [{ uid: ME, name: username }], state: null, seq: 0 });
  if (error) return toast(error.message);
  enterRoom(code);
}

async function joinRoom(code) {
  const { error } = await db.rpc('join_room', { p_room: code, p_name: username });
  if (error) return toast(error.message);
  enterRoom(code);
}

async function startGame() {
  const { error } = await db.rpc('start_game', { p_room: ROOM });
  if (error) toast(error.message);
}

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(ROOM);
  } catch (error) {
    const field = document.createElement('textarea');
    field.value = ROOM;
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  toast(`Room code ${ROOM} copied`);
}

// leaving a game in progress is a concession: the server removes the player's pieces
async function leaveRoom() {
  if (G && !G.over && ROOM) {
    const ok = confirm('Concede this game? Your heroes and objects will be removed, and you cannot rejoin.');
    if (!ok) return render();
    const { error } = await db.rpc('submit_action', { p_room: ROOM, p_action: { type: 'concede' } });
    if (error) toast(error.message);
  }
  if (channel) db.removeChannel(channel);
  channel = null;
  ROOM = null; ROOM_ROW = null; G = null; PRIV = null;
  roomLoading = false;
  presenceSeen = { data: {}, at: 0 };
  gameOverDismissed = false;
  logOpen = false;
  loadoutDraft = null;
  localStorage.removeItem('versa-room');
  render();
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'fx';
  node.textContent = message;
  el('fx').appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

/* Names are saved per player, so they apply to every game. Loaded once at startup. */

async function loadSavedNames() {
  const { data, error } = await db.from('player_names').select('hero_names, object_names').eq('uid', ME).maybeSingle();
  if (error) console.error('saved names failed to load:', error.message);
  savedNames = data || { hero_names: [], object_names: [] };
  loadoutDraft = null;
  render();
}

function loadoutFromSaved() {
  const padded = list => [0, 1, 2].map(i => (list || [])[i] || '');
  return { heroes: padded(savedNames?.hero_names), objects: padded(savedNames?.object_names) };
}

function nameFields(group, placeholder) {
  return loadoutDraft[group].map((name, slot) =>
    `<input class="name-in" data-loadout="${group}" data-slot="${slot}" maxlength="12"
      placeholder="${placeholder} ${slot + 1}" value="${escapeHtml(name)}">`).join('');
}

async function saveLoadout() {
  const heroes = loadoutDraft.heroes.map(name => name.trim());
  const objects = loadoutDraft.objects.map(name => name.trim());
  if ([...heroes, ...objects].some(name => !LOADOUT_NAME_PATTERN.test(name))) {
    return toast('Names use letters, numbers and spaces, up to 12');
  }
  const { error } = await db.rpc('set_loadout', { p_heroes: heroes, p_objects: objects });
  if (error) return toast(error.message);
  savedNames = { hero_names: heroes, object_names: objects };
  toast('Names saved for every game');
}

/* =============================================================
   10. TURN CONTROLS AND MESSAGES
   ============================================================= */

function setMessage(text) { ui.message = text; }

function endTurnClick() {
  if (!isMyTurn()) return;
  if (!boardStepDone()) { setMessage('Finish your board step first'); return render(); }
  submitAction({ type: 'end_turn' });
}

function openWheel(wheel) { ui.wheel = wheel; }
function closeWheel() { ui.wheel = null; }

function dismissMenus() {
  if (ui.wheel && MUST_CHOOSE.includes(ui.wheel.kind)) return;
  closeWheel();
  ui.carry = null;
  ui.devType = null;
  if (ui.mode !== 'place' && ui.mode !== 'remove') ui.mode = '';
}

function cancelMode() {
  dismissMenus();
  setMessage('');
  render();
}

/* =============================================================
   11. PLACEMENT, DECLINE REMOVAL AND VALID TARGETS
   ============================================================= */

function placeTile(cube, skill) { submitAction({ type: 'place', cube, skill }); }
function removeTile(cube) { submitAction({ type: 'remove_tile', cube }); }

// Buy Barrier: any discovered tile next to one of my heroes, with or without a barrier on it
function isValidTarget(cube) {
  const tile = tileAt(cube);
  const hero = selectedHero();
  switch (ui.mode) {
    case 'place':
      return G.rd <= ROUND.placementEnds && !G.done && G.pl[G.cur].poolN > 0 && !tile
        && neighbours(cube).some(n => { const t = tileAt(n); return t && (t.gz || t.own === G.cur); });
    case 'remove':
      return needsRemoval() && !!tile && !tile.gz && tile.own === currentRemovalOwner() && !heroesAt(cube).length;
    case 'develop':
      if (!tile || !hero || cubeDistance(hero.c, cube) > 1) return false;
      if (ui.devType === 'barrier') return !G.apoc && !!tile.disc;
      if (ui.devType === 'object') return !G.apoc && !!tile.disc && objectCount(G.cur) < RULES.maxObjects;
      return false;
    case 'obj':
      return !G.apoc && !!tile && !!tile.disc && objectCount(myIndex()) < RULES.maxObjects
        && G.heroes.some(h => h.alive && h.p === myIndex() && sameTile(h.c, cube));
    case 'barrier':
      return !G.apoc && !!tile && !!tile.disc
        && G.heroes.some(h => h.alive && h.p === myIndex() && cubeDistance(h.c, cube) <= 1);
    case 'hero':
      return !!tile && !!tile.disc
        && G.heroes.some(h => h.alive && h.p === myIndex() && sameTile(h.c, cube));
    default:
      return false;
  }
}

function placementCandidates() {
  const keys = new Set();
  Object.values(G.tiles).forEach(t => neighbours(t.c).forEach(n => { if (!tileAt(n)) keys.add(cubeKey(n)); }));
  return [...keys].map(keyToCube).filter(isValidTarget);
}

/* =============================================================
   12. MOVEMENT
   ============================================================= */

function moveTo(heroIdx, cube) {
  const hero = G.heroes[heroIdx];
  if (!canAct(hero, 'move')) return setMessage(hero.acts < 1 ? 'No actions left for this hero this turn' : 'This hero has already moved this turn');
  const distance = cubeDistance(hero.c, cube);
  if (distance < 1 || distance > reach(hero)) return setMessage('Out of range');
  if (carryable(hero).length) return openCarryWheel(heroIdx, cube);
  sendMove(heroIdx, cube, [], null);
}

function openCarryWheel(heroIdx, cube) {
  ui.carry = { heroIndex: heroIdx, cube, objectIndexes: [] };
  openWheel({ cube: G.heroes[heroIdx].c, kind: 'carry', items: carryItems() });
}

function carryItems() {
  const hero = G.heroes[ui.carry.heroIndex];
  const options = carryable(hero).map(o => {
    const idx = G.objs.indexOf(o);
    const picked = ui.carry.objectIndexes.includes(idx) ? '✔ ' : '';
    const label = o.nuke ? 'Nuke' : `${o.p !== hero.p ? G.pl[o.p].name + ' · ' : ''}DEF ${o.s.def} · RNG ${o.s.rng}`;
    return { v: 'o' + idx, ic: o.nuke ? '☢' : (o.sym || '🧱'), t: picked + label };
  });
  return [...options, { v: 'go', ic: '➜', t: 'Move' }];
}

function toggleCarry(value) {
  const idx = +value.slice(1);
  const list = ui.carry.objectIndexes;
  const at = list.indexOf(idx);
  if (at >= 0) list.splice(at, 1);
  else list.push(idx);
  openWheel({ cube: G.heroes[ui.carry.heroIndex].c, kind: 'carry', items: carryItems() });
}

function confirmCarry() {
  const { heroIndex, cube, objectIndexes } = ui.carry;
  ui.carry = null;
  const range = maxRangeWith(G.heroes[heroIndex], objectIndexes.map(i => G.objs[i]));
  if (cubeDistance(G.heroes[heroIndex].c, cube) > range) {
    return setMessage('Too far for its own range: take an object with range along');
  }
  sendMove(heroIndex, cube, objectIndexes, null);
}

// sends a move; if the server needs a discovery choice, the player picks who gets the bonus
async function sendMove(heroIdx, cube, objectIndexes, bonus) {
  const { message } = await submitAction({
    type: 'move',
    hero: heroIdx,
    to: cube,
    carry: objectIndexes,
    bonus: bonus ? bonus.mode : null,
    bonusObj: bonus && bonus.mode === 'obj' ? bonus.index : null,
  });
  if (!message.includes(DISCOVERY_CHOICE)) return;
  const pickable = objectIndexes.filter(i => !G.objs[i].nuke);
  openWheel({
    cube: G.heroes[heroIdx].c, kind: 'moveBonus',
    heroIndex: heroIdx, target: cube, objectIndexes,
    items: [{ v: 'hero', ic: '👤', t: 'Hero' },
            ...pickable.map(i => ({ v: 'o' + i, ic: G.objs[i].sym || '🧱', t: 'DEF ' + G.objs[i].s.def }))],
  });
  render();
}

/* =============================================================
   13. COMBAT AND MIND CONTROL (server-side)
   ============================================================= */

function openAttackChoice(attackerIdx, defenderIdx) {
  const attacker = G.heroes[attackerIdx], defender = G.heroes[defenderIdx];
  const inRange = inRangeOf(attacker, defender);
  const ownedByMe = !!defender.mc && defender.mc.by === myIndex();
  const lock = combatLock(attacker);
  const attackOk = inRange && !ownedByMe && canAct(attacker, 'attack') && (!lock || lock === 'attack');
  const mindOk = canMindControl(attacker, defender) && (!lock || lock === 'mind');
  if (!attackOk && !mindOk) {
    if (lock) return setMessage(`This hero already used ${lock === 'mind' ? 'Mind Control' : 'Combat'} this turn`);
    if (!inRange) return setMessage('Out of range');
    if (G.rd < ROUND.attacksFrom) return setMessage('Attacks and Mind Control unlock in round 4');
    return setMessage('No attack or Mind Control available to this hero on that target');
  }
  openWheel({
    cube: defender.c, kind: 'attackChoice', heroIndex: attackerIdx, targetIndex: defenderIdx,
    items: [
      { v: 'atk', ic: '⚔️', t: 'Combat', dis: !attackOk },
      { v: 'mind', ic: '🧠', t: 'Mind Control', dis: !mindOk },
    ],
  });
}

function attackNukeWith(heroIdx) { submitAction({ type: 'attack_nuke', hero: heroIdx }); }

/* =============================================================
   14. DEVELOP AND BUYING (server-side)
   ============================================================= */

async function sendDevelop(wheel, take) {
  const hero = selectedHero();
  if (!hero) return setMessage('Select a hero first');
  const { data, message } = await submitAction({
    type: 'develop',
    hero: heroIndex(hero),
    mode: ui.devType,
    cube: wheel.cube || null,
    unit: wheel.unit || null,
    skill: ui.devSkill,
    take,
    dir: wheel.dir || 'up',
  });
  if (message) return;
  if (data && data.nat20) {
    ui.mode = 'develop';
    ui.devType = null;
    openWheel({ cube: hero.c, kind: 'developType', items: developTypeItems() });
  } else {
    ui.mode = '';
    ui.devType = null;
    ui.selectedIndex = null;
  }
  render();
}

// Apocalypse removes barrier and object development; skill development stays
const developTypeItems = () => [
  { v: 'barrier', ic: '🛑', t: 'Barrier' },
  { v: 'object', ic: '🧿', t: 'Object' },
  { v: 'skill', ic: '⬆️', t: 'Skill' },
].filter(item => !G.apoc || item.v === 'skill');

const skillItems = () => SKILLS.map(k => ({ v: k, ic: SKILL_ICON[k], t: SKILL_NAME[k] }));
const rollItems = () => [{ v: 'roll', ic: '🎲', t: 'Roll d20' }, { v: 'take', ic: '1️⃣', t: 'Take 1 pt' }];

// Develop on a barrier: raise or lower it, whoever owns it. Lower needs a barrier to be present.
function buildDirItems(cube) {
  const tile = tileAt(cube);
  return [
    { v: 'up', ic: '▲', t: 'Raise', dis: !tile.disc || tile.bar >= RULES.maxBarrier },
    { v: 'down', ic: '▼', t: 'Lower', dis: !tile.disc || !tile.bar },
  ];
}

// Buy Barrier on an existing barrier: raise or lower it, whoever owns it
function barrierBuyItems(cube) {
  const tile = tileAt(cube);
  return [
    { v: 'up', ic: '▲', t: 'Raise', dis: tile.bar >= RULES.maxBarrier },
    { v: 'down', ic: '▼', t: 'Lower' },
  ];
}

const actingUnit = unit => ('k' in unit ? actsForMe(unit) : isMine(unit));

// structures and skills, each with its frame colour and cost; Barrier and Object stop at the Apocalypse
function buyOptions() {
  const mine = myIndex();
  const player = G.pl[mine >= 0 ? mine : G.cur];
  const ready = isMyTurn() && boardStepDone();
  const canAfford = player.v >= RULES.actionCost;
  const objectsFull = objectCount(mine) >= RULES.maxObjects;
  const heroesFull = G.heroes.filter(h => h.alive && h.p === mine).length >= RULES.maxHeroes;
  return {
    structures: [
      { key: 'barrier', cls: 'b-stone', icon: '🛑', label: 'Barrier', cost: '5V', disabled: !(ready && canAfford) || !!G.apoc },
      { key: 'obj', cls: 'b-gold', icon: '🔮', label: 'Object', cost: '5V', disabled: !(ready && canAfford) || objectsFull || !!G.apoc },
      { key: 'hero', cls: 'b-hero', icon: '👤', label: 'Hero', cost: '30V', disabled: !(ready && player.v >= RULES.heroCost) || heroesFull },
    ],
    skills: [
      { key: 'skill:str', cls: 'b-str', icon: '✊', label: 'STR', cost: '5V', disabled: !(ready && canAfford) },
      { key: 'skill:def', cls: 'b-def', icon: '🛡️', label: 'DEF', cost: '5V', disabled: !(ready && canAfford) },
      { key: 'skill:rng', cls: 'b-rng', icon: '🏹', label: 'RNG', cost: '5V', disabled: !(ready && canAfford) },
      { key: 'skill:int', cls: 'b-int', icon: '🧠', label: 'INT', cost: '5V', disabled: !(ready && canAfford) },
    ],
  };
}

function pickBuy(key) {
  setMessage('');
  closeWheel();
  if (key === 'obj' || key === 'barrier' || key === 'hero') {
    ui.mode = ui.mode === key ? '' : key;
    ui.devType = null;
  } else if (key.startsWith('skill:')) {
    const skill = key.slice(6);
    ui.mode = ui.mode === 'buyskill' && ui.devSkill === skill ? '' : 'buyskill';
    ui.devSkill = skill;
  }
  render();
}

/* =============================================================
   15. UI STATE HELPERS
   ============================================================= */

function screenPoint(x, y) {
  const svg = el('svg'), point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const m = point.matrixTransform(svg.getScreenCTM());
  const board = el('svgwrap').getBoundingClientRect();
  return [m.x - board.left, m.y - board.top];
}

function svgPoint(x, y) {
  const svg = el('svg'), point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function tileUnderPoint(point) {
  const hit = Object.values(G.tiles).find(t => Math.hypot(hexX(t.c) - point.x, hexY(t.c) - point.y) < HEX_RADIUS);
  return hit ? hit.c : null;
}

// the board and the drag layer share one viewBox, so a point means the same place on both
function setViewBox(svg) {
  const rect = svg.getBoundingClientRect();
  const aspect = rect.width ? rect.height / rect.width : 0.6;
  const height = view.zoom * aspect;
  svg.setAttribute('viewBox', `${view.cx - view.zoom / 2} ${view.cy - height / 2} ${view.zoom} ${height}`);
}

function heroPosition(hero) {
  const here = heroesAt(hero.c);
  const index = here.indexOf(hero), count = here.length;
  return [hexX(hero.c) + (index - (count - 1) / 2) * 13, hexY(hero.c) + 10];
}

/* =============================================================
   16. ZOOM AND PAN ON THE BOARD
   Mouse wheel zooms. One finger pans or drags a hero. Two fingers
   pinch to zoom, and pan is cancelled while they are down.
   ============================================================= */

function clampZoom(zoom) {
  return Math.max(zoomMin(), Math.min(zoomMax(), zoom));
}

function pinchDistance() {
  const [a, b] = [...touches.values()];
  return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}

function onTouchDown(event) {
  if (event.pointerType !== 'touch') return;
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 2) {
    drag = null;
    pan = null;
    el('carry').style.display = 'none';
    pinch = { startDist: pinchDistance(), startZoom: view.zoom };
  }
}

function onTouchMove(event) {
  if (!touches.has(event.pointerId)) return false;
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!pinch || touches.size < 2) return false;
  view.zoom = clampZoom(pinch.startZoom * pinch.startDist / pinchDistance());
  drawBoard();
  return true;
}

function onTouchUp(event) {
  if (!touches.has(event.pointerId)) return false;
  touches.delete(event.pointerId);
  if (!pinch) return false;
  if (touches.size < 2) {
    pinch = null;
    suppressClicksBriefly();
  }
  return true;
}

/* =============================================================
   17. POINTER INPUT ON THE BOARD
   ============================================================= */

function onBoardPointerDown(event) {
  if (!G || G.over || event.button !== 0) return;
  if (touches.size > 1) return;
  if (event.target.closest('[data-nuke]')) return;
  const heroNode = event.target.closest('[data-hero]');
  const hero = heroNode ? G.heroes[+heroNode.dataset.hero] : null;
  const canDrag = hero && !ui.mode && boardStepDone()
    && (canAct(hero, 'move') || canAct(hero, 'attack') || canHitNuke(hero));
  if (canDrag) {
    drag = { heroIdx: heroIndex(hero), startX: event.clientX, startY: event.clientY, moved: false, point: null, hoverHero: null };
  } else {
    pan = { startX: event.clientX, startY: event.clientY, startCx: view.cx, startCy: view.cy, moved: false };
  }
}

function onPointerMove(event) {
  if (onTouchMove(event)) return;
  if (cardDrag) return onCardPointerMove(event);
  if (pan) {
    const dx = event.clientX - pan.startX, dy = event.clientY - pan.startY;
    if (!pan.moved && Math.hypot(dx, dy) < 5) return;
    pan.moved = true;
    const scale = el('svg').getBoundingClientRect().width / view.zoom;
    view.cx = pan.startCx - dx / scale;
    view.cy = pan.startCy - dy / scale;
    drawBoard();
    return;
  }
  if (drag) {
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      // attack and skill highlights appear once a drag starts; the board redraws only then
      drawBoard();
    }
    el('tip').style.display = 'none';
    drag.point = svgPoint(event.clientX, event.clientY);
    const cube = tileUnderPoint(drag.point);
    drag.hoverHero = cube ? heroesAt(cube).find(h => h.p !== myIndex()) || null : null;
    updateDragLabel(event);
    drawDragLayer();
  }
}

function onPointerUp(event) {
  if (onTouchUp(event)) return;
  if (cardDrag) return onCardPointerUp(event);
  if (pan) {
    if (pan.moved) suppressClicksBriefly();
    pan = null;
    return;
  }
  if (drag) {
    const finished = drag;
    drag = null;
    el('carry').style.display = 'none';
    drawDragLayer();
    if (!finished.moved) return;
    suppressClicksBriefly();
    handleDrop(finished.heroIdx, svgPoint(event.clientX, event.clientY));
    render();
  }
}

function suppressClicksBriefly() {
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 150);
}

function updateDragLabel(event) {
  const label = el('carry'), hero = G.heroes[drag.heroIdx], target = drag.hoverHero;
  label.style.display = 'block';
  label.style.left = (event.clientX + 18) + 'px';
  label.style.top = (event.clientY + 18) + 'px';
  if (target) {
    label.innerHTML = `⚔ ${escapeHtml(heroLabel(hero))}: STR ${hero.s.str} · INT ${hero.s.int}<br>🛡 ${escapeHtml(heroLabel(target))}: STR ${target.s.str} · DEF ${target.s.def} · INT ${target.s.int}`;
  } else {
    label.textContent = carryable(hero).length
      ? 'Objects here: choose which to take when you release'
      : 'Drop on a tile to move, or on an enemy hero to attack';
  }
}

function handleDrop(heroIdx, point) {
  const hero = G.heroes[heroIdx];
  const cube = tileUnderPoint(point);
  if (!cube) return setMessage('Drop on a tile or an enemy hero to act');
  const nuke = nukeAt(cube);
  const [nx, ny] = nukePoint(cube);
  if (nuke && Math.hypot(nx - point.x, ny - point.y) < NUKE_RADIUS + 4) {
    if (canHitNuke(hero) && cubeDistance(hero.c, cube) <= reach(hero)) attackNukeWith(heroIdx);
    else setMessage('Nuke attack needs range and an attack action left');
    return;
  }
  const enemyIdx = G.heroes.findIndex(h => h.alive && h.p !== myIndex() && sameTile(h.c, cube));
  if (enemyIdx >= 0) return openAttackChoice(heroIdx, enemyIdx);
  moveTo(heroIdx, cube);
}

/* =============================================================
   18. TRAVERSAL HAND AND SELLING
   Drag any card into the Buy panel to sell it. Drag a skill card
   onto a hero or object to apply it. Drag the 5V card onto the
   open board to play it.
   ============================================================= */

function cardHtml(card, index) {
  const name = CARD_NAME[card] || card;
  const icon = CARD_ICON[card] || '?';
  const value = card === 'v' ? '5 Versa' : '+1 point';
  return `<div class="tcard ${card}" data-card="${index}">
    <div class="tc-top">${card === 'v' ? 'Versa' : 'Skill'}</div>
    <div class="tc-art">${icon}</div>
    <div class="tc-name">${name}</div>
    <div class="tc-value">${value}</div>
  </div>`;
}

function drawHand() {
  const hand = el('hand'), mine = myIndex();
  if (mine < 0) { hand.innerHTML = '<span class="muted">Spectating</span>'; return; }
  const cards = G.pl[mine].hand;
  if (!cards.length) {
    hand.innerHTML = '<span class="muted small">No traversal cards yet. Move a hero to draw one.</span>';
    return;
  }
  hand.innerHTML = cards.map((card, i) => cardHtml(card, i)).join('');
}

function onCardPointerDown(event) {
  if (!isMyTurn() || event.button !== 0) return;
  const cardEl = event.target.closest('.tcard');
  if (!cardEl) return;
  cardDrag = { index: +cardEl.dataset.card, startX: event.clientX, startY: event.clientY, moved: false, ghost: null, node: cardEl };
}

// when the drag starts, the Buy panel shows "Drop to Sell: +XV" for this card
function onCardPointerMove(event) {
  if (!cardDrag.moved) {
    if (Math.hypot(event.clientX - cardDrag.startX, event.clientY - cardDrag.startY) < 6) return;
    cardDrag.moved = true;
    const card = G.pl[myIndex()].hand[cardDrag.index];
    cardDrag.node.classList.add('dragging-out');
    sellHint = CARD_SELL_VALUE[card] ?? 2;
    el('buycol').classList.add('dragging');
    updateSellZone();
    cardDrag.ghost = document.createElement('div');
    cardDrag.ghost.className = 'ghostc';
    cardDrag.ghost.textContent = `${CARD_ICON[card]} ${CARD_NAME[card]}`;
    document.body.appendChild(cardDrag.ghost);
  }
  cardDrag.ghost.style.left = event.clientX + 'px';
  cardDrag.ghost.style.top = event.clientY + 'px';
}

function endCardDragVisuals() {
  el('buycol').classList.remove('dragging');
  sellHint = null;
  updateSellZone();
}

function onCardPointerUp(event) {
  const finished = cardDrag;
  cardDrag = null;
  endCardDragVisuals();
  if (finished.ghost) finished.ghost.remove();
  if (finished.node) finished.node.classList.remove('dragging-out');
  if (!finished.moved) return;

  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (under && el('hand').contains(under)) return;
  const card = G.pl[myIndex()].hand[finished.index];

  if (under && el('buycol').contains(under)) {
    return submitAction({ type: 'sell_card', index: finished.index + 1 });
  }

  const target = under?.closest('[data-hero],[data-obj]');
  if (target) {
    if (card === 'v') return setMessage('The 5V card is played on open board or sold in the Buy panel');
    const unit = target.dataset.hero !== undefined
      ? { kind: 'h', i: +target.dataset.hero }
      : { kind: 'o', i: +target.dataset.obj };
    return submitAction({ type: 'apply_card', index: finished.index + 1, unit });
  }

  if (card === 'v' && under && el('svgwrap').contains(under)) {
    return submitAction({ type: 'play_versa', index: finished.index + 1 });
  }
  setMessage('Drop a card in the Buy panel to sell it, on a hero or object to use it, or the 5V card on the board to play it');
  render();
}

/* =============================================================
   19. BOARD CLICKS
   ============================================================= */

function onBoardClick(event) {
  if (suppressClick || !G || G.over) return;
  const node = event.target.closest('[data-k]');
  if (!node) {
    if (ui.wheel && !MUST_CHOOSE.includes(ui.wheel.kind)) { dismissMenus(); render(); }
    return;
  }
  handleBoardClick(node.dataset.k, node.dataset.hero, node.dataset.obj, node.dataset.nuke === '1');
}

function handleBoardClick(keyText, heroIndexText, objectIndexText, clickedNuke) {
  setMessage('');
  if (ui.wheel) {
    if (!MUST_CHOOSE.includes(ui.wheel.kind)) dismissMenus();
    return render();
  }

  const cube = keyToCube(keyText);
  const heroIdx = heroIndexText !== undefined ? +heroIndexText : null;
  const hero = heroIdx !== null ? G.heroes[heroIdx] : null;
  const object = objectIndexText !== undefined ? G.objs[+objectIndexText] : null;
  const unit = hero || object;

  if (hero && isMine(hero) && hero.mc && !hero.mc.ceded && isMyTurn() && !ui.mode) {
    openWheel({ cube: hero.c, kind: 'cede', heroIndex: heroIdx, items: [{ v: 'cede', ic: '🤝', t: 'Cede to ' + G.pl[hero.mc.by].name }] });
    return render();
  }

  if (hero && hero.mc && actsForMe(hero) && !ui.mode) {
    openWheel({
      cube: hero.c, kind: 'controlled', heroIndex: heroIdx,
      items: [{ v: 'develop', ic: '🛠', t: 'Develop' }, { v: 'skip', ic: '⏭', t: 'Skip rest' }],
    });
    return render();
  }

  if (!isMyTurn() && !isControllingNow()) {
    if (hero && isMine(hero)) openWheel({ cube: hero.c, kind: 'emoji', heroIndex: heroIdx, items: EMOJIS.map(e => ({ v: e, ic: e, t: '' })) });
    return render();
  }

  if (clickedNuke && !ui.mode) {
    const attacker = selectedHero();
    if (attacker && canHitNuke(attacker) && cubeDistance(attacker.c, cube) <= reach(attacker)) attackNukeWith(ui.selectedIndex);
    return render();
  }

  switch (ui.mode) {
    case 'obj':
      if (isValidTarget(cube)) { submitAction({ type: 'buy_object', cube }); ui.mode = ''; }
      else setMessage('Click a discovered tile with one of your heroes');
      return render();
    case 'barrier':
      if (!isValidTarget(cube)) {
        setMessage('Click a discovered tile next to one of your heroes');
      } else if (tileAt(cube).bar > 0) {
        // an existing barrier: choose raise or lower; the server checks the owner rules
        openWheel({ cube, kind: 'barrierBuy', items: barrierBuyItems(cube) });
      } else {
        submitAction({ type: 'buy_barrier', cube });
        ui.mode = '';
      }
      return render();
    case 'hero':
      if (isValidTarget(cube)) { submitAction({ type: 'buy_hero', cube }); ui.mode = ''; }
      else setMessage('Click a discovered tile with one of your heroes');
      return render();
    case 'buyskill':
      if (!unit || !actingUnit(unit)) setMessage('Pick one of your own heroes or objects');
      else { submitAction({ type: 'buy_skill', skill: ui.devSkill, unit: unitRef(unit) }); ui.mode = ''; }
      return render();
    case 'place':
      if (isValidTarget(cube)) openPlacementWheel(cube);
      return render();
    case 'remove':
      if (isValidTarget(cube)) removeTile(cube);
      return render();
    case 'develop':
      return handleDevelopClick(cube, unit);
    default:
      break;
  }

  if (hero && actsForMe(hero)) {
    ui.selectedIndex = heroIdx;
    if (!canAct(hero, 'develop')) {
      setMessage(hero.acts < 1 ? 'No actions left for this hero this turn' : 'This hero cannot develop right now');
    } else {
      ui.mode = 'develop';
      ui.devType = null;
      openWheel({ cube: hero.c, kind: 'developType', items: developTypeItems() });
    }
  }
  render();
}

function openPlacementWheel(cube) {
  if (!PRIV || !PRIV.pool.length) {
    setMessage('Your tiles are still loading. Try again in a moment.');
    loadMyPrivateData().then(render);
    return;
  }
  openWheel({
    cube, kind: 'place',
    items: PRIV.pool.map(s => ({ v: s, ic: SKILL_ICON[s], t: SKILL_NAME[s] })),
  });
}

function handleDevelopClick(cube, unit) {
  if (ui.devType === 'skill') {
    const hero = selectedHero();
    const isTarget = unit && hero && actingUnit(unit) && cubeDistance(unit.c, hero.c) <= 1;
    if (!isTarget) return setMessage('Click one of the highlighted heroes or objects');
    openWheel({ cube: unit.c, kind: 'developSkill', unit: unitRef(unit), items: skillItems() });
    return render();
  }
  if (!isValidTarget(cube)) {
    ui.mode = '';
    ui.devType = null;
    return render();
  }
  if (ui.devType === 'barrier') openWheel({ cube, kind: 'buildDir', items: buildDirItems(cube) });
  else openWheel({ cube, kind: 'roll', unit: null, items: rollItems() });
  render();
}

/* =============================================================
   20. WHEEL MENU CHOICES
   Each choice closes the wheel first, then runs its handler.
   ============================================================= */

function pickWheelItem(value) {
  const wheel = ui.wheel;
  if (!wheel) return render();
  if (value === 'x') {
    dismissMenus();
    return render();
  }

  const handlers = {
    emoji: () => sendEmoji(G.heroes[wheel.heroIndex], value),
    place: () => submitAction({ type: 'place', cube: wheel.cube, skill: value }),
    barrierBuy: () => {
      submitAction({ type: 'buy_barrier', cube: wheel.cube, dir: value });
      ui.mode = '';
    },
    buildDir: () => openWheel({ cube: wheel.cube, kind: 'roll', dir: value, unit: null, items: rollItems() }),
    carry: () => (value === 'go' ? confirmCarry() : toggleCarry(value)),
    attackChoice: () => {
      if (value === 'atk') submitAction({ type: 'attack', hero: wheel.heroIndex, target: wheel.targetIndex });
      else submitAction({ type: 'mind_control', hero: wheel.heroIndex, target: wheel.targetIndex });
    },
    cede: () => submitAction({ type: 'cede', hero: wheel.heroIndex }),
    controlled: () => {
      if (value === 'skip') return submitAction({ type: 'skip_hero', hero: wheel.heroIndex });
      const hero = G.heroes[wheel.heroIndex];
      ui.selectedIndex = wheel.heroIndex;
      if (!canAct(hero, 'develop')) return setMessage('This hero cannot develop right now');
      ui.mode = 'develop';
      ui.devType = null;
      openWheel({ cube: hero.c, kind: 'developType', items: developTypeItems() });
    },
    developType: () => {
      ui.devType = value;
      if (value === 'skill') setMessage('Click one of the highlighted heroes or objects to raise the chosen skill.');
    },
    developSkill: () => {
      const target = unitFromRef(wheel.unit);
      if (target.s[value] >= RULES.maxSkill) return setMessage('That skill is maxed');
      ui.devSkill = value;
      openWheel({ cube: target.c, kind: 'roll', unit: wheel.unit, items: rollItems() });
    },
    roll: () => sendDevelop(wheel, value === 'take'),
    moveBonus: () => {
      const bonus = value === 'hero' ? { mode: 'hero' } : { mode: 'obj', index: +value.slice(1) };
      sendMove(wheel.heroIndex, wheel.target, wheel.objectIndexes, bonus);
    },
  };

  closeWheel();
  const handler = handlers[wheel.kind];
  if (handler) handler();
  render();
}

/* =============================================================
   21. FLOATING FEEDBACK AND TOOLTIPS
   ============================================================= */

function showFloat(html, extraClass = '', durationMs = 3000) {
  const node = document.createElement('div');
  node.className = 'fx ' + extraClass;
  node.innerHTML = markV(html);
  el('fx').appendChild(node);
  setTimeout(() => node.remove(), durationMs);
}

function playApocalypseAnimation() {
  const svg = el('svg');
  svg.classList.remove('apoc-flash');
  void svg.offsetWidth;
  svg.classList.add('apoc-flash');
  setTimeout(() => svg.classList.remove('apoc-flash'), 1700);
  showFloat('<span>☢ APOCALYPSE</span> barriers and objects are destroyed', 'nat');
}

const statGrid = stats => `<div class="tstats">${[
  ['✊', 'STR', stats.str], ['🛡️', 'DEF', stats.def], ['🏹', 'RNG', stats.rng], ['🧠', 'INT', stats.int],
].map(([icon, name, value]) => `<div class="tstat">${icon}<b>${value}</b><small>${name}</small></div>`).join('')}</div>`;

const damageBar = (damage, limit) => `<div class="tbar"><i style="width:${Math.min(100, damage / limit * 100)}%"></i></div>`;

function heroTooltip(hero) {
  const actions = actsForMe(hero)
    ? `<div class="tsub">Actions: ${'●'.repeat(hero.acts)}${'✕'.repeat(Math.max(0, 2 - hero.acts))}</div>`
    : '';
  const control = hero.mc
    ? `<div class="tsub">🧠 Controlled by ${escapeHtml(G.pl[hero.mc.by].name)}${hero.mc.ceded ? ' · ceded' : ''}</div>`
    : '';
  return {
    kind: 'hero', color: PLAYER_COLORS[hero.p],
    html: `<div class="th">🧍 ${escapeHtml(heroLabel(hero))}</div>${statGrid(hero.s)}${damageBar(hero.dmg, hero.s.def)}
      <div class="tsub">Damage ${hero.dmg} of ${hero.s.def}</div>${actions}${control}`,
  };
}

function objectTooltip(obj) {
  const ownerNote = isMine(obj) ? '' : ' · owned by another player; taking it makes it yours';
  const rangeNote = obj.s.rng > 0 ? `Adds ${obj.s.rng} range: the hero must take it along to move that far` : '';
  const title = obj.nm || `${G.pl[obj.p].name}'s object`;
  return {
    kind: 'object', color: PLAYER_COLORS[obj.p],
    html: `<div class="th">${obj.sym || '🧱'} ${escapeHtml(title)}</div>${statGrid(obj.s)}${damageBar(obj.dmg, obj.s.def)}
      <div class="tsub">Damage ${obj.dmg} of ${obj.s.def}</div><div class="tsub">${rangeNote}${ownerNote}</div>`,
  };
}

function nukeTooltip(nuke) {
  return {
    kind: 'nuke', color: '#ff3d3d',
    html: `<div class="th">☢ Nuke</div>${damageBar(nuke.dmg, nuke.s.def)}
      <div class="tsub">Hits ${nuke.dmg} of ${nuke.s.def}. Each attack is one hit.</div>
      <div class="tsub">Destroying it triggers the Apocalypse.</div>`,
  };
}

function tileTooltip(tile) {
  const seen = knowsTileType(tile, myIndex());
  const title = tile.gz ? '⬡ Ground Zero'
    : !seen ? '? Hidden HexTile'
    : tile.sk === 'bar' ? '🛑 Barrier HexTile'
    : `${SKILL_ICON[tile.sk]} ${SKILL_NAME[tile.sk]} HexTile`;
  const owner = tile.own >= 0 ? G.pl[tile.own].name : 'Neutral';
  const barrierLine = tile.bar
    ? `<div class="tsub">🛑 Barrier L${tile.bar}${tile.barOwn != null && G.pl[tile.barOwn] ? ' · held by ' + escapeHtml(G.pl[tile.barOwn].name) : ''}</div>`
    : '';
  const status = tile.gz ? 'Ground Zero: +1 to d20 rolls for heroes on it'
    : tile.disc ? 'Discovered'
    : tile.own === myIndex() ? 'Yours, face down: only you can see its type'
    : 'Undiscovered: its type is hidden until its owner reveals it';
  return {
    kind: 'tile', color: tile.own >= 0 ? PLAYER_COLORS[tile.own] : UNOWNED_STROKE,
    html: `<div class="th">${title}</div><div class="tsub">Owner: ${escapeHtml(owner)}</div><div class="tsub">${status}</div>${barrierLine}`,
  };
}

function onBoardHover(event) {
  const node = event.target.closest('[data-tip]');
  const info = node && tooltips[node.dataset.tip];
  const tip = el('tip');
  if (!info || drag) { tip.style.display = 'none'; return; }
  tip.className = 'kind-' + info.kind;
  tip.style.setProperty('--pc', info.color);
  tip.innerHTML = info.html;
  tip.style.display = 'block';
  tip.style.left = Math.min(event.clientX + 16, innerWidth - 300) + 'px';
  tip.style.top = (event.clientY + 16) + 'px';
}

/* =============================================================
   22. BOARD DRAWING
   Everything here reads state; nothing changes it.
   ============================================================= */

function tileSvg(tile, mine) {
  const cube = tile.c, key = cubeKey(cube);
  const seen = knowsTileType(tile, mine);
  const valid = isValidTarget(cube);
  const highlight = valid && ['develop', 'obj', 'barrier', 'hero'].includes(ui.mode);
  const removable = valid && ui.mode === 'remove';
  const fill = tile.gz ? GROUND_ZERO_FILL : tile.disc ? TILE_COLORS[tile.sk] : NEUTRAL_FILL;
  const stroke = tile.own >= 0 ? PLAYER_COLORS[tile.own] : UNOWNED_STROKE;
  const symbol = tile.gz ? '⬡' : !seen ? '?' : tile.sk === 'bar' ? '🛑' : (SKILL_ICON[tile.sk] || '?');
  const label = tile.bar && seen && tile.sk === 'bar' ? '🛑' + tile.bar : symbol;
  const cls = [highlight ? 'ok' : '', removable ? 'rm' : ''].join(' ');
  tooltips['t' + key] = tileTooltip(tile);

  const glowColor = barrierColor(cube);
  const glow = tile.bar > 0
    ? `<polygon class="barglow" points="${hexPoints(cube, HEX_RADIUS - 9)}" stroke="${glowColor}" style="filter:drop-shadow(0 0 1.5px ${glowColor})"/>`
    : '';
  const barrierTag = tile.bar && !(seen && tile.sk === 'bar')
    ? `<text x="${hexX(cube) + HEX_RADIUS * 0.5}" y="${hexY(cube) + HEX_RADIUS * 0.6}" font-size="8" font-weight="bold" fill="#ffd54f" stroke="#000" stroke-width="1" paint-order="stroke">🛑${tile.bar}</text>`
    : '';
  return `<polygon data-k="${key}" data-tip="t${key}" class="${cls}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" points="${hexPoints(cube)}"/>`
    + glow
    + `<text x="${hexX(cube)}" y="${hexY(cube)}" font-size="${label.length > 2 ? 22 : 34}" fill="#fff">${label}</text>`
    + barrierTag;
}

// the purple chain from each Mind Controlled hero to the hero controlling it
function chainSvg(controller, controlled) {
  const [x1, y1] = heroPosition(controller);
  const [x2, y2] = heroPosition(controlled);
  return `<line class="mc-chain" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

function isEnemyInDragReach(hero) {
  if (!drag || !drag.moved) return false;
  const dragged = G.heroes[drag.heroIdx];
  return hero.p !== myIndex() && cubeDistance(dragged.c, hero.c) <= reach(dragged);
}

function isDevelopSkillTarget(unit) {
  const hero = selectedHero();
  return ui.mode === 'develop' && ui.devType === 'skill' && !!hero
    && actingUnit(unit) && cubeDistance(unit.c, hero.c) <= 1;
}

function heroSvg(hero, index) {
  const [x, y] = heroPosition(hero);
  const actable = actsForMe(hero);
  const mc = hero.mc ? `<circle class="ring-mc" cx="${x}" cy="${y}" r="9"/>` : '';
  const march = actable && hero.acts > 0 && !ui.mode && !drag ? `<circle class="ring-march" cx="${x}" cy="${y}" r="8"/>` : '';
  const attackRing = isEnemyInDragReach(hero) ? `<circle class="ring-atk" cx="${x}" cy="${y}" r="10"/>` : '';
  const skillRing = isDevelopSkillTarget(hero) ? `<circle class="ring-selh" cx="${x}" cy="${y}" r="10"/>` : '';
  const flash = flashKeys.has('h' + index) ? `<circle class="ring-flash" cx="${x}" cy="${y}" r="12"/>` : '';
  const selected = ui.selectedIndex === index;
  const dots = actable
    ? `<text x="${x}" y="${y - 9}" font-size="6" fill="#ffe8a3" stroke="#000" stroke-width="1" paint-order="stroke">${'●'.repeat(hero.acts)}${'✕'.repeat(Math.max(0, 2 - hero.acts))}</text>`
    : '';
  const damage = hero.dmg ? `<text x="${x + 8}" y="${y - 6}" font-size="7" font-weight="bold" fill="#ff5252">-${hero.dmg}</text>` : '';
  const muted = ui.mode === 'develop' && ui.devType === 'skill' && !isDevelopSkillTarget(hero) ? 'mute' : '';
  tooltips['h' + index] = heroTooltip(hero);
  return `<g class="${muted}" data-hero="${index}" data-k="${cubeKey(hero.c)}" data-tip="h${index}">`
    + `<circle cx="${x}" cy="${y}" r="6" fill="${HERO_COLORS[index % HERO_COLORS.length]}" stroke="${PLAYER_COLORS[hero.p]}" stroke-width="${selected ? 2.5 : 1.5}"/>`
    + mc + march + attackRing + skillRing + flash + dots + damage + `</g>`;
}

function objectSvg(obj, index) {
  const row = objectsAt(obj.c).filter(o => !o.nuke);
  const position = row.indexOf(obj);
  const x = hexX(obj.c) + (position - (row.length - 1) / 2) * 15;
  const y = hexY(obj.c) - 20;
  const ring = isDevelopSkillTarget(obj) ? `<rect class="ring-o" x="${x - 10}" y="${y - 10}" width="20" height="20" rx="4"/>` : '';
  const flash = flashKeys.has('o' + index) ? `<rect class="ring-flash" x="${x - 10}" y="${y - 10}" width="20" height="20" rx="4"/>` : '';
  const muted = ui.mode === 'develop' && ui.devType === 'skill' && !isDevelopSkillTarget(obj) ? 'mute' : '';
  tooltips['o' + index] = objectTooltip(obj);
  return `<g class="${muted}" data-obj="${index}" data-k="${cubeKey(obj.c)}" data-tip="o${index}">`
    + `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="${PLAYER_COLORS[obj.p]}" stroke="#0e0e12" stroke-width="1"/>`
    + ring + flash
    + `<text x="${x}" y="${y - 1}" font-size="9">${obj.sym || '🧱'}</text>`
    + `<text x="${x + 5}" y="${y + 5}" font-size="5" font-weight="bold" fill="#fff" stroke="#000" stroke-width=".8" paint-order="stroke">${obj.s.def}</text>`
    + `</g>`;
}

// the Nuke marker has a larger invisible hit area so it is easy to click
function nukeSvg(nuke) {
  const [x, y] = nukePoint(nuke.c);
  tooltips.nuke = nukeTooltip(nuke);
  const ring = drag && drag.moved ? `<circle class="ring-nk" cx="${x}" cy="${y}" r="${NUKE_RADIUS + 3}"/>` : '';
  return `<g data-k="${cubeKey(nuke.c)}" data-nuke="1" data-tip="nuke">`
    + `<circle cx="${x}" cy="${y}" r="13" fill="transparent"/>`
    + `<circle cx="${x}" cy="${y}" r="${NUKE_RADIUS}" fill="#2a0a0a" stroke="#ff3d3d" stroke-width="1.2"/>`
    + `<text x="${x}" y="${y}" font-size="8" fill="#ff3d3d">☢</text>`
    + ring + `</g>`;
}

function apocalypseSymbol() {
  return `<text x="0" y="0" font-size="${APOCALYPSE_SYMBOL_SIZE}" fill="#ff3d3d" opacity=".22">☢</text>`;
}

// full board redraw: called when the game state, the view, or the highlighted targets change
function drawBoard() {
  const svg = el('svg');
  tooltips = {};
  svg.style.background = G && G.apoc ? APOCALYPSE_RED : '';
  if (!G) { svg.innerHTML = ''; return; }
  setViewBox(svg);
  const mine = myIndex();
  let out = '';
  if (G.apoc) out += apocalypseSymbol();
  if (ui.mode === 'place') {
    placementCandidates().forEach(c => { out += `<polygon class="cand" data-k="${cubeKey(c)}" points="${hexPoints(c)}"/>`; });
  }
  Object.values(G.tiles).forEach(tile => { out += tileSvg(tile, mine); });
  // chains are drawn under the heroes so the hero circles stay on top
  G.heroes.forEach(hero => {
    if (!hero.alive || !hero.mc) return;
    const controller = G.heroes[hero.mc.src];
    if (controller && controller.alive) out += chainSvg(controller, hero);
  });
  G.heroes.forEach((hero, i) => { if (hero.alive) out += heroSvg(hero, i); });
  G.objs.forEach((obj, i) => { if (obj.alive && !obj.nuke) out += objectSvg(obj, i); });
  const nuke = G.objs.find(o => o.alive && o.nuke);
  if (nuke) out += nukeSvg(nuke);
  svg.innerHTML = out;
  drawDragLayer();
}

// the drag line only: cheap to redraw on every pointer move
function drawDragLayer() {
  const layer = el('dragLayer');
  if (!G || !drag || !drag.moved || !drag.point) { layer.innerHTML = ''; return; }
  setViewBox(layer);
  const [hx, hy] = heroPosition(G.heroes[drag.heroIdx]);
  layer.innerHTML = '<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">'
    + '<path d="M0,0 L6,3 L0,6 z" fill="#ffe066"/></marker></defs>'
    + `<line x1="${hx}" y1="${hy}" x2="${drag.point.x}" y2="${drag.point.y}" stroke="#ffe066" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#arrow)"/>`;
}

/* =============================================================
   23. PANELS
   ============================================================= */

function drawTop() {
  const player = G.pl[G.cur];
  const chips = G.pl.map((p, i) => {
    const heroCount = G.heroes.filter(h => h.alive && h.p === i).length;
    const status = isAlive(i) ? `${heroCount} heroes` : 'out';
    return `<span class="pchip ${i === G.cur ? 'cur' : ''} ${isAlive(i) ? '' : 'out'}" style="--c:${PLAYER_COLORS[i]}">${escapeHtml(p.name)} · ${markV(p.v + ' V')} · ${status}</span>`;
  }).join('');
  const endButton = isMyTurn()
    ? `<button class="endb" data-action="end-turn" ${boardStepDone() ? '' : 'disabled'}>➜ End Turn</button>`
    : '';
  const backButton = G.over && gameOverDismissed ? '<button class="endb" data-action="leave">Back to lobby</button>' : '';
  const exitButton = !G.over && ROOM
    ? '<button class="concede" data-action="leave">Concede</button>'
    : '<button class="ghost" data-action="leave">Leave</button>';
  el('top').innerHTML = `
    <span class="badge" style="background:${PLAYER_COLORS[G.cur]}">${escapeHtml(player.name)}'s turn</span>
    <span class="chip">Round ${G.rd} · ${phaseName()}</span>
    ${G.apoc ? '<span class="alert">☢ Apocalypse</span>' : ''}
    ${G.over ? `<span class="alert">🏆 ${escapeHtml(G.over)}</span>` : ''}
    <span id="offline">${offlineBadgesHtml()}</span>
    <span style="flex:1"></span>
    ${endButton}
    ${backButton}
    ${exitButton}
    ${chips}`;
  el('defeated').style.display = isDefeated() && !G.over ? 'block' : 'none';
}

// the Buy panel: option cards fill the panel; the drop-to-sell overlay sits on top
function drawBuySide() {
  const mine = myIndex();
  const viewer = G.pl[mine >= 0 ? mine : G.cur];
  const opts = buyOptions();
  const isActive = item => item.key === ui.mode
    || (item.key.startsWith('skill:') && ui.mode === 'buyskill' && ui.devSkill === item.key.slice(6));
  const option = item => `<button class="bopt ${item.cls} ${isActive(item) ? 'on' : ''}" data-buy="${item.key}" ${item.disabled ? 'disabled' : ''}>
      <span class="bo-icon">${item.icon}</span><span class="bo-label">${item.label}</span><span class="bo-cost">${markV(item.cost)}</span>
    </button>`;
  const body = isMyTurn()
    ? `<div class="bsection">Structures</div>
       <div class="bgrid" style="grid-template-columns:repeat(3,1fr)">${opts.structures.map(option).join('')}</div>
       <div class="bsection">Skills</div>
       <div class="bgrid" style="grid-template-columns:repeat(4,1fr)">${opts.skills.map(option).join('')}</div>`
    : '<div class="buy-note">Buying is available on your turn.</div>';
  const sellText = sellHint != null ? `Drop to Sell: +${sellHint}V` : '';
  const sellZone = `<div id="sellzone">${sellText}<small>sold for cash, card returns to the deck</small></div>`;
  el('buyside').innerHTML = `<div class="vside">${markV(viewer.v + ' V')}</div><div class="buy-body">${body}</div>${sellZone}`;
}

// updates only the overlay text while a drag is in progress
function updateSellZone() {
  const zone = el('sellzone');
  if (!zone) { drawBuySide(); return; }
  zone.firstChild.textContent = sellHint != null ? `Drop to Sell: +${sellHint}V` : '';
}

function drawBottomBar() {
  el('bottom').classList.toggle('minimized', botMinimized);
  el('bar').innerHTML = `
    <span class="msg">${textWithV(ui.message)}</span>
    <button class="sbtn" data-action="open-log">📜 Log</button>
    <button class="sbtn" data-action="minimize">${botMinimized ? '▴ Expand' : '▾ Minimize'}</button>`;
  const handSize = myIndex() >= 0 ? G.pl[myIndex()].hand.length : 0;
  el('handcol').querySelector('.sec-head').textContent = `🃏 Hand (${handSize})`;
}

function drawWheel() {
  const wheelEl = el('wheel'), wheel = ui.wheel;
  if (!wheel) { wheelEl.style.display = 'none'; wheelEl.innerHTML = ''; return; }
  const [x, y] = screenPoint(hexX(wheel.cube), hexY(wheel.cube));
  wheelEl.style.left = x + 'px';
  wheelEl.style.top = y + 'px';
  wheelEl.style.display = 'block';
  const count = wheel.items.length;
  const buttons = wheel.items.map((item, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
    const emojiClass = wheel.kind === 'emoji' ? 'emoji-btn' : '';
    return `<button class="wbtn ${emojiClass} ${item.on ? 'on' : ''}" data-w="${item.v}" ${item.dis ? 'disabled' : ''}
      style="left:calc(${Math.cos(angle).toFixed(3)} * var(--r));top:calc(${Math.sin(angle).toFixed(3)} * var(--r))">
      <span class="wi">${item.ic}</span>${item.t ? `<small>${markV(item.t)}</small>` : ''}</button>`;
  }).join('');
  const closeButton = MUST_CHOOSE.includes(wheel.kind) ? '' : '<button class="wbtn wx" data-w="x">✕</button>';
  wheelEl.innerHTML = buttons + closeButton;
}

function drawCancel() {
  const cancel = el('cx');
  const show = !!ui.mode && ui.mode !== 'place' && ui.mode !== 'remove' && !ui.wheel;
  cancel.style.display = show ? 'block' : 'none';
  cancel.innerHTML = show ? '<button class="xbtn" data-action="cancel">✕</button>' : '';
}

/* =============================================================
   24. TO-DO LIST
   ============================================================= */

function todoItems() {
  if (G.over) return [{ text: G.over }];
  if (isDefeated()) return [{ text: 'You have been defeated. Watch the game.' }];
  if (!isMyTurn() && !isControllingNow()) return [{ text: `Waiting for ${G.pl[G.cur].name}…` }];
  const myTurn = isMyTurn();
  const items = [];

  if (myTurn && G.rd <= ROUND.placementEnds) {
    items.push({ text: 'Place a tile', done: boardStepDone() });
  }

  if (myTurn && G.rd >= ROUND.declineFrom && G.remPlan.length) {
    items.push({
      text: 'Remove one tile per player',
      head: true,
      done: boardStepDone(),
      children: G.remPlan.map(owner => ({
        text: owner === G.cur ? 'One of your tiles' : `${G.pl[owner].name} (eliminated)`,
        done: !G.remOrder.includes(owner) || !ownerHasRemovableTile(owner),
      })),
    });
  }

  if (boardStepDone()) {
    G.heroes.filter(h => h.alive && actsForMe(h)).forEach(hero => {
      const used = type => hero.t.some(x => x.type === type && !x.fail);
      const name = hero.mc ? `${heroLabel(hero)} (controlled)` : heroName(hero);
      items.push({
        text: `${name}: ${hero.acts} action${hero.acts === 1 ? '' : 's'} left`,
        head: true,
        done: hero.acts < 1,
        children: [
          { text: 'Move', done: used('move'), dim: !used('move') && !canAct(hero, 'move') },
          { text: G.rd < ROUND.attacksFrom ? 'Attack (from round 4)' : 'Attack or Mind Control', done: used('attack') || used('mind'), dim: !used('attack') && !used('mind') && !canAct(hero, 'attack') },
          { text: 'Develop', done: used('develop'), dim: !used('develop') && !canAct(hero, 'develop') },
        ],
      });
    });
  }

  if (myTurn && G.heroes.some(h => h.alive && isMine(h) && h.mc && !h.mc.ceded)) {
    items.push({ text: 'Click a hero under Mind Control to cede it, or leave it with its controller' });
  }

  if (myTurn && boardStepDone() && !G.heroes.some(h => h.alive && actsForMe(h) && h.acts > 0)) {
    items.push({ text: 'Nothing left: end your turn', head: true });
  }

  if (ui.wheel) {
    items.unshift({ text: `Choose: ${ui.wheel.items.map(i => i.t || i.ic).join(' · ')}`, temp: true });
  }
  return items;
}

function todoLineHtml(item, depth) {
  const key = `${G.rd}|${G.cur}|${item.text}`;
  const animate = item.done && !seenTodo.has(key);
  if (item.done) seenTodo.add(key);
  const classes = ['td', depth ? 'sub' : '', item.head ? 'head' : '', item.temp ? 'temp' : '',
    item.dim ? 'dim' : '', item.done ? 'done' : '', animate ? 'strike' : ''].join(' ');
  const mark = item.done ? '☑' : item.head ? '▸' : '☐';
  const children = (item.children || []).map(child => todoLineHtml(child, depth + 1)).join('');
  return `<div class="${classes}">${mark} ${textWithV(item.text)}</div>${children}`;
}

function drawTodo() {
  el('todo').innerHTML = '<b>To do</b>' + todoItems().map(item => todoLineHtml(item, 0)).join('');
}

/* =============================================================
   25. MODAL (log, name, lobby, game over)
   ============================================================= */

function drawModal() {
  const modal = el('modal');
  let html = '';

  if (logOpen && G) {
    const lines = (G.log || []).map(line => {
      const color = line.p >= 0 ? PLAYER_COLORS[line.p] : '#9a9ab0';
      return `<div style="color:${color}">${colourLog(line.t)}</div>`;
    }).join('');
    html = `<div class="card"><h2 style="margin:0">📜 Game log</h2>
      <div class="muted">Room code: <span class="plain-code">${escapeHtml(ROOM)}</span></div>
      <div class="logfull">${lines || '<div>No events yet.</div>'}</div>
      <div class="row"><button class="endb" data-action="close-log">Close</button></div></div>`;
  } else if (!username || !isValidName(username)) {
    html = `<div class="card"><h2 style="margin:0">VERSA</h2>
      <div class="muted">Choose a username (2 to 16 letters or numbers)</div>
      <input id="nameIn" maxlength="16">
      <div class="row"><button class="endb" data-action="save-name">Continue</button></div></div>`;
  } else if (!ROOM) {
    html = `<div class="card"><h2 style="margin:0">Play VERSA</h2>
      <div class="muted">Playing as <b>${escapeHtml(username)}</b></div>
      <div class="row"><button class="endb" data-action="create-room">Create room</button></div>
      <div class="row"><input id="codeIn" maxlength="6" placeholder="Room code"><button data-action="join-room">Join room</button></div>
      <div class="row"><button class="ghost" data-action="rename">Change username</button></div></div>`;
  } else if (roomLoading || (!G && !ROOM_ROW)) {
    html = `<div class="card"><h2 style="margin:0">Loading room ${escapeHtml(ROOM)}…</h2>
      <div class="row"><button class="ghost" data-action="leave">Back to lobby</button></div></div>`;
  } else if (!G && ROOM_ROW) {
    if (!loadoutDraft) loadoutDraft = loadoutFromSaved();
    const players = ROOM_ROW.players || [];
    const startButton = ROOM_ROW.host === ME
      ? `<div class="row"><button class="endb" data-action="start-game" ${players.length < 2 ? 'disabled' : ''}>Start game</button></div>`
      : '<div class="muted">Waiting for the host to start…</div>';
    html = `<div class="card"><h2 style="margin:0">Room</h2>
      <div class="muted">Click the code to copy it, then share it with your opponent. The first player is chosen at random.</div>
      <div class="row"><button class="roomcode" data-action="copy-room" title="Copy room code">${ROOM}</button></div>
      <div>${players.map((p, i) => `<div style="color:${PLAYER_COLORS[i]}">${i + 1}. ${escapeHtml(p.name)}${p.uid === ME ? ' (you)' : ''}</div>`).join('')}</div>
      <div class="muted">Your names are kept for every game. Blank names use the defaults.</div>
      <div class="name-row"><span>Heroes</span>${nameFields('heroes', 'Hero')}</div>
      <div class="name-row"><span>Objects</span>${nameFields('objects', 'Object')}</div>
      <div class="row"><button data-action="save-loadout">Save names</button></div>
      ${startButton}
      <div class="row"><button class="ghost" data-action="leave">Leave room</button></div></div>`;
  } else if (G && G.over && !gameOverDismissed) {
    html = `<div class="card"><h2 style="margin:0">🏆 ${escapeHtml(G.over)}</h2>
      <div class="muted">The board stays visible so you can review the game. This room closes after an hour.</div>
      <div class="row">
        <button class="ghost" data-action="review-board">Review board</button>
        <button class="endb" data-action="leave">Back to lobby</button>
      </div></div>`;
  }

  modal.innerHTML = html;
  modal.style.display = html ? 'flex' : 'none';
  const nameInput = el('nameIn');
  if (nameInput) nameInput.value = username;
}

/* =============================================================
   26. RENDER
   Full redraw from the current state. Rendering never changes
   game state.
   ============================================================= */

function syncModeWithRules() {
  if (!G) return;
  if (!isMyTurn() || G.over) {
    if (ui.mode === 'place' || ui.mode === 'remove') ui.mode = '';
    return;
  }
  if (!boardStepDone()) ui.mode = G.rd <= ROUND.placementEnds ? 'place' : 'remove';
  else if (ui.mode === 'place' || ui.mode === 'remove') ui.mode = '';
}

function render() {
  if (G) syncModeWithRules();
  drawBoard();
  if (G) {
    drawTop();
    drawHand();
    drawBuySide();
    drawBottomBar();
    drawWheel();
    drawCancel();
    drawTodo();
    document.documentElement.style.setProperty('--top-h', el('top').offsetHeight + 'px');
    document.documentElement.style.setProperty('--bottom-h', el('bottom').offsetHeight + 'px');
  } else {
    el('wheel').style.display = 'none';
    el('cx').style.display = 'none';
    el('defeated').style.display = 'none';
    ['top', 'hand', 'bar', 'todo'].forEach(id => { el(id).innerHTML = ''; });
  }
  drawModal();
  document.body.classList.toggle('wait', (!!G && !isMyTurn() && !isControllingNow()) || isDefeated());
}

/* =============================================================
   27. BUTTON ACTIONS
   Every element with data-action is routed here.
   ============================================================= */

function saveUsername() {
  const name = (el('nameIn')?.value || '').trim();
  if (!isValidName(name)) return toast('Use 2 to 16 letters or numbers');
  username = name;
  localStorage.setItem('versa-name', name);
  render();
}

function runAction(action) {
  switch (action) {
    case 'save-name': return saveUsername();
    case 'rename': username = ''; localStorage.removeItem('versa-name'); return render();
    case 'create-room': return createRoom();
    case 'join-room': {
      const code = (el('codeIn')?.value || '').trim().toUpperCase();
      if (code) joinRoom(code);
      return;
    }
    case 'copy-room': return copyRoomCode();
    case 'save-loadout': return saveLoadout();
    case 'start-game': return startGame();
    case 'leave': return leaveRoom();
    case 'end-turn': return endTurnClick();
    case 'cancel': return cancelMode();
    case 'review-board': gameOverDismissed = true; return render();
    case 'minimize': botMinimized = !botMinimized; return render();
    case 'open-log': logOpen = true; return render();
    case 'close-log': logOpen = false; return render();
    case 'show-hand':
    case 'show-buy': botMinimized = false; return render();
    default: return undefined;
  }
}

/* =============================================================
   28. EVENT WIRING
   ============================================================= */

function wireEvents() {
  const svg = el('svg');
  svg.addEventListener('pointerdown', onTouchDown);
  svg.addEventListener('pointerdown', onBoardPointerDown);
  svg.addEventListener('click', onBoardClick);
  svg.addEventListener('pointermove', onBoardHover);
  svg.addEventListener('pointerleave', () => { el('tip').style.display = 'none'; });
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    view.zoom = clampZoom(view.zoom * (event.deltaY > 0 ? 1.1 : 0.9));
    drawBoard();
  }, { passive: false });

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !G) return;
    if (logOpen) { logOpen = false; return render(); }
    cancelMode();
  });
  window.addEventListener('resize', () => { if (G || ROOM || username) render(); });

  el('wheel').addEventListener('click', event => {
    const button = event.target.closest('[data-w]');
    if (button && !button.disabled) pickWheelItem(button.dataset.w);
  });
  el('buyside').addEventListener('click', event => {
    const button = event.target.closest('[data-buy]');
    if (button && !button.disabled) pickBuy(button.dataset.buy);
  });
  el('hand').addEventListener('pointerdown', onCardPointerDown);
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) runAction(button.dataset.action);
  });
  // keeps the lobby name drafts up to date as the player types
  document.addEventListener('input', event => {
    const { loadout, slot } = event.target.dataset;
    if (loadout && loadoutDraft) loadoutDraft[loadout][Number(slot)] = event.target.value;
  });
}

/* =============================================================
   29. STARTUP
   Every second: refresh the countdown. Every five seconds: send a
   heartbeat and check for penalties. Both stop once the game is over.
   ============================================================= */

wireEvents();

setInterval(() => {
  if (!ROOM || !G || G.over) return;
  tick++;
  if (tick % 5 === 0) syncPresence();
  else updateOfflineBadges();
}, 1000);

(async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    ME = session.user.id;
  } else {
    const { data, error } = await db.auth.signInAnonymously();
    if (error) { toast('Sign-in failed: ' + error.message); return; }
    ME = data.user.id;
  }
  loadSavedNames();
  const savedRoom = localStorage.getItem('versa-room');
  if (savedRoom && isValidName(username)) enterRoom(savedRoom);
  render();
})();

render();
