// Local workspace backed by the File System Access API.
// Paths are POSIX-style and relative to the opened root ('' is the root).
import { basename, dirname } from '../util.js';
import { saveRecentFolder } from '../idb.js';

export class LocalProvider {
  constructor(rootHandle) {
    this.id = 'local';
    this.root = rootHandle;
    this.name = rootHandle.name;
    this.handles = new Map([['', rootHandle]]); // path -> handle cache
  }

  static supported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  static async pick() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    try { await saveRecentFolder(handle); } catch { /* recents are best-effort */ }
    return new LocalProvider(handle);
  }

  static async fromHandle(handle) {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Permission to the folder was denied.');
    return new LocalProvider(handle);
  }

  label() { return this.name; }
  isReady() { return true; }

  async _dirHandle(path, { create = false } = {}) {
    if (this.handles.has(path) && (await this._isDir(path))) return this.handles.get(path);
    let handle = this.root;
    if (path) {
      for (const part of path.split('/')) {
        handle = await handle.getDirectoryHandle(part, { create });
      }
    }
    this.handles.set(path, handle);
    return handle;
  }

  async _isDir(path) {
    const h = this.handles.get(path);
    return h && h.kind === 'directory';
  }

  async _fileHandle(path, { create = false } = {}) {
    const parent = await this._dirHandle(dirname(path), { create });
    const handle = await parent.getFileHandle(basename(path), { create });
    this.handles.set(path, handle);
    return handle;
  }

  async children(path = '') {
    const dir = await this._dirHandle(path);
    const out = [];
    for await (const [name, handle] of dir.entries()) {
      const childPath = path ? `${path}/${name}` : name;
      this.handles.set(childPath, handle);
      out.push({ name, path: childPath, kind: handle.kind === 'directory' ? 'dir' : 'file' });
    }
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === 'dir' ? -1 : 1));
    return out;
  }

  async read(path) {
    const handle = await this._fileHandle(path);
    const file = await handle.getFile();
    return { text: await file.text(), size: file.size, file };
  }

  async readBlobUrl(path) {
    const handle = await this._fileHandle(path);
    const file = await handle.getFile();
    return URL.createObjectURL(file);
  }

  async write(path, content) {
    const handle = await this._fileHandle(path, { create: true });
    const w = await handle.createWritable();
    await w.write(content);
    await w.close();
  }

  async createFile(path) {
    await this._fileHandle(path, { create: true });
  }

  async createDir(path) {
    await this._dirHandle(path, { create: true });
  }

  async remove(path) {
    const parent = await this._dirHandle(dirname(path));
    await parent.removeEntry(basename(path), { recursive: true });
    for (const key of [...this.handles.keys()]) {
      if (key === path || key.startsWith(path + '/')) this.handles.delete(key);
    }
  }

  async _copyEntry(fromPath, toPath) {
    const kind = this.handles.get(fromPath)?.kind || (await this._probeKind(fromPath));
    if (kind === 'directory') {
      await this.createDir(toPath);
      for (const child of await this.children(fromPath)) {
        await this._copyEntry(child.path, `${toPath}/${child.name}`);
      }
    } else {
      const { text } = await this.read(fromPath);
      await this.write(toPath, text);
    }
  }

  async _probeKind(path) {
    const parent = await this._dirHandle(dirname(path));
    try { await parent.getDirectoryHandle(basename(path)); return 'directory'; }
    catch { return 'file'; }
  }

  async rename(oldPath, newPath) {
    // File System Access API has no atomic move, so copy then delete.
    await this._copyEntry(oldPath, newPath);
    await this.remove(oldPath);
  }

  async listAllFiles(ignore = new Set(), cap = 8000) {
    const files = [];
    const walk = async (path) => {
      if (files.length >= cap) return;
      for (const c of await this.children(path)) {
        if (ignore.has(c.name)) continue;
        if (c.kind === 'dir') await walk(c.path);
        else files.push(c.path);
        if (files.length >= cap) return;
      }
    };
    await walk('');
    return files;
  }
}
