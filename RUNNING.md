# ▶ Running YTMusic Discord RPC locally

A step-by-step guide to get the app running on your own machine. Takes ~5 minutes.

---

## 0. Prerequisites

| Requirement | Notes |
| --- | --- |
| **Node.js ≥ 22.12** (or 20.19+) | Check with `node -v`. The build tooling (Vite 7 / electron-vite 5) requires it. |
| **Discord _desktop_ app**, running and logged in | The browser version of Discord does **not** expose the local IPC socket Rich Presence needs. |
| **A browser with YouTube Music** | Chrome, Edge, Brave, Vivaldi, Opera, or Firefox. |

> This project has **0 npm vulnerabilities** and uses no native modules, so
> `npm install` never needs a C/C++ build toolchain.

---

## 1. Get the code & install

```bash
cd discord            # the project folder
npm install
npm run make:icon     # one-time: generates resources/icon.png
```

---

## 2. Create your Discord Application ID  *(required)*

Discord Rich Presence requires a registered application. Yours is free and takes
a minute. The application's **name** becomes the “Listening to …” label.

1. Open <https://discord.com/developers/applications> and sign in.
2. Click **New Application**, name it (e.g. `YouTube Music`), and create it.
3. On **General Information**, copy the **Application ID** (a long number).
4. Keep it handy — you'll paste it in step 4.

Also make sure Discord will broadcast activity:
**Discord → Settings → Activity Privacy → “Share your detected activities with others” = ON.**

---

## 3. Start the app (development mode)

```bash
npm run dev
```

The window opens. You'll see two status rows:

- **Discord** — turns 🔴 *Invalid Discord Application ID* until you do step 4.
- **YouTube Music** — stays ⚪ until the browser extension connects (step 5).

> macOS/Linux note: if you launch the *packaged* app and nothing happens, run it
> from a terminal once to see logs. No special flags are needed on a normal
> desktop. (The `--no-sandbox` flag is only for headless/CI sandboxes.)

---

## 4. Enter your Application ID

In the app: **Settings → Advanced → Discord application ID** → paste the ID from
step 2 → press **Enter** (or click away).

The **Discord** row should turn 🟢 *Connected as <your-username>* within a second.
If it doesn't, click **Reconnect** and confirm the Discord desktop app is open.

---

## 5. Install the browser extension (the detector)

The app can't see YouTube Music until the bundled extension feeds it metadata.

**Chromium (Chrome / Edge / Brave / Vivaldi / Opera):**

1. Click **Setup** next to the *YouTube Music* row in the app
   (or open `chrome://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** → select the project's `extension/` folder.

**Firefox:** see [`extension/README.md`](extension/README.md) (it uses the MV2 manifest).

---

## 6. Play something 🎵

Open <https://music.youtube.com> and press play.

- The app's **YouTube Music** row turns 🟢 *1 source connected*.
- The **Current track** card shows title, artist, album, art, and a progress bar.
- Your **Discord profile** now shows *Listening to <App Name>* with the song. 🎉

Pause, skip, and seek — the presence follows along. Close the YTM tab and it clears.

---

## Build a distributable (optional)

```bash
npm run build           # type-checked bundle into ./out
npm run package:win     # → ./release  (or :mac / :linux on that OS)
```

Installers must generally be built **on** their target OS (or in CI).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Discord row: **Invalid Discord Application ID** | Finish steps 2 & 4 — paste a valid Application ID. |
| Discord row: **Discord not running** | Launch the **Discord desktop app** (not the website), then **Reconnect**. |
| Discord 🟢 but friends don't see it | Discord → Settings → **Activity Privacy** → enable *Share your detected activities*. |
| YouTube Music row stays ⚪ | Reload the YTM tab; confirm the extension is loaded and enabled; make sure a song is actually playing. |
| Port already in use | Change **Bridge port** (Settings → Advanced) and set the same value in the extension (see its README). |
| Nothing in the window / blank | Run `npm run dev` from a terminal and check the console; verify Node ≥ 22.12 with `node -v`. |
| Want verbose logs | Enable **Debug logging** in Settings. Logs: `%APPDATA%\ytmusic-discord-rpc\logs\main.log` (Win), `~/Library/Logs/ytmusic-discord-rpc/main.log` (mac), `~/.config/ytmusic-discord-rpc/logs/main.log` (Linux). |

---

## Test responsiveness without a browser

`npm run sim` drives the app through a full session — play, normal advance, seek,
pause, resume, song change, stop — straight at the bridge, so you can watch the
app and your Discord status react in real time:

```bash
npm run sim            # against the default port 9863
npm run sim 9899       # against a custom bridge port
```

Enable **Debug logging** in Settings to see each decision in `main.log`.

## What “verified working” means here

This build was smoke-tested end to end:

- `npm audit` → **0 vulnerabilities**
- `npm run typecheck` and `npm run build` → pass (TypeScript 6, React 19, Electron 42)
- App launches; the **WebSocket bridge** accepts a loopback source and ingests a track
- The **Discord IPC client** connects and handshakes (it then requires *your* Application ID)
- **Responsiveness verified** via `npm run sim`: song changes, seeks, and pause/resume
  each trigger an immediate presence update, while steady playback stays quiet (no spam)
