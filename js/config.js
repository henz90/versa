/* Constants, palettes, timings, symbols and the database client.
   Nothing here changes while the game runs. */

export const APP_VERSION = '1.6.0';

// the database schema version this page expects; must match sql/96_full_names.sql
export const EXPECTED_SCHEMA_VERSION = '5';

export const SUPABASE_URL = 'https://jbdfcqqobtatxmmhmipa.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_74fKEI9ilefM-7pR8A8bnw_cIYLsfqu';

// the Supabase script is loaded by a classic script tag before these modules run
export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// player colours for the standard and colour-blind palettes, in player order
export const PALETTES = {
  standard: { players: ['#e4572e', '#29b6f6', '#66bb6a', '#ffca28', '#ab47bc', '#ff8a65'] },
  cb: { players: ['#0072B2', '#E69F00', '#009E73', '#F0E442', '#CC79A7', '#D55E00'] },
};

// dice outcome colours: grey while rolling, then green (win) or red (lose)
export const OUTCOME_COLOURS = {
  standard: { pending: '#9a9a9a', win: '#34c759', lose: '#e5484d' },
  cb: { pending: '#9a9a9a', win: '#009E73', lose: '#D55E00' },
};

// the coloured frame round each banner, by the kind of event
export const SOURCE_FRAME = {
  standard: {
    combat: '#ff5252', mind: '#c77dff', barrier: '#9a9a9a', object: '#ffd54f', hero: '#7cf0ff',
    develop: '#34c759', card: '#ffd54f', buy: '#8a8a96', nuke: '#ff3d3d', turn: '#8ab4ff', concede: '#ff5252',
    disconnect: '#ff5252', move: '#8ab4ff', general: '#8ab4ff',
  },
  cb: {
    combat: '#D55E00', mind: '#CC79A7', barrier: '#999999', object: '#E69F00', hero: '#56B4E9',
    develop: '#009E73', card: '#F0E442', buy: '#8a8a96', nuke: '#FFFFFF', turn: '#0072B2', concede: '#D55E00',
    disconnect: '#999999', move: '#56B4E9', general: '#56B4E9',
  },
};

export const TILE_COLORS = { str: '#7a2e38', def: '#24527a', rng: '#4f6b26', int: '#5b3478', bar: '#7a5a22' };
export const TERRAIN_PATTERN = { str: 'pat-str', def: 'pat-def', rng: 'pat-rng', int: 'pat-int', bar: 'pat-bar', gz: 'pat-gz' };
export const HERO_COLORS = ['#ff8fab', '#7cf0ff', '#c3f584', '#ffd166', '#b28dff', '#ffa94d', '#f1faee', '#90e0ef', '#e76f51', '#2ec4b6', '#f72585', '#caf0f8', '#fbf8cc', '#a0c4ff', '#ffadad', '#9bf6ff', '#bdb2ff', '#ffc6ff'];
export const NEUTRAL_FILL = '#2a2a38';
export const NEUTRAL_GREY = '#8a8a96';
export const GROUND_ZERO_FILL = '#4d4118';
export const UNOWNED_STROKE = NEUTRAL_GREY;
export const UNOCCUPIED_BARRIER = '#9a9a9a';
export const APOCALYPSE_RED = '#4a1d1d';
export const OFFLINE_LIMIT_SECONDS = 60;
export const OFFLINE_SHOW_SECONDS = 10;

export const SKILLS = ['str', 'def', 'rng', 'int'];
export const SKILL_ICON = { str: '✊', def: '🛡️', rng: '🏹', int: '🧠', bar: '🛑' };
export const SKILL_NAME = { str: 'Strength', def: 'Defense', rng: 'Range', int: 'Intelligence', bar: 'Barrier' };
export const CARD_NAME = { str: 'Strength', def: 'Defense', rng: 'Range', int: 'Intelligence', v: '5 Versa' };
export const CARD_ICON = { str: '✊', def: '🛡️', rng: '🏹', int: '🧠', v: '💰' };
export const CARD_SELL_VALUE = { str: 2, def: 2, rng: 2, int: 2, v: 5 };
export const EMOJIS = ['😂', '👏', '😱', '🔥', '🤔', '💀', '🎯', '🙃'];

