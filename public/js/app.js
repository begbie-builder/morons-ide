// MoronIDE bootstrap and orchestration.
import { $, el, basename, dirname, joinPath, debounce, escapeHtml, fuzzyScore } from './util.js';
import { toast, prompt, confirm, contextMenu } from './ui.js';
import { getSettings, setSetting, onSettingsChange } from './settings.js';
import { languageFor, isProbablyBinary, isImage } from './languages.js';
import {
  initEditor, getEditor, getMonaco, getModel, showModel, stashViewState,
  disposeModel, renameModelKey, applyEditorSettings, hasModel,
} from './editor.js';
import { LocalProvider } from './providers/local.js';
import { getRecentFolders } from './idb.js';
import { renderCloudPanel } from './cloudpanel.js';

const IGNORE_WALK = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build', '.next', '.cache']);

// ---------------------------------------------------------------- state ----
const state = {
  provider: null,          // active workspace provider
  tabs: [],                // [{ key, path, name, dirty, untitled, disposer }]
  activeKey: null,
  expanded: new Set(),     // expanded directory paths
  selected: '',            // selected tree path
  untitledSeq: 0,
  fileCache: null,         // cached flat file list for quick-open
};

const dom = {
  tree: $('#tree'),
  explorerEmpty: $('#explorer-empty'),
  workspaceName: $('#workspace-name'),
  tabs: $('#tabs'),
  editorHost: $('#editor'),
  welcome: $('#welcome'),
  statusbar: $('#statusbar'),
  statusMode: $('#status-mode'),
  statusPath: $('#status-path'),
  statusLang: $('#status-lang'),
  statusPos: $('#status-pos'),
  statusIndent: $('#status-indent'),
  statusEol: $('#status-eol'),
  main: $('#main'),
  sidebar: $('#sidebar'),
};

function wsId() {
  if (!state.provider) return 'none';
  return state.provider.id === 'cloud' ? `cloud:${state.provider.project.id}` : `local:${state.provider.name}`;
}
const keyFor = (path) => `${wsId()}::${path}`;

// ---------------------------------------------------------------- boot -----
async function boot() {
  await initEditor(dom.editorHost);
  wireEditorEvents();
  wireGlobalCommands();
  wireRail();
  wireResizer();
  wireKeyboard();
  wireSearch();
  applyTheme();
  renderSettingsPanel();
  updateExplorerEmpty();
  updateWelcome();
  updateStatus();
  await renderCloudPanel({ onOpenProject: openCloudProject, onSignOut: onCloudSignOut });
  await showRecentInEmpty();
  onSettingsChange(() => { applyTheme(); applyEditorSettings(); renderSettingsPanel(); updateStatus(); });
  toast('MoronIDE ready', 'Open a folder or sign in to the cloud to begin.', 'success');
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', getSettings().theme);
  dom.main.style.setProperty('--sidebar-w', getSettings().sidebarWidth + 'px');
}

// ------------------------------------------------------------- editor ------
function wireEditorEvents() {
  const editor = getEditor();
  editor.onDidChangeCursorPosition((e) => {
    dom.statusPos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });
}

function attachModelDirty(key, tab) {
  const { model } = getModel(key);
  tab.disposer?.dispose?.();
  tab.disposer = model.onDidChangeContent(() => {
    if (!tab.dirty) { tab.dirty = true; renderTabs(); markTreeDirty(); }
    if (getSettings().autoSave && !tab.untitled) scheduleAutoSave(key);
  });
}

const autoSavers = new Map();
function scheduleAutoSave(key) {
  if (!autoSavers.has(key)) autoSavers.set(key, debounce(() => saveKey(key), 900));
  autoSavers.get(key)();
}

// --------------------------------------------------------- providers -------
async function setProvider(provider) {
  // Closing the workspace discards open editors for the old workspace.
  for (const tab of [...state.tabs]) closeTab(tab.key, true);
  state.provider = provider;
  state.expanded = new Set();
  state.selected = '';
  state.fileCache = null;
  dom.workspaceName.textContent = provider ? provider.label() : 'No Folder Open';
  updateExplorerEmpty();
  updateWelcome();
  updateStatus();
  if (provider) await renderTreeRoot();
}

