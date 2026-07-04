// Reusable UI primitives: toasts, prompt/confirm dialogs, context menus.
import { el } from './util.js';

const modalRoot = document.getElementById('modal-root');
const menuRoot = document.getElementById('menu-root');
const toastRoot = document.getElementById('toast-root');

export function toast(title, msg = '', kind = '') {
  const node = el('div', { class: `toast ${kind}` },
    el('div', { class: 't-title', text: title }),
    msg ? el('div', { class: 't-msg', text: msg }) : null,
  );
  toastRoot.append(node);
  setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 200); }, kind === 'error' ? 5200 : 2600);
}

function closeModal() { modalRoot.innerHTML = ''; }

export function prompt({ title, label = '', value = '', placeholder = '', okText = 'OK', select = 'all' }) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', value, placeholder, spellcheck: 'false', autocomplete: 'off' });
    const done = (v) => { closeModal(); resolve(v); };
    const overlay = el('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) done(null); } },
      el('div', { class: 'dialog' },
        el('div', { class: 'dialog-head', text: title }),
        el('div', { class: 'dialog-body' }, label ? el('p', { text: label }) : null, input),
        el('div', { class: 'dialog-foot' },
          el('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'),
          el('button', { class: 'btn primary', onclick: () => done(input.value.trim()) }, okText),
        ),
      ),
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim()); }
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
    });
    modalRoot.append(overlay);
    input.focus();
    if (select === 'all') input.select();
    else if (select === 'stem') {
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    }
  });
}

export function confirm({ title, message, okText = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const done = (v) => { closeModal(); resolve(v); };
    const overlay = el('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) done(false); } },
      el('div', { class: 'dialog' },
        el('div', { class: 'dialog-head', text: title }),
        el('div', { class: 'dialog-body' }, el('p', { text: message })),
        el('div', { class: 'dialog-foot' },
          el('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'),
          el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, okText),
        ),
      ),
    );
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done(false); }
    });
    modalRoot.append(overlay);
  });
}

export function contextMenu(x, y, items) {
  menuRoot.innerHTML = '';
  const menu = el('div', { class: 'ctx' });
  for (const item of items) {
    if (item === '-') { menu.append(el('div', { class: 'ctx-sep' })); continue; }
    menu.append(el('div', {
      class: `ctx-item ${item.danger ? 'danger' : ''}`,
      onclick: () => { close(); item.action?.(); },
    }, el('span', { text: item.label }), item.hint ? el('span', { class: 'pi-kbd', text: item.hint }) : null));
  }
  menu.style.left = '0px'; menu.style.top = '0px';
  menuRoot.append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - rect.width - 4) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - rect.height - 4) + 'px';

  function close() { menuRoot.innerHTML = ''; document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('keydown', onKey, true); }
  function onDoc(e) { if (!menu.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  setTimeout(() => { document.addEventListener('mousedown', onDoc, true); document.addEventListener('keydown', onKey, true); }, 0);
}
