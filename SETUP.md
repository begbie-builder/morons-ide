# 🧠 MoronIDE — The Idiot-Proof Setup Guide

This guide assumes you know **nothing**. If you can copy, paste, and click, you can do this.
Read every step. Do not skip. There are screenshots described in words so you can't get lost.

There are **two things** you can do with MoronIDE:

1. **Run it and edit local folders on your computer** — needs almost no setup. (Part A)
2. **Add free cloud storage** so your code is saved online and reachable from any device — needs a free Firebase account. (Part B)

You can stop after Part A if you only want local editing. Cloud is optional.

---

## ⏱️ TL;DR (for people in a hurry)

```bash
# 1. Run it locally
npm start
# open http://localhost:5173  -> click "Open Local Folder" -> done.

# 2. (optional) Cloud storage: make a free Firebase project, then:
#    - paste your keys into public/js/firebase-config.js
#    - set your project id in .firebaserc
npm install -g firebase-tools
firebase login
firebase deploy
```

If those commands mean nothing to you, keep reading. Everything is explained below.

---

# PART A — Run the IDE (local editing only)

### What you need first

You need **Node.js** installed. Node.js is a free program that runs JavaScript on your computer.

**How to check if you already have it:**

1. Open a terminal.
   - **Windows:** press the Windows key, type `cmd`, press Enter. A black window opens.
   - **Mac:** press `Cmd + Space`, type `Terminal`, press Enter.
   - **Linux:** you already know how, you nerd.
2. Type this and press Enter:
   ```bash
   node --version
   ```
3. If you see something like `v20.11.0`, you have it. **Skip to "Start the IDE".**
   If you see `command not found` or an error, install it (next step).

**How to install Node.js:**

1. Go to **https://nodejs.org**
2. Click the big green button that says **"LTS"** (Long Term Support). Download it.
3. Run the downloaded installer. Click **Next → Next → Next → Install → Finish**. Accept all defaults.
4. **Close and reopen your terminal**, then run `node --version` again. You should now see a version number.

### Get the code onto your computer

If you're reading this, you probably already have the folder. If not:

- If you have `git`: `git clone <the-repo-url>` then `cd` into the folder.
- If not: download the project as a ZIP from GitHub (green **Code** button → **Download ZIP**), unzip it, and remember where you put it.

### Start the IDE

1. In your terminal, go **into the project folder**. This is the folder that contains the file `server.js`.
   Type `cd ` (with a space), then drag the project folder from your file explorer into the terminal window, then press Enter. Example:
   ```bash
   cd /Users/you/Downloads/morons-ide
   ```
2. Start the server:
   ```bash
   npm start
   ```
   > **No build, no `npm install` needed.** This project has zero dependencies to run locally.
3. You'll see:
   ```
     MoronIDE running at  http://localhost:5173
   ```
4. Open your web browser and go to **http://localhost:5173**

🎉 **The IDE is now open.**

### Open a folder and edit files

1. Click **"Open Local Folder"** (big button in the middle, or the one in the top bar).
2. Your browser asks you to pick a folder and to **"allow editing"** or **"save changes"**. Click **Allow / Edit**. (This is the browser being safe. MoronIDE only touches the folder you pick.)
3. The folder's files appear on the left. Click any file to open it. Type to edit. Press **Ctrl+S** (Mac: **Cmd+S**) to save straight back to your real file on disk.

> ⚠️ **Important browser note:** Editing local folders uses the **File System Access API**, which today works in **Chrome, Edge, Brave, Opera, and Arc**. It does **not** work in **Firefox or Safari**. If you use Firefox/Safari, use **Cloud storage** (Part B) instead — that works in every browser.

**That's it for local editing.** You now have a working IDE.

---

# PART B — Add free cloud storage (Firebase)

Cloud storage lets you save projects online for free and open them from any computer or phone.
We use **Firebase**, Google's free backend. The free tier ("Spark plan") is plenty for personal use and **costs $0** — you don't even enter a credit card.

Take your time. There are 8 steps. Do them in order.

### Step 1 — Create a free Firebase account & project