async function openLocalFolder() {
  if (!LocalProvider.supported()) {
    toast('Local folders unsupported', 'Your browser lacks the File System Access API. Use Chrome, Edge, Brave or Arc — or use Cloud storage.', 'error');
    return;
  }
  try {
    const provider = await LocalProvider.pick();
    await setProvider(provider);
    toast('Folder opened', provider.name, 'success');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Could not open folder', e.message, 'error');
  }
}

async function openRecentFolder(handle) {
  try {
    const provider = await LocalProvider.fromHandle(handle);
    await setProvider(provider);
  } catch (e) {
    toast('Could not reopen folder', e.message, 'error');
  }
}

async function openCloudProject(project) {
  const { CloudProvider } = await import('./providers/cloud.js');
  await setProvider(new CloudProvider(project));
  showPanel('explorer');
  toast('Cloud project opened', project.name, 'success');
}

function onCloudSignOut() {
  if (state.provider?.id === 'cloud') setProvider(null);
}

// -------------------------------------------------------- file tree --------
function fileIcon(kind, open) {
  if (kind === 'dir') {
    return open
      ? `<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v2H3zM3 11h18l-1.5 8H4.5z"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24"><path d="M13 3H6v18h12V8zM13 3v5h5"/></svg>`;
}
const twistIcon = `<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`;

function makeRow(node, depth) {
  const isDir = node.kind === 'dir';
  const row = el('div', {
    class: `row ${isDir ? 'dir' : 'file'}`,
    'data-path': node.path,
    'data-kind': node.kind,
    title: node.path,
  });
  row.style.paddingLeft = 4 + depth * 12 + 'px';
  row.append(
    el('span', { class: 'twist', html: isDir ? twistIcon : '' }),
    el('span', { class: 'ficon', html: fileIcon(node.kind, false) }),
    el('span', { class: 'label' }, el('span', { class: 'label-text', text: node.name })),
  );
  row.addEventListener('click', (e) => { e.stopPropagation(); onRowClick(node, row, depth); });
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); state.selected = node.path; markSelected(); openContextMenu(e.clientX, e.clientY, node); });
  return row;
}

async function renderTreeRoot() {
  dom.tree.innerHTML = '';
  try {
    const children = await state.provider.children('');
    const frag = document.createDocumentFragment();
    for (const node of children) frag.append(makeRow(node, 0));
    dom.tree.append(frag);
    updateExplorerEmpty();
  } catch (e) {
    toast('Could not read workspace', e.message, 'error');
  }
}

async function onRowClick(node, row, depth) {
  state.selected = node.path;
  markSelected();
  if (node.kind === 'dir') {
    if (state.expanded.has(node.path)) collapseDir(row, node.path);
    else await expandDir(row, node.path, depth);
  } else {
    openFile(node.path);
  }
}

async function expandDir(row, path, depth) {
  state.expanded.add(path);
  row.classList.add('open');
  row.querySelector('.ficon').innerHTML = fileIcon('dir', true);
  try {
    const children = await state.provider.children(path);
    const holder = el('div', { class: 'dir-children', 'data-parent': path });
    for (const node of children) holder.append(makeRow(node, depth + 1));
    row.after(holder);
  } catch (e) {
    toast('Could not read folder', e.message, 'error');
    state.expanded.delete(path);
    row.classList.remove('open');
  }
}

function collapseDir(row, path) {
  state.expanded.delete(path);
  row.classList.remove('open');
  row.querySelector('.ficon').innerHTML = fileIcon('dir', false);
  const holder = row.nextElementSibling;
  if (holder && holder.classList.contains('dir-children') && holder.dataset.parent === path) holder.remove();
}

function rowByPath(path) { return dom.tree.querySelector(`.row[data-path="${cssEscape(path)}"]`); }
function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); }

function markSelected() {
  for (const r of dom.tree.querySelectorAll('.row.selected')) r.classList.remove('selected');
  const r = rowByPath(state.selected);
  if (r) r.classList.add('selected');
}

function markTreeDirty() {
  for (const r of dom.tree.querySelectorAll('.row.dirty')) r.classList.remove('dirty');
  for (const tab of state.tabs) {
    if (tab.dirty && !tab.untitled) { const r = rowByPath(tab.path); if (r) r.classList.add('dirty'); }
  }
}

