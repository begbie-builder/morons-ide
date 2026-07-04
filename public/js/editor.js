// Monaco editor wrapper: waits for the CDN load, defines sharp flat themes,
// and manages one text model per open file.
import { languageFor } from './languages.js';
import { getSettings } from './settings.js';

let editor = null;
let ready = null;

export function whenMonacoReady() {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    if (window.monaco) return resolve(window.monaco);
    window.addEventListener('monaco-ready', () => resolve(window.monaco), { once: true });
  });
  return ready;
}

function defineThemes(monaco) {
  monaco.editor.defineTheme('moron-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'e6e6ea', background: '0b0b0c' },
      { token: 'comment', foreground: '6a6a76', fontStyle: 'italic' },
      { token: 'keyword', foreground: '4c8dff' },
      { token: 'number', foreground: 'd2a8ff' },
      { token: 'string', foreground: '3fb950' },
      { token: 'type', foreground: '56d4dd' },
      { token: 'function', foreground: 'e3b341' },
      { token: 'variable', foreground: 'e6e6ea' },
      { token: 'delimiter', foreground: '9a9aa6' },
    ],
    colors: {
      'editor.background': '#0b0b0c',
      'editor.foreground': '#e6e6ea',
      'editorLineNumber.foreground': '#3a3a42',
      'editorLineNumber.activeForeground': '#9a9aa6',
      'editorCursor.foreground': '#4c8dff',
      'editor.selectionBackground': '#2a2a30',
      'editor.lineHighlightBackground': '#121214',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#1c1c1f',
      'editorIndentGuide.activeBackground1': '#2a2a30',
      'editorWidget.background': '#121214',
      'editorWidget.border': '#2a2a30',
      'editorSuggestWidget.background': '#121214',
      'editorSuggestWidget.border': '#2a2a30',
      'editorSuggestWidget.selectedBackground': '#2a2a30',
      'editorHoverWidget.background': '#121214',
      'editorHoverWidget.border': '#2a2a30',
      'editorGutter.background': '#0b0b0c',
      'minimap.background': '#0b0b0c',
      'scrollbarSlider.background': '#2a2a3080',
      'scrollbarSlider.hoverBackground': '#3a3a42',
      'editorBracketMatch.background': '#00000000',
      'editorBracketMatch.border': '#4c8dff',
      'input.background': '#0b0b0c',
      'input.border': '#3a3a42',
      'focusBorder': '#00000000',
      'widget.shadow': '#00000000',
    },
  });

  monaco.editor.defineTheme('moron-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a6a76', fontStyle: 'italic' },
      { token: 'keyword', foreground: '1f6feb' },
      { token: 'string', foreground: '0a7d33' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#16161a',
      'editorLineNumber.foreground': '#c2c2ca',
      'editorCursor.foreground': '#1f6feb',
      'editor.selectionBackground': '#d3ddf0',
      'editor.lineHighlightBackground': '#f4f4f6',
      'editor.lineHighlightBorder': '#00000000',
      'focusBorder': '#00000000',
      'widget.shadow': '#00000000',
    },
  });
}

export async function initEditor(host) {
  const monaco = await whenMonacoReady();
  defineThemes(monaco);
  const s = getSettings();
  editor = monaco.editor.create(host, {
    model: null,
    theme: s.theme === 'light' ? 'moron-light' : 'moron-dark',
    fontSize: s.fontSize,
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Consolas, monospace',
    fontLigatures: true,
    tabSize: s.tabSize,
    wordWrap: s.wordWrap ? 'on' : 'off',
    minimap: { enabled: s.minimap },
    lineNumbers: s.lineNumbers ? 'on' : 'off',
    renderWhitespace: 'selection',
    smoothScrolling: true,
    cursorBlinking: 'phase',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 8 },
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    suggestOnTriggerCharacters: true,
    quickSuggestions: true,
    formatOnPaste: true,
    'semanticHighlighting.enabled': true,
    scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
  });
  return editor;
}

export function getEditor() { return editor; }
export function getMonaco() { return window.monaco; }

const models = new Map(); // key -> { model, viewState }
let uriSeq = 0;           // model URIs are unique & decoupled from the path,
                          // so renaming never collides with a reused path.

export function getModel(key, content, filename) {
  const monaco = window.monaco;
  let entry = models.get(key);
  if (!entry) {
    const model = monaco.editor.createModel(content ?? '', languageFor(filename), monaco.Uri.parse('inmemory://model/' + (uriSeq++)));
    model.updateOptions({ tabSize: getSettings().tabSize });
    entry = { model, viewState: null };
    models.set(key, entry);
  }
  return entry;
}

export function hasModel(key) { return models.has(key); }

export function disposeModel(key) {
  const entry = models.get(key);
  if (entry) { entry.model.dispose(); models.delete(key); }
}

export function renameModelKey(oldKey, newKey, filename) {
  const entry = models.get(oldKey);
  if (!entry) return;
  models.delete(oldKey);
  models.set(newKey, entry);
  if (filename) window.monaco.editor.setModelLanguage(entry.model, languageFor(filename));
}

export function showModel(key) {
  const entry = models.get(key);
  if (!entry || !editor) return;
  editor.setModel(entry.model);
  if (entry.viewState) editor.restoreViewState(entry.viewState);
  editor.focus();
}

export function stashViewState(key) {
  const entry = models.get(key);
  if (entry && editor) entry.viewState = editor.saveViewState();
}

export function applyEditorSettings() {
  if (!editor) return;
  const s = getSettings();
  editor.updateOptions({
    fontSize: s.fontSize,
    wordWrap: s.wordWrap ? 'on' : 'off',
    minimap: { enabled: s.minimap },
    lineNumbers: s.lineNumbers ? 'on' : 'off',
    tabSize: s.tabSize,
  });
  for (const { model } of models.values()) model.updateOptions({ tabSize: s.tabSize });
  window.monaco.editor.setTheme(s.theme === 'light' ? 'moron-light' : 'moron-dark');
}
