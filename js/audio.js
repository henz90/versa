/* Sound effects, and applying the display settings to the page. */

import { PALETTES, SETTINGS_KEY } from './config.js';
import { settings, state } from './state.js';

let audioCtx = null;
let masterGain = null;

// creates the audio context on first use; browsers only allow sound after a user gesture
export function audioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    applySettings();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// applies the saved settings to the page: colours, text size, motion and volume
export function applySettings() {
  state.playerColors = (PALETTES[settings.palette] || PALETTES.standard).players;
  document.body.classList.toggle('palette-cb', settings.palette === 'cb');
  document.body.classList.toggle('large-text', !!settings.largeText);
  const systemWantsLessMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.toggle('reduce-motion', !!settings.reduceMotion || systemWantsLessMotion);
  if (masterGain) {
    const level = settings.muted ? 0 : Math.pow(settings.volume / 100, 2) * 0.8;
    masterGain.gain.value = level;
  }
}

// saves the settings and applies them
export function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettings();
}

// one short tone; does nothing when muted or when sound is unavailable
function tone(frequency, duration = 0.15, options = {}) {
  const ctx = audioContext();
  if (!ctx || settings.muted || !masterGain) return;
  const { type = 'sine', vol = 0.15, slideTo = null, delay = 0 } = options;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// a short burst of noise, used for hits
function noise(duration = 0.2, vol = 0.2, delay = 0) {
  const ctx = audioContext();
  if (!ctx || settings.muted || !masterGain) return;
  const start = ctx.currentTime + delay;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(gain).connect(masterGain);
  source.start(start);
}

// the named sounds the game plays
export const SOUNDS = {
  roll: () => tone(880, 0.05, { type: 'square', vol: 0.04 }),
  tick: () => tone(700, 0.05, { type: 'square', vol: 0.03 }),
  hit: () => { tone(160, 0.25, { vol: 0.35, slideTo: 50 }); noise(0.15, 0.25); },
  miss: () => tone(520, 0.35, { type: 'triangle', vol: 0.12, slideTo: 180 }),
  clank: () => { tone(1200, 0.08, { type: 'square', vol: 0.08 }); tone(300, 0.2, { vol: 0.2, slideTo: 120, delay: 0.02 }); },
  mind: () => [520, 660, 780, 1040].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.14, delay: i * 0.07 })),
  chime: () => [660, 990].forEach((f, i) => tone(f, 0.25, { vol: 0.12, delay: i * 0.1 })),
  coin: () => [1320, 1760].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.06 })),
  down: () => tone(400, 0.6, { type: 'sawtooth', vol: 0.12, slideTo: 90 }),
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.16, delay: i * 0.12 })),
  turn: () => [440, 554].forEach((f, i) => tone(f, 0.18, { vol: 0.1, delay: i * 0.12 })),
};