async function refreshTree() {
  const previouslyExpanded = new Set(state.expanded);
  state.expanded = new Set();
  state.fileCache = null;
  await renderTreeRoot();
  // Re-expand what was open (breadth-first).
  const toOpen = [...previouslyExpanded].sort((a, b) => a.split('/').length - b.split('/').length);
  for (const path of toOpen) {
    const row = rowByPath(path);
    if (row) { const depth = (path.match(/\//g) || []).length; await expandDir(row, path, depth); }
  }
  markSelected();
  markTreeDirty();
}

// -------------------------------------------------------- context menu -----
function openContextMenu(x, y, node) {
  const items = [];
  if (node.kind === 'dir') {
    items.push({ label: 'New File', action: () => newFile(node.path) });
    items.push({ label: 'New Folder', action: () => newFolder(node.path) });
    items.push('-');
  } else {
    items.push({ label: 'Open', action: () => openFile(node.path) });
    if (state.provider.id === 'local' && isImage(node.name)) items.push({ label: 'Preview Image', action: () => previewImage(node.path) });
    items.push('-');
  }
  items.push({ label: 'Rename', action: () => renameNode(node) });
  items.push({ label: 'Duplicate', action: () => duplicateNode(node) });
  items.push({ label: 'Delete', danger: true, action: () => deleteNode(node) });
  contextMenu(x, y, items);
}

// Right-clicking empty tree area targets the workspace root.
dom.tree.addEventListener('contextmenu', (e) => {
  if (e.target !== dom.tree || !state.provider) return;
  e.preventDefault();
  contextMenu(e.clientX, e.clientY, [
    { label: 'New File', action: () => newFile('') },
    { label: 'New Folder', action: () => newFolder('') },
    { label: 'Refresh', action: () => refreshTree() },
  ]);
});

// --------------------------------------------------------- file ops --------
function targetDir(path) {
  // Where new items go: the given dir, or the parent dir of a file, or root.
  if (path == null) path = state.selected;
  if (!path) return '';
  const row = rowByPath(path);
  if (row && row.dataset.kind === 'dir') return path;
  return dirname(path);
}

async function newFile(atPath) {
  if (!state.provider) { newUntitled(); return; }
  const dir = targetDir(atPath);
  const name = await prompt({ title: 'New File', label: dir ? `In ${dir}/` : 'In workspace root', placeholder: 'example.js', okText: 'Create' });
  if (!name) return;
  const path = joinPath(dir, name);
  try {
    await state.provider.createFile(path);
    await ensureExpanded(dir);
    await refreshTree();
    openFile(path);
    state.fileCache = null;
  } catch (e) { toast('Create failed', e.message, 'error'); }
}

async function newFolder(atPath) {
  if (!state.provider) { toast('Open a workspace first'); return; }
  const dir = targetDir(atPath);
  const name = await prompt({ title: 'New Folder', label: dir ? `In ${dir}/` : 'In workspace root', placeholder: 'src', okText: 'Create' });
  if (!name) return;
  const path = joinPath(dir, name);
  try {
    await state.provider.createDir(path);
    await ensureExpanded(dir);
    await refreshTree();
    state.fileCache = null;
  } catch (e) { toast('Create failed', e.message, 'error'); }
}

async function ensureExpanded(dir) {
  if (!dir) return;
  const parts = dir.split('/');
  let acc = '';
  for (const p of parts) { acc = acc ? `${acc}/${p}` : p; state.expanded.add(acc); }
}

async function renameNode(node) {
  const name = await prompt({ title: 'Rename', value: node.name, okText: 'Rename', select: 'stem' });
  if (!name || name === node.name) return;
  const newPath = joinPath(dirname(node.path), name);
  try {
    await state.provider.rename(node.path, newPath);
    // Move any open tabs/models pointing at the old path.
    for (const tab of state.tabs) {
      if (tab.path === node.path || tab.path.startsWith(node.path + '/')) {
        const suffix = tab.path.slice(node.path.length);
        const np = newPath + suffix;
        renameModelKey(keyFor(tab.path), keyFor(np), basename(np));
        if (state.activeKey === tab.key) state.activeKey = keyFor(np);
        tab.path = np; tab.name = basename(np); tab.key = keyFor(np);
      }
    }
    state.fileCache = null;
    await refreshTree();
    renderTabs();
    updateStatus();
  } catch (e) { toast('Rename failed', e.message, 'error'); }
}

async function duplicateNode(node) {
  const name = await prompt({ title: 'Duplicate', value: node.name.replace(/(\.[^.]+)?$/, ' copy$&'), okText: 'Duplicate', select: 'stem' });
  if (!name || name === node.name) return;
  const newPath = joinPath(dirname(node.path), name);
  try {
    if (node.kind === 'file') {
      const { text } = await state.provider.read(node.path);
      await state.provider.write(newPath, text);
    } else {
      // Copy a directory by read/writing each file underneath it.
      const files = (await state.provider.listAllFiles?.()) || [];
      const under = files.filter((p) => p === node.path || p.startsWith(node.path + '/'));
      if (!under.length) await state.provider.createDir(newPath);
      for (const f of under) {
        const { text } = await state.provider.read(f);
        await state.provider.write(newPath + f.slice(node.path.length), text);
      }
    }
    state.fileCache = null;
    await refreshTree();
  } catch (e) { toast('Duplicate failed', e.message, 'error'); }
}

async function deleteNode(node) {
  const ok = await confirm({ title: 'Delete', message: `Delete "${node.name}"? This cannot be undone.`, okText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await state.provider.remove(node.path);
    for (const tab of [...state.tabs]) {
      if (tab.path === node.path || tab.path.startsWith(node.path + '/')) closeTab(tab.key, true);
    }
    state.fileCache = null;
    await refreshTree();
    updateWelcome();
  } catch (e) { toast('Delete failed', e.message, 'error'); }
}

async function previewImage(path) {
  try {
    const url = await state.provider.readBlobUrl(path);
    window.open(url, '_blank');
  } catch (e) { toast('Preview failed', e.message, 'error'); }
}

// ------------------------------------------------------------- tabs --------
async function openFile(path, opts = {}) {
  const key = keyFor(path);
  const name = basename(path);
  if (isProbablyBinary(name) && !opts.force) {
    if (isImage(name) && state.provider.id === 'local') return previewImage(path);
    toast('Binary file', `${name} is not a text file and was not opened.`, 'error');
    return;
  }
  let tab = state.tabs.find((t) => t.key === key);
  if (!tab) {
    let content = '';
    try { content = (await state.provider.read(path)).text; }
    catch (e) { toast('Open failed', e.message, 'error'); return; }
    getModel(key, content, name);
    tab = { key, path, name, dirty: false, untitled: false };
    attachModelDirty(key, tab);
    state.tabs.push(tab);
  }
  activateTab(key);
  if (opts.line) {
    const editor = getEditor();
    editor.revealLineInCenter(opts.line);
    editor.setPosition({ lineNumber: opts.line, column: (opts.column || 0) + 1 });
  }
  renderTabs();
  markSelected();
}

function newUntitled() {
  const n = ++state.untitledSeq;
  const key = `untitled:${n}`;
  const name = `Untitled-${n}`;
  getModel(key, '', name);
  const tab = { key, path: null, name, dirty: false, untitled: true };
  attachModelDirty(key, tab);
  state.tabs.push(tab);
  activateTab(key);
  renderTabs();
}

function activateTab(key) {
  if (state.activeKey && state.activeKey !== key) stashViewState(state.activeKey);
  state.activeKey = key;
  showModel(key);
  updateWelcome();
  updateStatus();
  renderTabs();
}

function closeTab(key, force = false) {
  const idx = state.tabs.findIndex((t) => t.key === key);
  if (idx === -1) return;
  const tab = state.tabs[idx];
  if (tab.dirty && !force) {
    confirm({ title: 'Unsaved changes', message: `"${tab.name}" has unsaved changes. Close without saving?`, okText: 'Close', danger: true })
      .then((ok) => { if (ok) reallyClose(key, idx); });
    return;
  }
  reallyClose(key, idx);
}

function reallyClose(key, idx) {
  const tab = state.tabs[idx];
  tab.disposer?.dispose?.();
  disposeModel(key);
  state.tabs.splice(idx, 1);
  if (state.activeKey === key) {
    const next = state.tabs[idx] || state.tabs[idx - 1];
    if (next) activateTab(next.key);
    else { state.activeKey = null; getEditor().setModel(null); updateWelcome(); updateStatus(); }
  }
  renderTabs();
  markTreeDirty();
}

function renderTabs() {
  dom.tabs.innerHTML = '';
  for (const tab of state.tabs) {
    const node = el('div', { class: `tab ${tab.key === state.activeKey ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}`, title: tab.path || tab.name },
      el('span', { class: 'tab-name', text: tab.name }),
      el('span', { class: 'tab-dot' }),
      el('span', { class: 'tab-close', html: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
        onclick: (e) => { e.stopPropagation(); closeTab(tab.key); } }),
    );
    node.addEventListener('click', () => activateTab(tab.key));
    node.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.key); } });
    dom.tabs.append(node);
  }
}

