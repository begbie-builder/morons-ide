// Cloud workspace backed by Firebase Auth + Firestore (free "Spark" tier).
//
// Data model (all scoped under the signed-in user so the security rules are trivial):
//   users/{uid}/projects/{projectId}   -> { name, createdAt }
//   users/{uid}/nodes/{nodeId}         -> { projectId, path, name, kind, parentKey, content }
//
// nodeId is derived deterministically from projectId + path so we never need a
// query to find a single node, and `parentKey` (projectId + parent-dir path) lets
// us list a directory's direct children with a single-field query (no composite
// index to create — keeps setup moron-proof). Both keys are built by _key() so
// their separator can never drift out of sync.
import { basename, dirname, b64url, uid } from '../util.js';
import { firebaseConfig, isFirebaseConfigured } from '../firebase-config.js';

const V = '10.14.1';
const CDN = (m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
const SEP = '::'; // projectId never contains this, so keys are unambiguous

let sdk = null; // { app, auth, db, authMod, dbMod }

async function loadSdk() {
  if (sdk) return sdk;
  const appMod = await import(CDN('app'));
  const authMod = await import(CDN('auth'));
  const dbMod = await import(CDN('firestore'));
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = dbMod.getFirestore(app);
  sdk = { app, auth, db, authMod, dbMod };
  return sdk;
}

export const CloudAuth = {
  configured: isFirebaseConfigured,

  async ensure() { return loadSdk(); },

  async onChange(cb) {
    const { auth, authMod } = await loadSdk();
    return authMod.onAuthStateChanged(auth, cb);
  },

  async signInGoogle() {
    const { auth, authMod } = await loadSdk();
    const provider = new authMod.GoogleAuthProvider();
    await authMod.signInWithPopup(auth, provider);
  },

  async signInAnonymously() {
    const { auth, authMod } = await loadSdk();
    await authMod.signInAnonymously(auth);
  },

  async signInEmail(email, password, create) {
    const { auth, authMod } = await loadSdk();
    if (create) await authMod.createUserWithEmailAndPassword(auth, email, password);
    else await authMod.signInWithEmailAndPassword(auth, email, password);
  },

  async signOut() {
    const { auth, authMod } = await loadSdk();
    await authMod.signOut(auth);
  },

  currentUser() { return sdk?.auth?.currentUser || null; },
};

// ---- Projects -------------------------------------------------------------

function userCol(name) {
  const { db, dbMod, auth } = sdk;
  return dbMod.collection(db, 'users', auth.currentUser.uid, name);
}

export async function listProjects() {
  const { dbMod } = await loadSdk();
  const snap = await dbMod.getDocs(userCol('projects'));
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return out;
}

export async function createProject(name) {
  const { db, dbMod, auth } = await loadSdk();
  const id = uid();
  await dbMod.setDoc(dbMod.doc(db, 'users', auth.currentUser.uid, 'projects', id), {
    name, createdAt: Date.now(),
  });
  return { id, name };
}

export async function renameProject(id, name) {
  const { db, dbMod, auth } = await loadSdk();
  await dbMod.updateDoc(dbMod.doc(db, 'users', auth.currentUser.uid, 'projects', id), { name });
}

export async function deleteProject(id) {
  const { db, dbMod, auth } = await loadSdk();
  const nodes = dbMod.query(userCol('nodes'), dbMod.where('projectId', '==', id));
  const snap = await dbMod.getDocs(nodes);
  const batch = dbMod.writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  batch.delete(dbMod.doc(db, 'users', auth.currentUser.uid, 'projects', id));
  await batch.commit();
}

// ---- File tree provider ---------------------------------------------------

export class CloudProvider {
  constructor(project) {
    this.id = 'cloud';
    this.project = project;      // { id, name }
    this.name = project.name;
  }

  label() { return this.name; }
  isReady() { return Boolean(sdk?.auth?.currentUser); }

  _uid() { return sdk.auth.currentUser.uid; }
  // Single source of truth for key construction — used for both the node id and
  // the parentKey/children query, so the two can never disagree.
  _key(path) { return this.project.id + SEP + path; }
  _nodeId(path) { return b64url(this._key(path)); }
  _parentKey(path) { return this._key(dirname(path)); }
  _nodeRef(path) { return sdk.dbMod.doc(sdk.db, 'users', this._uid(), 'nodes', this._nodeId(path)); }

  async _ensureAncestors(path) {
    const dir = dirname(path);
    if (!dir) return;
    const parts = dir.split('/');
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      await sdk.dbMod.setDoc(this._nodeRef(acc), {
        projectId: this.project.id, path: acc, name: part, kind: 'dir', parentKey: this._parentKey(acc),
      }, { merge: true });
    }
  }

  async children(path = '') {
    await loadSdk();
    const q = sdk.dbMod.query(userCol('nodes'), sdk.dbMod.where('parentKey', '==', this._key(path)));
    const snap = await sdk.dbMod.getDocs(q);
    const out = [];
    snap.forEach((d) => { const n = d.data(); out.push({ name: n.name, path: n.path, kind: n.kind }); });
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === 'dir' ? -1 : 1));
    return out;
  }

  async read(path) {
    await loadSdk();
    const snap = await sdk.dbMod.getDoc(this._nodeRef(path));
    const text = snap.exists() ? (snap.data().content || '') : '';
    return { text, size: text.length };
  }

  async write(path, content) {
    await loadSdk();
    await this._ensureAncestors(path);
    await sdk.dbMod.setDoc(this._nodeRef(path), {
      projectId: this.project.id, path, name: basename(path), kind: 'file',
      parentKey: this._parentKey(path), content, updatedAt: Date.now(),
    }, { merge: true });
  }

  async createFile(path) {
    await loadSdk();
    await this._ensureAncestors(path);
    await sdk.dbMod.setDoc(this._nodeRef(path), {
      projectId: this.project.id, path, name: basename(path), kind: 'file',
      parentKey: this._parentKey(path), content: '', updatedAt: Date.now(),
    });
  }

  async createDir(path) {
    await loadSdk();
    await this._ensureAncestors(path);
    await sdk.dbMod.setDoc(this._nodeRef(path), {
      projectId: this.project.id, path, name: basename(path), kind: 'dir', parentKey: this._parentKey(path),
    }, { merge: true });
  }

  async _allNodes() {
    const q = sdk.dbMod.query(userCol('nodes'), sdk.dbMod.where('projectId', '==', this.project.id));
    const snap = await sdk.dbMod.getDocs(q);
    const list = [];
    snap.forEach((d) => list.push(d.data()));
    return list;
  }

  async listAllFiles() {
    await loadSdk();
    const all = await this._allNodes();
    return all.filter((n) => n.kind === 'file').map((n) => n.path).sort();
  }

  async remove(path) {
    await loadSdk();
    const all = await this._allNodes();
    const batch = sdk.dbMod.writeBatch(sdk.db);
    for (const n of all) {
      if (n.path === path || n.path.startsWith(path + '/')) batch.delete(this._nodeRef(n.path));
    }
    await batch.commit();
  }

  async rename(oldPath, newPath) {
    await loadSdk();
    await this._ensureAncestors(newPath);
    const all = await this._allNodes();
    const batch = sdk.dbMod.writeBatch(sdk.db);
    for (const n of all) {
      if (n.path !== oldPath && !n.path.startsWith(oldPath + '/')) continue;
      const suffix = n.path.slice(oldPath.length); // '' or '/child...'
      const np = newPath + suffix;
      batch.set(this._nodeRef(np), {
        projectId: this.project.id, path: np, name: basename(np), kind: n.kind,
        parentKey: this._parentKey(np),
        ...(n.kind === 'file' ? { content: n.content || '', updatedAt: Date.now() } : {}),
      });
      batch.delete(this._nodeRef(n.path));
    }
    await batch.commit();
  }
}
