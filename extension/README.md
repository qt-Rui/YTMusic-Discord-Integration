# YTMusic Discord RPC — Browser Bridge Extension

This tiny extension reads YouTube Music's now-playing metadata and forwards it to
the desktop app over a **loopback-only** WebSocket (`ws://127.0.0.1:9863`).
Nothing is collected, stored, or sent anywhere else.

## What it reads

- `navigator.mediaSession.metadata` → title, artist, album, artwork
- the page's `<video>` element → position, duration, play/pause state

## Install — Chromium (Chrome, Edge, Brave, Vivaldi, Opera)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Open <https://music.youtube.com> and play a song.

The desktop app's **YouTube Music** status should turn green ("1 source connected").

## Install — Firefox

Firefox needs the Manifest V2 file:

1. Rename `manifest.firefox.json` → `manifest.json`
   (back up the original MV3 `manifest.json` first if you want to keep it).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the `manifest.json` in this folder.
4. Open <https://music.youtube.com> and play a song.

> Temporary add-ons are removed when Firefox restarts. To keep it permanently,
> package and sign it via [AMO](https://addons.mozilla.org/developers/) or use
> Firefox Developer/ESR with `xpinstall.signatures.required` disabled.

## Changing the port

If you changed **Bridge port** in the desktop app's Advanced settings, tell the
extension the new port from its service worker / background console:

```js
chrome.storage.local.set({ bridgePort: 9999 })
```

(Default is `9863`.)

## Privacy

- Host access is limited to `music.youtube.com` and `127.0.0.1` / `localhost`.
- The only network connection is the loopback WebSocket to your own machine.
- No analytics, no remote endpoints, no background fetching.