// ------------------------------------------------------------- save --------
function activeTab() { return state.tabs.find((t) => t.key === state.activeKey); }

async function saveActive() {
  const tab = activeTab();
  if (!tab) return;
  if (tab.untitled) return saveUntitledAs(tab);
  await saveKey(tab.key);
}

async function saveKey(key) {
  const tab = state.tabs.find((t) => t.key === key);
  if (!tab || tab.untitled || !state.provider) return;
  const { model } = getModel(key);
  try {
    if (getSettings().formatOnSave) {
      const ed = getEditor();
      if (ed.getModel() === model) await ed.getAction('editor.action.formatDocument')?.run().catch(() => {});
    }
    await state.provider.write(tab.path, model.getValue());
    tab.dirty = false;
    renderTabs();
    markTreeDirty();
    flashStatus(`Saved ${tab.name}`);
  } catch (e) { toast('Save failed', e.message, 'error'); }
}

async function saveUntitledAs(tab) {
  if (!state.provider) {
    // No workspace — fall back to a browser download.
    const name = await prompt({ title: 'Download File', value: tab.name.startsWith('Untitled') ? 'untitled.txt' : tab.name, okText: 'Download', select: 'stem' });
    if (!name) return;
    downloadText(name, getModel(tab.key).model.getValue());
    tab.dirty = false; renderTabs();
    return;
  }
  const name = await prompt({ title: 'Save As', label: 'Path within the workspace', placeholder: 'src/new.js', okText: 'Save' });
  if (!name) return;
  const path = name;
  try {
    await state.provider.write(path, getModel(tab.key).model.getValue());
    const newKey = keyFor(path);
    renameModelKey(tab.key, newKey, basename(path));
    tab.disposer?.dispose?.();
    tab.key = newKey; tab.path = path; tab.name = basename(path); tab.untitled = false; tab.dirty = false;
    getMonaco().editor.setModelLanguage(getModel(newKey).model, languageFor(path));
    attachModelDirty(newKey, tab);
    if (state.activeKey && state.activeKey.startsWith('untitled:')) state.activeKey = newKey;
    state.fileCache = null;
    await ensureExpanded(dirname(path));
    await refreshTree();
    renderTabs();
    updateStatus();
    flashStatus(`Saved ${tab.name}`);
  } catch (e) { toast('Save failed', e.message, 'error'); }
}