1. Go to **https://console.firebase.google.com**
2. Sign in with any Google account (Gmail works).
3. Click **"Create a project"** (or "Add project").
4. Give it a name, e.g. `my-moron-ide`. Firebase makes a **Project ID** under the name (something like `my-moron-ide-4f3a1`). **Write this ID down** — you need it later.
5. It asks about **Google Analytics**. You can **turn it OFF** (toggle off) — you don't need it. Click **Create project**.
6. Wait ~30 seconds. Click **Continue** when it's ready.

### Step 2 — Register a "Web App" to get your keys

1. On the project's main page, look for a row of icons to add an app: `iOS`, `Android`, and a **`</>`** icon (that's Web). Click the **`</>`** icon.
2. Give the app a nickname, e.g. `moron-web`.
3. **Do NOT** check "Firebase Hosting" here (we do hosting separately later). Just click **"Register app"**.
4. Firebase now shows you a code block with a `firebaseConfig = { ... }` object. It looks like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyC...................",
     authDomain: "my-moron-ide-4f3a1.firebaseapp.com",
     projectId: "my-moron-ide-4f3a1",
     storageBucket: "my-moron-ide-4f3a1.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123def456"
   };
   ```
   **Keep this browser tab open** — you'll copy these values in Step 5.
   > These keys are **not secret**. Firebase web keys are public by design; your data is protected by security rules (Step 7), not by hiding the keys.

### Step 3 — Turn on ways to sign in (Authentication)

1. In the left menu of the Firebase Console, click **Build → Authentication**.
2. Click **"Get started"**.
3. You'll see a list of "Sign-in providers". Enable the ones you want:
   - **Anonymous** — easiest. Click it, flip the toggle **On**, click **Save**. (Lets people use the cloud as a "Guest" with one click.)
   - **Google** — recommended. Click it, flip **On**, pick a "support email" from the dropdown, click **Save**. (Lets you sign in with your Google account so your projects follow you everywhere.)
   - **Email/Password** — optional. Click it, flip **On**, **Save**. (Enables the email/password box in the app.)

   You need **at least one** of these turned on. Anonymous + Google is a great combo.

### Step 4 — Create the database (Firestore)

1. In the left menu, click **Build → Firestore Database**.
2. Click **"Create database"**.
3. Choose a location (pick the one closest to you). Click **Next**.
4. It asks about rules. Choose **"Start in production mode"** (locked). Click **Create / Enable**.
   > Don't worry that it's "locked" — in Step 7 we publish the correct rules that let *you* (and only you) access *your* files.

### Step 5 — Paste your keys into the app

1. Open the project folder on your computer.
2. Open the file: **`public/js/firebase-config.js`** in any text editor (even Notepad works — or edit it right inside MoronIDE!).
3. You'll see placeholder values (`YOUR_API_KEY`, etc). **Replace each value** with the matching value from the `firebaseConfig` you saw in Step 2. Match them by name: `apiKey` → `apiKey`, `projectId` → `projectId`, and so on.
   After editing, it should look like the real one from Step 2 — real strings, no more `YOUR_...`.
4. **Save the file.**

> ✅ How to know it worked: reload the IDE, click the **cloud icon** in the left rail. If it says "Sign in", you're configured. If it still shows the "not configured" warning, you missed a value or didn't save.

### Step 6 — Try the cloud (local test first)

You don't have to deploy to the internet to use the cloud. With the config pasted in:

1. Make sure the local server is running (`npm start`) and open **http://localhost:5173**.
2. Click the **cloud icon** (☁) in the far-left rail.
3. Click **"Continue as Guest"** or **"Sign in with Google"**.
   - If a popup is blocked, allow popups for `localhost` and retry.
4. Click **"+ New"** to create a cloud project, give it a name.
5. Click the project name to open it. Now use **New File**, type code, press **Ctrl+S**. It's saved to Firestore.
6. Refresh the page, sign in again, reopen the project — your files are still there. **Cloud works.** ✨

> ❗ If you get a **"permission denied"** error when saving, you still need to publish the security rules. Do Step 7.

### Step 7 — Publish the security rules (so only you can read your files)

This is the important safety step. It makes each user able to touch **only their own** data.

**The easy way (copy-paste in the browser):**

1. Firebase Console → **Build → Firestore Database → Rules** tab.
2. Delete everything in the box and paste this exactly:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
3. Click **"Publish"**.

(These are the same rules stored in this project as `firestore.rules`. If you deploy with the CLI in Step 8, they get published automatically and you can skip the copy-paste.)

### Step 8 — (Optional) Put your IDE on the internet with Firebase Hosting

Right now the IDE only runs on your own computer. Firebase Hosting (free) gives it a public URL like `https://my-moron-ide-4f3a1.web.app` that you can open from anywhere.