// the six neighbour directions on a hex grid, in cube coordinates
export const DIRECTIONS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
export const HEX_RADIUS = 36;
export const NUKE_OFFSET = 21;
export const NUKE_RADIUS = 7;
export const APOCALYPSE_SYMBOL_SIZE = Math.round(11 * Math.sqrt(3) * HEX_RADIUS);

// the round numbers at which each phase starts
export const ROUND = { placementEnds: 5, attacksFrom: 4, declineFrom: 7 };
export const RULES = { maxHeroes: 3, maxObjects: 3, maxSkill: 5, maxBarrier: 12, actionCost: 5, heroCost: 30 };

// how long each kind of banner, chip and animation stays on screen, in milliseconds
export const TIMING = {
  importantBannerMs: 5200,
  importantGapMs: 2600,
  minorGapMs: 900,
  minorChipMs: 2400,
  rollMs: 2400,
  rollTumbleMs: 700,
  flashSafetyMs: 12000,
  nukeShakeMs: 700,
  projectileMs: 600,
  bannerQueueMax: 8,
  pinchHintMs: 8000,
};

// the symbols used on banners, side chips and the legend
export const SYM = {
  attack: '⚔', mind: '🧠', barrier: '🛑', develop: '🛠', buy: '🛒', object: '🔮', hero: '👤',
  versa: '💰', move: '🏃', turn: '➜', round: '🎲', nat20: '🎯', nuke: '☢', concede: '🏳',
  disconnect: '⏱', defended: '🛡', win: '✅', lose: '❌', up: '⬆', down: '⬇', kill: '☠', boom: '💥',
  cost: '💰', plus: '+',
};

export const SOURCE_STYLE = {
  combat: { icon: SYM.attack, label: 'Attack' },
  mind: { icon: SYM.mind, label: 'Mind Control' },
  barrier: { icon: SYM.barrier, label: 'Barrier' },
  object: { icon: SYM.object, label: 'Object' },
  hero: { icon: SYM.hero, label: 'Hero' },
  develop: { icon: SYM.develop, label: 'Develop' },
  buy: { icon: SYM.buy, label: 'Buy' },
  card: { icon: SYM.versa, label: 'Versa' },
  nuke: { icon: SYM.nuke, label: 'Nuke' },
  turn: { icon: SYM.turn, label: 'Turn' },
  concede: { icon: SYM.concede, label: 'Concede' },
  disconnect: { icon: SYM.disconnect, label: 'Disconnect' },
  move: { icon: SYM.move, label: 'Move' },
  general: { icon: '•', label: '' },
};

export const DEFENDER_MARK = SYM.defended;
export const WIN_HEADLINES = ['Hit', 'Through', 'Controlled', 'Renewed'];
export const LOSE_HEADLINES = ['Miss', 'Blocked', 'Failed', 'Resisted', 'Freed', 'Released'];
export const PROJECTILE_HEADLINES = ['Hit', 'Miss', 'Controlled', 'Renewed', 'Resisted', 'Released'];
export const IMPACT_HEADLINES = ['Hit', 'Controlled', 'Renewed'];

// wheels that must be answered and cannot be closed by tapping away
export const MUST_CHOOSE = ['moveBonus'];
export const DISCOVERY_CHOICE = 'DISCOVERY_CHOICE';
export const LOADOUT_NAME_PATTERN = /^[A-Za-z0-9 ]{0,12}$/;
export const USERNAME_PATTERN = /^[A-Za-z0-9]{2,16}$/;

export const TUTORIAL_KEY = 'versa-tutorial-done';
export const SETTINGS_KEY = 'versa-settings';
export const PINCH_KEY = 'versa-pinch-seen';

export const DEFAULT_SETTINGS = { volume: 70, muted: false, palette: 'standard', reduceMotion: false, largeText: false };