async function saveAll() {
  for (const tab of state.tabs) if (tab.dirty && !tab.untitled) await saveKey(tab.key);
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------ status -------
function updateStatus() {
  const cloud = state.provider?.id === 'cloud';
  dom.statusbar.classList.toggle('disconnected', !state.provider);
  dom.statusMode.textContent = state.provider ? (cloud ? 'Cloud' : 'Local') : 'No Workspace';
  dom.statusPath.textContent = state.provider ? state.provider.label() : '';
  const tab = activeTab();
  if (tab) {
    const lang = languageFor(tab.name);
    dom.statusLang.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
    const model = getModel(tab.key).model;
    dom.statusEol.textContent = model.getEOL() === '\n' ? 'LF' : 'CRLF';
  } else {
    dom.statusLang.textContent = 'Plain Text';
    dom.statusPos.textContent = 'Ln 1, Col 1';
  }
  dom.statusIndent.textContent = `Spaces: ${getSettings().tabSize}`;
}

let flashTimer;
function flashStatus(msg) {
  clearTimeout(flashTimer);
  const prev = dom.statusPath.textContent;
  dom.statusPath.textContent = msg;
  flashTimer = setTimeout(() => updateStatus(), 1400);
}

function updateWelcome() {
  const has = state.tabs.length > 0;
  dom.welcome.classList.toggle('hidden', has);
  dom.editorHost.classList.toggle('hidden', !has);
}

function updateExplorerEmpty() {
  const empty = !state.provider;
  dom.explorerEmpty.hidden = !empty;
  dom.tree.hidden = empty;
}

async function showRecentInEmpty() {
  if (!LocalProvider.supported()) return;
  try {
    const recents = await getRecentFolders();
    if (!recents.length) return;
    const box = el('div', { class: 'panel-empty', style: 'padding-top:0' });
    box.append(el('p', { class: 'hint', text: 'Recent folders' }));
    for (const r of recents.slice(0, 5)) {
      box.append(el('button', { class: 'btn wide', onclick: () => openRecentFolder(r.handle) }, r.name));
    }
    dom.explorerEmpty.append(box);
  } catch { /* ignore */ }
}

// ------------------------------------------------------ rail / panels ------
function wireRail() {
  for (const btn of document.querySelectorAll('.rail-btn')) {
    btn.addEventListener('click', () => showPanel(btn.dataset.panel));
  }
}

function showPanel(name) {
  if (dom.main.classList.contains('sidebar-collapsed')) dom.main.classList.remove('sidebar-collapsed');
  for (const b of document.querySelectorAll('.rail-btn')) b.classList.toggle('active', b.dataset.panel === name);
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.dataset.panel === name);
  if (name === 'search') setTimeout(() => $('#search-input')?.focus(), 0);
}

