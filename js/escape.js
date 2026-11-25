/* Escaping and page-input checks. Every value written into innerHTML passes through here. */

import { USERNAME_PATTERN } from './config.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// escapes the five characters that can change HTML's meaning, so text is safe in content and attributes
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

// adds the V superscript to any amount written as a number followed by V (input must already be escaped)
export function markV(html) {
  return html.replace(/(\d+) ?V\b/g, '$1<span class="vs">V</span>');
}

// escapes text, then adds the V superscript
export function textWithV(text) {
  return markV(escapeHtml(text));
}

export function isValidUsername(name) {
  return USERNAME_PATTERN.test(name);
}

// turns a value read from the page into a list index, or null when it does not name an item in the list
export function indexFromPage(value, list) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < list.length ? index : null;
}

// words and numbers in the game log that get their own colour
const LOG_RULE = /(\d+\s?V\b)|(\bL\d+\b)|(\bH\d\b)|(\bobjects?\b)|(\bbarriers?\b)|(\b(?:hit|hits|miss|blocked|dies|destroyed|lost|damage|killed)\b)|(\b\d+\b)/gi;

// escapes a log line, then wraps each recognised part in a coloured span
export function colourLog(text) {
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
