// Sidebar "Cloud Storage" panel: sign in, manage projects, pick one to open.
import { el, $ } from './util.js';
import { toast, prompt, confirm } from './ui.js';
import { CloudAuth, listProjects, createProject, renameProject, deleteProject } from './providers/cloud.js';

let handlers = {};
let activeProjectId = null;

export async function renderCloudPanel(h = {}) {
  handlers = { ...handlers, ...h };
  const body = $('#cloud-panel-body');
  const chip = $('#account-chip');

  if (!CloudAuth.configured()) {
    chip.textContent = 'Cloud: not set up';
    chip.classList.remove('on');
    body.innerHTML = '';
    body.append(el('div', { class: 'notice', html:
      'Cloud storage is <b>not configured yet</b>.<br><br>' +
      'Open <code>SETUP.md</code> and follow the steps to create a free Firebase ' +
      'project, then paste your keys into <code>public/js/firebase-config.js</code>. ' +
      'Local folder editing works without any of this.' }));
    return;
  }

  body.innerHTML = '';
  body.append(el('p', { text: 'Loading account…' }));

  // React to auth state changes (fires immediately with the current user).
  try {
    await CloudAuth.onChange((user) => paintAuthState(user).catch((e) => showError(e)));
  } catch (e) {
    showError(e);
  }
}

async function paintAuthState(user) {
  const body = $('#cloud-panel-body');
  const chip = $('#account-chip');
  body.innerHTML = '';

  if (!user) {
    chip.textContent = 'Cloud: signed out';
    chip.classList.remove('on');
    activeProjectId = null;
    body.append(el('h4', { text: 'Sign in' }));
    body.append(el('p', { text: 'Sign in to store projects in the cloud and access them from any device.' }));
    body.append(el('button', { class: 'btn wide primary', onclick: () => guard(CloudAuth.signInGoogle()) }, 'Sign in with Google'));
    body.append(el('button', { class: 'btn wide', onclick: () => guard(CloudAuth.signInAnonymously()) }, 'Continue as Guest'));
    body.append(emailForm());
    return;
  }

  const label = user.isAnonymous ? 'Guest' : (user.displayName || user.email || 'Signed in');
  chip.textContent = 'Cloud: ' + label;
  chip.classList.add('on');

  body.append(el('div', { class: 'cloud-user' },
    el('div', { class: 'who' }, el('b', { text: label }), el('small', { text: user.isAnonymous ? 'Anonymous session' : (user.email || user.uid.slice(0, 10)) })),
    el('button', { class: 'btn', onclick: () => guard(CloudAuth.signOut()) }, 'Sign out'),
  ));

  const head = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin:6px 0' },
    el('h4', { text: 'Projects', style: 'margin:0' }),
    el('button', { class: 'btn', onclick: () => onNewProject() }, '+ New'),
  );
  body.append(head);

  const listWrap = el('div', { class: 'proj-list' });
  body.append(listWrap);
  await refreshProjects(listWrap);

  if (user.isAnonymous) {
    body.append(el('p', { class: 'hint', style: 'color:var(--text-mute);font-size:11px;margin-top:14px',
      text: 'Guest data lives only in this browser profile. Sign in with Google to keep it permanently.' }));
  }
}

async function refreshProjects(listWrap) {
  listWrap.innerHTML = '';
  let projects = [];
  try { projects = await listProjects(); }
  catch (e) { showError(e); return; }
  if (!projects.length) {
    listWrap.append(el('p', { text: 'No projects yet. Create one to start writing code in the cloud.' }));
    return;
  }
  for (const p of projects) {
    const row = el('div', { class: `proj ${p.id === activeProjectId ? 'active' : ''}` },
      el('span', { class: 'pname', text: p.name, onclick: () => openProject(p) }),
      el('span', { class: 'icon-btn', title: 'Rename', onclick: (e) => { e.stopPropagation(); onRenameProject(p, listWrap); }, html: '<svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16z"/></svg>' }),
      el('span', { class: 'icon-btn pdel', title: 'Delete', onclick: (e) => { e.stopPropagation(); onDeleteProject(p, listWrap); }, html: '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>' }),
    );
    row.querySelector('.pname').style.cursor = 'pointer';
    listWrap.append(row);
  }
}