function toggleSidebar() { dom.main.classList.toggle('sidebar-collapsed'); }

// --------------------------------------------------------- resizer ---------
function wireResizer() {
  const r = $('#resizer');
  let dragging = false;
  r.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); document.body.style.cursor = 'col-resize'; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.min(560, Math.max(160, e.clientX - 48));
    dom.main.style.setProperty('--sidebar-w', w + 'px');
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; document.body.style.cursor = '';
    const w = parseInt(getComputedStyle(dom.main).getPropertyValue('--sidebar-w'));
    setSetting('sidebarWidth', w);
  });
}

// ------------------------------------------------------- global cmds -------
function wireGlobalCommands() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cmd]');
    if (!t) return;
    runCommand(t.dataset.cmd);
  });
}

function runCommand(cmd) {
  switch (cmd) {
    case 'open-folder': return openLocalFolder();
    case 'new-file': return newFile(state.selected);
    case 'new-folder': return newFolder(state.selected);
    case 'save': return saveActive();
    case 'save-all': return saveAll();
    case 'refresh-tree': return refreshTree();
    case 'collapse-tree': return collapseAll();
    case 'palette': return openPalette('command');
    case 'quick-open': return openPalette('files');
    case 'cloud-panel': return showPanel('cloud');
    case 'pick-language': return pickLanguage();
    case 'goto-line': return getEditor().getAction('editor.action.gotoLine')?.run();
    case 'toggle-theme': return setSetting('theme', getSettings().theme === 'dark' ? 'light' : 'dark');
    case 'toggle-sidebar': return toggleSidebar();
    case 'format': return getEditor().getAction('editor.action.formatDocument')?.run();
    case 'close-tab': return state.activeKey && closeTab(state.activeKey);
    case 'find-in-files': return showPanel('search');
  }
}

function collapseAll() {
  state.expanded = new Set();
  renderTreeRoot();
}

// ------------------------------------------------------ language pick ------
function pickLanguage() {
  const tab = activeTab();
  if (!tab) return;
  const monaco = getMonaco();
  const langs = monaco.languages.getLanguages().map((l) => ({ id: l.id, label: l.aliases?.[0] || l.id }));
  openPalette('custom', {
    placeholder: 'Select language mode…',
    items: langs.map((l) => ({ label: l.label, sub: l.id, run: () => { monaco.editor.setModelLanguage(getModel(tab.key).model, l.id); updateStatus(); } })),
  });
}

