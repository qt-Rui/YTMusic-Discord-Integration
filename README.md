# 🎵 YTMusic Discord RPC

> Show what you're listening to on **YouTube Music** as a live **Discord Rich Presence** —
> song title, artist, album, album art, and a synced elapsed/remaining progress bar.

<p align="center">
  <a href="https://github.com/qt-Rui/YTM-Discord-Integration/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/qt-Rui/YTM-Discord-Integration?display_name=tag&color=5865f2"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3ba55d"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-5865f2">
  <img alt="Privacy: 100% local" src="https://img.shields.io/badge/privacy-100%25%20local-3ba55d">
</p>

- ✅ Cross-platform: **Windows, macOS, Linux**
- ✅ Works with the **YouTube Music PWA**, **Chromium browsers**, and **Firefox**
- ✅ **100% local** — no telemetry, no accounts, no external servers
- ✅ Auto-reconnects to Discord, throttles updates, sips resources
- ✅ System tray, launch-on-startup, and a clean settings UI

---

## ⬇️ Download

**[→ Download the latest release](https://github.com/qt-Rui/YTM-Discord-Integration/releases/latest)**
&nbsp;·&nbsp; or visit the **[download page](https://qt-Rui.github.io/YTM-Discord-Integration/)**.

| Platform | File |
| --- | --- |
| 🪟 **Windows** | `YTMusic-Discord-RPC-Setup.exe` (NSIS installer) |
| 🍎 **macOS** | `YTMusic-Discord-RPC.dmg` (universal — Intel + Apple Silicon) |
| 🐧 **Linux** | `YTMusic-Discord-RPC.AppImage` (also `.deb`) |

> Installers are built automatically for all three platforms by GitHub Actions
> and attached to each [release](https://github.com/qt-Rui/YTM-Discord-Integration/releases).

After installing, follow the **[Quick start](#quick-start)** below (you'll also need
the bundled browser extension and a free Discord Application ID).

> Prefer to build from source? See [Build & package](#build--package).

---

## How it works

There is no way for an external app to read another browser's in-memory media
session directly, so detection is split across a small, robust pipeline:

```
 YouTube Music tab/PWA
   │  (reads navigator.mediaSession + the <video> element)
   ▼
 Browser Extension (content script ─▶ background relay)
   │  ws://127.0.0.1:9863   (loopback only)
   ▼
 Desktop App
   ├─ MediaBridgeServer   receives + validates snapshots
   ├─ TrackResolver       picks the active source, dedupes, throttles
   └─ DiscordPresenceService   hand-written Discord IPC client
                                 │
                                 ▼
                      Discord (named pipe / unix socket)
```

The app is built around an `IMediaProvider`-style boundary, so an **OS-native**
provider (Windows SMTC, Linux MPRIS, macOS MediaRemote) can be added later as an
additional rung in the fallback hierarchy without touching the rest of the app.
The browser-extension bridge is the default because it needs **zero native
modules** (so `npm install` never requires a C++ toolchain) and reads YTM's own
high-quality metadata, including album art.

### Why a hand-written Discord IPC client?

The popular `discord-rpc` package is unmaintained. Implementing the IPC wire
protocol directly (`src/services/DiscordPresenceService.ts`) gives full control
over the handshake, the 10-pipe connect sweep, exponential-backoff reconnection,
and re-applying the last activity automatically after Discord restarts.

---

## Project structure

```
ytmusic-discord-rpc/
├── electron.vite.config.ts     # unified main/preload/renderer build
├── electron-builder.yml        # packaging for win/mac/linux
├── package.json
├── tsconfig*.json
├── scripts/make-icon.mjs       # generates resources/icon.png
├── extension/                  # browser bridge (Chromium MV3 + Firefox MV2)
│   ├── manifest.json
│   ├── manifest.firefox.json
│   ├── content.js              # reads mediaSession + <video>
│   ├── background.js           # relays to ws://127.0.0.1
│   └── README.md
└── src/
    ├── main/                   # Electron main process
    │   ├── index.ts            # composition root + app lifecycle
    │   ├── windowManager.ts
    │   ├── tray.ts
    │   ├── ipc.ts
    │   └── icon.ts             # in-code tray/window icon (no asset needed)
    ├── preload/
    │   ├── index.ts            # contextBridge API (window.api)
    │   └── index.d.ts
    ├── renderer/               # React UI
    │   ├── index.html
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── styles.css
    │   └── components/
    │       ├── StatusIndicator.tsx
    │       ├── TrackPreview.tsx
    │       └── Settings.tsx
    ├── services/               # framework-agnostic business logic
    │   ├── DiscordPresenceService.ts
    │   ├── MediaBridgeServer.ts
    │   ├── TrackResolver.ts
    │   ├── SettingsStore.ts
    │   ├── AutoLaunchService.ts
    │   └── Logger.ts
    └── types/                  # shared contracts
        ├── track.ts
        ├── settings.ts
        └── ipc.ts
```

---

## Quick start

> 📖 New here? Follow the **[step-by-step run guide → RUNNING.md](RUNNING.md)**.

### Prerequisites

- **Node.js ≥ 22.12** (or 20.19+) — required by Vite 7 / electron-vite 5
- **Discord desktop app** running (the web app does not expose local IPC)
- A Chromium browser or Firefox with YouTube Music
- A free **Discord Application ID** ([why](#discord-application-id-required))

### 1. Install & run the desktop app

```bash
npm install
npm run make:icon   # one-time: generates resources/icon.png
npm run dev         # launches the app with hot reload
```

### 2. Install the browser extension

The app's **YouTube Music** status stays grey until a source connects.

- **Chromium**: go to `chrome://extensions`, enable *Developer mode*,
  click *Load unpacked*, and select the `extension/` folder.
- **Firefox**: see [`extension/README.md`](extension/README.md) (uses the MV2 manifest).

Open <https://music.youtube.com>, press play, and your Discord profile will light up. 🎉

> Tip: in the app, click **Setup** next to the YouTube Music row to reveal the
> `extension/` folder.

---

## Build & package

```bash
npm run make:icon          # ensure resources/icon.png exists
npm run build              # type-checked production bundle into ./out

# Installers into ./release (build for your current OS):
npm run package            # current platform
npm run package:win        # NSIS installer (.exe)
npm run package:mac        # DMG (x64 + arm64)
npm run package:linux      # AppImage + .deb
```

> Cross-compiling installers usually requires building **on** the target OS
> (or in CI). The unpacked app from `npm run build` works everywhere Node/Electron does.

### Discord Application ID (required)

Discord Rich Presence requires a registered application — the app ships with a
**placeholder id** that Discord will reject (you'll see *Invalid Discord
Application ID* until you set your own). It's free and takes a minute:

1. Create an app at <https://discord.com/developers/applications> → **New Application**.
   Its **name** becomes the “Listening to …” label.
2. Copy its **Application ID** (General Information).
3. Paste it into **Settings → Advanced → Discord application ID** and press Enter.

Album art is sent as the raw YouTube Music image URL, so you do **not** need to
upload art assets to your Discord application.

👉 Full walkthrough: **[RUNNING.md](RUNNING.md)**.

---

## Settings

| Setting | What it does |
| --- | --- |
| Enable Rich Presence | Master on/off for updating Discord |
| Show album artwork | Toggle the large image |
| Keep presence while paused | Show a paused status vs. clearing it |
| Refresh interval | How often the resolver reconciles state (1–15s) |
| Launch on startup | Start hidden to tray on login |
| Minimize to tray | Closing the window hides instead of quitting |
| Debug logging | Verbose `main.log` (in the app's logs folder) |
| Bridge port *(advanced)* | Local WebSocket port (must match the extension) |
| Discord application ID *(advanced)* | Use your own Discord app |

---

## Reliability & error handling

The app is built to degrade gracefully — every failure mode has a defined behavior:

| Situation | Behavior |
| --- | --- |
| **Discord closed / not running** | Status shows *Discord not running*; sweeps all 10 IPC pipes and retries with exponential backoff (capped at 30s). |
| **Discord restarts** | Reconnects automatically and re-applies the last activity. |
| **Browser/tab closed** | Bridge connection drops → presence is cleared. |
| **Network interruptions** | Irrelevant to presence (all traffic is loopback); art simply won't render until reachable. |
| **Missing metadata** | Title/artist fall back to safe placeholders; art/album/timestamps are simply omitted. |
| **Track changes** | Detected by id change → an immediate (un-throttled) presence update. |
| **Paused playback** | Shown with no progress bar (Discord can't freeze a live timer) and the frozen position in the artwork hover text, or cleared — per *Keep presence while paused*. |
| **Seeking** | The timeline is anchored to the *observed* position, so a seek shifts the anchor and is re-synced; elapsed/remaining keeps matching YouTube Music. |
| **Multiple YTM tabs** | The on-screen track stays selected while it keeps playing (hysteresis — no thrashing); otherwise the most recently active *playing* source wins, with paused sources as the fallback. |
| **Rate limiting** | Non-essential updates are throttled (~1 per 3.5s); Discord advances the timeline itself from the timestamps. |

Logs are written to:

- **Windows**: `%APPDATA%\ytmusic-discord-rpc\logs\main.log`
- **macOS**: `~/Library/Logs/ytmusic-discord-rpc/main.log`
- **Linux**: `~/.config/ytmusic-discord-rpc/logs/main.log`

---

## Privacy & security

- **No telemetry. No accounts. No external servers.** All processing is local.
- The WebSocket bridge binds to **127.0.0.1 only** and rejects non-loopback peers.
- The renderer is **sandboxed** with `contextIsolation` and no Node integration;
  it talks to the main process exclusively through a small, typed `window.api`.
- The extension's host access is limited to `music.youtube.com` and loopback.
- **Dependencies:** `npm audit` reports **0 vulnerabilities**. The only runtime
  dependency is `ws`; everything else is dev/build tooling (Electron 42, Vite 7,
  electron-vite 5, electron-builder 26) kept current. No native modules.

---

## Troubleshooting

- **Discord status is red/grey** → make sure the **Discord desktop app** (not the
  browser version) is open, then click **Reconnect**.
- **YouTube Music status is grey** → the extension isn't connected. Reload the
  YTM tab; confirm the extension is loaded; check the *Bridge port* matches.
- **No album art in Discord** → enable *Show album artwork*; some tracks expose
  no art. Discord also caches external images briefly.
- **Port already in use** → change *Bridge port* in Advanced settings and set the
  same value in the extension (see its README).

---

## License

MIT — see headers. Not affiliated with Google, YouTube, or Discord.
