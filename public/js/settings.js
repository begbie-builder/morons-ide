// User settings persisted in localStorage, with a tiny pub/sub.

const KEY = 'moronide.settings';

const DEFAULTS = {
  uiStyle: 'modern',      // modern (glass/gradients) | legacy (sharp/flat)
  theme: 'dark',          // dark | light
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  minimap: true,
  lineNumbers: true,
  autoSave: false,        // debounced save on change (local + cloud)
  formatOnSave: false,
  sidebarWidth: 260,
};

let current = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings() { return current; }

export function setSetting(key, value) {
  current = { ...current, [key]: value };
  localStorage.setItem(KEY, JSON.stringify(current));
  for (const fn of listeners) fn(current, key);
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