// ---------------------------------------------------- command palette ------
const COMMANDS = () => [
  { label: 'Open Local Folder', kbd: 'Ctrl O', run: () => openLocalFolder() },
  { label: 'New File', kbd: 'Ctrl N', run: () => newFile(state.selected) },
  { label: 'New Folder', run: () => newFolder(state.selected) },
  { label: 'New Untitled File', run: () => newUntitled() },
  { label: 'Save', kbd: 'Ctrl S', run: () => saveActive() },
  { label: 'Save All', run: () => saveAll() },
  { label: 'Quick Open File…', kbd: 'Ctrl P', run: () => openPalette('files') },
  { label: 'Find in Files', kbd: 'Ctrl Shift F', run: () => showPanel('search') },
  { label: 'Format Document', kbd: 'Shift Alt F', run: () => runCommand('format') },
  { label: 'Change Language Mode', run: () => pickLanguage() },
  { label: 'Go to Line…', run: () => runCommand('goto-line') },
  { label: 'Toggle Word Wrap', run: () => setSetting('wordWrap', !getSettings().wordWrap) },
  { label: 'Toggle Minimap', run: () => setSetting('minimap', !getSettings().minimap) },
  { label: 'Toggle Theme (Dark/Light)', run: () => runCommand('toggle-theme') },
  { label: 'Toggle Sidebar', kbd: 'Ctrl B', run: () => toggleSidebar() },
  { label: 'Cloud Storage Panel', run: () => showPanel('cloud') },
  { label: 'Settings', run: () => showPanel('settings') },
  { label: 'Refresh File Tree', run: () => refreshTree() },
  { label: 'Close Tab', kbd: 'Ctrl W', run: () => runCommand('close-tab') },
];

async function openPalette(mode, custom = {}) {
  let items = [];
  let placeholder = 'Type a command…';
  if (mode === 'command') {
    items = COMMANDS().map((c) => ({ label: c.label, kbd: c.kbd, run: c.run }));
    placeholder = 'Type a command…';
  } else if (mode === 'files') {
    if (!state.provider) { toast('Open a workspace first'); return; }
    placeholder = 'Search files by name…';
    const files = await getFileList();
    items = files.map((p) => ({ label: basename(p), sub: p, run: () => openFile(p) }));
  } else if (mode === 'custom') {
    items = custom.items; placeholder = custom.placeholder || placeholder;
  }
  renderPalette(items, placeholder, mode);
}

async function getFileList() {
  if (state.fileCache) return state.fileCache;
  try {
    state.fileCache = (await state.provider.listAllFiles(IGNORE_WALK)) || [];
  } catch { state.fileCache = []; }
  return state.fileCache;
}

