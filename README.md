# MoronIDE

A sharp, flat, browser-based code editor. Open a local folder and edit files
directly on your disk, or store projects in the cloud on Firebase's free tier —
reachable from any device. Built on the **Monaco** editor (the engine behind VS
Code), so it handles ~90 languages with real syntax highlighting, IntelliSense,
multi-cursor, find/replace, formatting, and more.

> **New here? Read [`SETUP.md`](./SETUP.md) — a step-by-step, assume-nothing guide.**

```bash
npm start          # serve locally on http://localhost:5173
```
No build step. No dependencies to install for local use.

---

## Features

- **Monaco editor** — syntax highlighting & language features for ~90 languages,
  auto-detected from the file extension.
- **Two storage backends, one UI:**
  - **Local** — open a real folder via the File System Access API. Read, edit,
    save, create, rename, duplicate, and delete files and folders on disk.
  - **Cloud** — Firebase Auth (Google / Anonymous / Email) + Firestore. Multiple
    projects, full file tree, saved online for free.
- **Advanced editing:** multi-cursor, column select, find & replace, regex
  search, code folding, bracket-pair colorization, minimap, format document,
  go-to-line, IntelliSense, and every Monaco keybinding.
- **Command palette** (`Ctrl/Cmd+Shift+P`) and **quick file open** (`Ctrl/Cmd+P`,
  fuzzy).
- **Find in Files** across the whole workspace (`Ctrl/Cmd+Shift+F`).
- **Tabs**, dirty-state tracking, unsaved-changes guards, auto-save (optional).
- **Settings:** theme (dark/light), font size, tab size, word wrap, minimap,
  line numbers, auto-save, format-on-save.
- **Design:** deliberately flat — no gradients, no blur, no drop shadows, no glow
  outlines, no rounded corners. Solid colors and 1px lines only.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + O` | Open local folder |
| `Ctrl/Cmd + N` | New untitled file |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Shift + S` | Save all |
| `Ctrl/Cmd + P` | Quick open file (fuzzy) |
| `Ctrl/Cmd + Shift + P` | Command palette |
| `Ctrl/Cmd + Shift + F` | Find in files |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + W` | Close tab |

Plus all standard Monaco editing shortcuts (multi-cursor `Ctrl/Cmd+D`,
find `Ctrl/Cmd+F`, format `Shift+Alt+F`, comment `Ctrl/Cmd+/`, etc).

## Project layout

```
public/                     # the entire web app (this is what gets hosted)
  index.html                # shell + Monaco/Firebase loaders
  css/styles.css            # flat design system
  js/
    app.js                  # orchestration: tree, tabs, editor, palette, search
    editor.js               # Monaco setup + custom sharp themes
    languages.js            # extension -> language mapping
    providers/
      local.js              # File System Access API backend
      cloud.js              # Firebase Auth + Firestore backend
    cloudpanel.js           # cloud sidebar UI
    firebase-config.js      # <- paste your Firebase keys here
    ui.js, util.js, settings.js, idb.js
server.js                   # zero-dependency local static server (npm start)
firebase.json               # Firebase Hosting + Firestore config
firestore.rules             # per-user security rules
.firebaserc                 # <- put your Firebase project id here
SETUP.md                    # the idiot-proof setup guide
```

## Tech notes

- **No bundler.** Monaco is loaded from a CDN via its AMD loader; the Firebase
  modular SDK is loaded from `gstatic` on demand (only when you use the cloud).
  App code is plain ES modules. This keeps setup trivial and hackable.
- **Firestore data model** is scoped per user (`users/{uid}/...`) so the security
  rules stay a two-liner, and directory listings use a single-field query
  (`parentKey`) so **no composite indexes** need to be created.
- **File System Access API** requires a secure context (`localhost` or HTTPS) and
  a Chromium-based browser. Cloud mode works in every modern browser.

## Browser support

| Feature | Chrome/Edge/Brave/Arc | Firefox/Safari |
| --- | --- | --- |
| Editor, cloud storage | ✅ | ✅ |
| Local folder editing | ✅ | ❌ (API not available) |

## License

MIT.