async function openProject(p) {
  activeProjectId = p.id;
  for (const el2 of document.querySelectorAll('.proj')) el2.classList.remove('active');
  await handlers.onOpenProject?.(p);
  // Re-mark active after panel may have switched.
  const wrap = $('#cloud-panel-body .proj-list');
  if (wrap) refreshProjects(wrap);
}

async function onNewProject() {
  const name = await prompt({ title: 'New Cloud Project', placeholder: 'my-app', okText: 'Create' });
  if (!name) return;
  try {
    const p = await createProject(name);
    const wrap = $('#cloud-panel-body .proj-list');
    if (wrap) await refreshProjects(wrap);
    openProject(p);
  } catch (e) { showError(e); }
}

async function onRenameProject(p, listWrap) {
  const name = await prompt({ title: 'Rename Project', value: p.name, okText: 'Rename' });
  if (!name || name === p.name) return;
  try { await renameProject(p.id, name); await refreshProjects(listWrap); }
  catch (e) { showError(e); }
}

async function onDeleteProject(p, listWrap) {
  const ok = await confirm({ title: 'Delete Project', message: `Delete "${p.name}" and all its files from the cloud? This cannot be undone.`, okText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await deleteProject(p.id);
    if (activeProjectId === p.id) { activeProjectId = null; handlers.onSignOut?.(); }
    await refreshProjects(listWrap);
  } catch (e) { showError(e); }
}

function emailForm() {
  const email = el('input', { type: 'text', placeholder: 'email', autocomplete: 'username', style: 'width:100%;margin:6px 0;background:var(--bg-0);color:var(--text);border:1px solid var(--border-2);padding:6px 8px' });
  const pass = el('input', { type: 'password', placeholder: 'password', autocomplete: 'current-password', style: 'width:100%;margin:0 0 6px;background:var(--bg-0);color:var(--text);border:1px solid var(--border-2);padding:6px 8px' });
  const wrap = el('div', { style: 'margin-top:14px' },
    el('h4', { text: 'Or use email' }),
    email, pass,
    el('div', { style: 'display:flex;gap:6px' },
      el('button', { class: 'btn', style: 'flex:1', onclick: () => guard(CloudAuth.signInEmail(email.value.trim(), pass.value, false)) }, 'Sign in'),
      el('button', { class: 'btn', style: 'flex:1', onclick: () => guard(CloudAuth.signInEmail(email.value.trim(), pass.value, true)) }, 'Register'),
    ),
    el('small', { style: 'color:var(--text-mute);display:block;margin-top:6px', text: 'Enable Email/Password in Firebase Auth to use this.' }),
  );
  return wrap;
}

function guard(promise) {
  Promise.resolve(promise).catch((e) => showError(e));
}

function showError(e) {
  const msg = e?.code || e?.message || String(e);
  if (String(msg).includes('auth/operation-not-allowed')) {
    toast('Sign-in method disabled', 'Enable this provider in Firebase Console → Authentication → Sign-in method. See SETUP.md.', 'error');
  } else if (String(msg).includes('auth/popup-blocked') || String(msg).includes('popup-closed')) {
    toast('Popup blocked', 'Allow popups for this site, then try again.', 'error');
  } else if (String(msg).includes('permission-denied') || String(msg).includes('Missing or insufficient')) {
    toast('Firestore blocked the request', 'Publish the security rules from firestore.rules. See SETUP.md Step 7.', 'error');
  } else if (String(msg).includes('unavailable') || String(msg).includes('offline')) {
    toast('Cloud unreachable', 'Check your internet connection.', 'error');
  } else {
    toast('Cloud error', msg, 'error');
  }
}