function renderPalette(items, placeholder, mode) {
  const root = $('#modal-root');
  root.innerHTML = '';
  const input = el('input', { type: 'text', placeholder, spellcheck: 'false', autocomplete: 'off' });
  const list = el('div', { class: 'palette-list' });
  const overlay = el('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'palette' }, input, list));
  root.append(overlay);

  let filtered = items;
  let sel = 0;

  function draw() {
    list.innerHTML = '';
    if (!filtered.length) { list.append(el('div', { class: 'palette-empty', text: 'No matches' })); return; }
    filtered.slice(0, 200).forEach((item, i) => {
      list.append(el('div', { class: `palette-item ${i === sel ? 'sel' : ''}`, onclick: () => choose(item) },
        el('span', { class: 'pi-main' }, item.label, item.sub ? el('span', { class: 'pi-sub', text: '  ' + item.sub }) : null),
        item.kbd ? el('span', { class: 'pi-kbd', text: item.kbd }) : null,
      ));
    });
    const selNode = list.children[sel];
    selNode?.scrollIntoView({ block: 'nearest' });
  }

  function filter(q) {
    if (!q) { filtered = items; sel = 0; draw(); return; }
    filtered = items
      .map((it) => ({ it, score: Math.max(fuzzyScore(q, it.label), it.sub ? fuzzyScore(q, it.sub) - 2 : -1) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it);
    sel = 0; draw();
  }

  function choose(item) { close(); item.run?.(); }
  function close() { root.innerHTML = ''; }

  input.addEventListener('input', () => filter(input.value.trim()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[sel]) choose(filtered[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  draw();
  input.focus();
}

// -------------------------------------------------------- find in files ----
function wireSearch() {
  const input = $('#search-input');
  const results = $('#search-results');
  const run = debounce(async () => {
    const q = input.value;
    results.innerHTML = '';
    if (!q || !state.provider) return;
    const caseSensitive = $('#search-case').checked;
    results.append(el('div', { class: 'sr-file', text: 'Searching…' }));
    const files = await getFileList();
    results.innerHTML = '';
    let hits = 0, scanned = 0;
    const needle = caseSensitive ? q : q.toLowerCase();
    for (const path of files) {
      if (hits > 400 || scanned > 1500) break;
      if (isProbablyBinary(basename(path))) continue;
      let text;
      try { text = (await state.provider.read(path)).text; } catch { continue; }
      scanned++;
      if ((caseSensitive ? text : text.toLowerCase()).indexOf(needle) === -1) continue;
      const lines = text.split('\n');
      const fileHits = [];
      for (let i = 0; i < lines.length && fileHits.length < 50; i++) {
        const hay = caseSensitive ? lines[i] : lines[i].toLowerCase();
        const col = hay.indexOf(needle);
        if (col === -1) continue;
        fileHits.push({ line: i + 1, col, text: lines[i] });
        hits++;
      }
      if (!fileHits.length) continue;
      results.append(el('div', { class: 'sr-file', html: `<b>${escapeHtml(basename(path))}</b> ${escapeHtml(dirname(path))}` }));
      for (const h of fileHits) {
        const before = escapeHtml(h.text.slice(Math.max(0, h.col - 24), h.col));
        const match = escapeHtml(h.text.substr(h.col, q.length));
        const after = escapeHtml(h.text.slice(h.col + q.length, h.col + q.length + 60));
        results.append(el('div', { class: 'sr-hit', html: `<span class="ln">${h.line}</span>${before}<mark>${match}</mark>${after}`,
          onclick: () => openFile(path, { line: h.line, column: h.col }) }));
      }
    }
    if (!hits) results.append(el('div', { class: 'sr-file', text: 'No results' }));
  }, 300);
  input.addEventListener('input', run);
  $('#search-case').addEventListener('change', run);
}

// ---------------------------------------------------------- settings -------
function renderSettingsPanel() {
  const body = $('#settings-body');
  const s = getSettings();
  body.innerHTML = '';
  const sel = (label, key, options, help) => {
    const wrap = el('div', { class: 'setting' });
    wrap.append(el('label', { text: label }));
    const select = el('select');
    for (const o of options) select.append(el('option', { value: o.value, ...(String(o.value) === String(s[key]) ? { selected: true } : {}) }, o.label));
    select.addEventListener('change', () => setSetting(key, isNaN(select.value) || key === 'theme' ? select.value : Number(select.value)));
    wrap.append(select);
    if (help) wrap.append(el('small', { text: help }));
    body.append(wrap);
  };
  const num = (label, key, min, max, help) => {
    const wrap = el('div', { class: 'setting' });
    wrap.append(el('label', { text: label }));
    const input = el('input', { type: 'number', min, max, value: s[key] });
    input.addEventListener('change', () => setSetting(key, Math.min(max, Math.max(min, Number(input.value) || min))));
    wrap.append(input);
    if (help) wrap.append(el('small', { text: help }));
    body.append(wrap);
  };
  const toggle = (label, key) => {
    const wrap = el('div', { class: 'setting inline' });
    wrap.append(el('label', { text: label }));
    const sw = el('div', { class: `switch ${s[key] ? 'on' : ''}` });
    sw.addEventListener('click', () => setSetting(key, !getSettings()[key]));
    wrap.append(sw);
    body.append(wrap);
  };

  sel('Theme', 'theme', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]);
  num('Font Size', 'fontSize', 8, 40);
  sel('Tab Size', 'tabSize', [{ value: 2, label: '2 spaces' }, { value: 4, label: '4 spaces' }, { value: 8, label: '8 spaces' }]);
  toggle('Word Wrap', 'wordWrap');
  toggle('Minimap', 'minimap');
  toggle('Line Numbers', 'lineNumbers');
  toggle('Auto Save', 'autoSave');
  toggle('Format On Save', 'formatOnSave');
}

// -------------------------------------------------------- keyboard ---------
function wireKeyboard() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); return openPalette('command'); }
    if (mod && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); return showPanel('search'); }
    if (mod && !e.shiftKey && (e.key === 'p')) { e.preventDefault(); return openPalette('files'); }
    if (mod && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); return openLocalFolder(); }
    if (mod && (e.key === 's' || e.key === 'S') && !e.shiftKey) { e.preventDefault(); return saveActive(); }
    if (mod && e.shiftKey && (e.key === 'S')) { e.preventDefault(); return saveAll(); }
    if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); return newUntitled(); }
    if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); return toggleSidebar(); }
    if (mod && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); return state.activeKey && closeTab(state.activeKey); }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.tabs.some((t) => t.dirty)) { e.preventDefault(); e.returnValue = ''; }
  });
}

boot();