1. Install the Firebase command-line tool (one time):
   ```bash
   npm install -g firebase-tools
   ```
   > On Mac/Linux, if you get a "permission denied" error, put `sudo ` in front:
   > `sudo npm install -g firebase-tools`
2. Log in (opens a browser to approve):
   ```bash
   firebase login
   ```
3. Tell the project which Firebase project to use. Open **`.firebaserc`** in the project folder and replace `YOUR_FIREBASE_PROJECT_ID` with your real **Project ID** from Step 1 (e.g. `my-moron-ide-4f3a1`). Save it.
   *(Or run `firebase use --add` and pick your project from the list.)*
4. Deploy:
   ```bash
   firebase deploy
   ```
   This uploads the site **and** publishes your Firestore rules.
5. When it finishes, it prints a **Hosting URL**. Open it. Your IDE is now live on the internet. 🌍
6. **One last thing for Google sign-in on the live site:** Firebase Console → **Authentication → Settings → Authorized domains**. Your `*.web.app` and `*.firebaseapp.com` domains are added automatically, so Google sign-in just works. If you later use a custom domain, add it here too.

---

## 🧩 Cheat sheet — which command does what

| I want to…                        | Do this                                  |
|-----------------------------------|------------------------------------------|
| Run the IDE on my computer        | `npm start` → open http://localhost:5173 |
| Only edit local files             | Click **Open Local Folder** (Part A)     |
| Store code in the cloud           | Do Part B, then use the ☁ panel          |
| Put the IDE on the internet       | `firebase deploy` (Step 8)               |
| Update only the website           | `npm run deploy:hosting`                 |
| Update only the security rules    | `npm run deploy:rules`                   |

---

## 🆘 Troubleshooting (read this before panicking)

**"npm: command not found"**
Node.js isn't installed or the terminal wasn't restarted. Redo "Install Node.js" in Part A, then close and reopen the terminal.

**The "Open Local Folder" button does nothing / says unsupported**
You're in Firefox or Safari. They don't support local folder editing yet. Use Chrome/Edge/Brave, or use Cloud storage instead.

**Cloud panel says "Cloud storage is not configured"**
You didn't finish Step 5. Open `public/js/firebase-config.js`, paste your real keys, save, reload the page.

**"auth/operation-not-allowed" when signing in**
The sign-in method isn't enabled. Go to Firebase Console → Authentication → Sign-in method and turn on Anonymous / Google / Email (Step 3).

**"Missing or insufficient permissions" / "permission-denied" when saving**
The security rules aren't published. Do Step 7.

**Google sign-in popup closes immediately or is blocked**
Allow popups for the site in your browser's address bar, then click sign-in again.

**"firebase: command not found"**
Run `npm install -g firebase-tools` (Step 8). On Mac/Linux you may need `sudo` in front.

**I changed a file but the browser shows the old version**
Hard-refresh: **Ctrl+Shift+R** (Mac: **Cmd+Shift+R**).

**Is the free tier really free?**
Yes. The Spark plan gives 1 GiB of stored data and tens of thousands of reads/writes per day with **no credit card**. A personal IDE won't come close to the limits.

---

## 🔐 Is my code safe?

- **Local mode:** files never leave your computer. MoronIDE only accesses the exact folder you pick, and only while the tab is open.
- **Cloud mode:** files live in *your* Firebase project, under *your* account. The security rules in Step 7 make it so **only you** can read or write your data. No one else — not even other users of your deployed site — can see your files.

Now go build something. You've got no more excuses.
