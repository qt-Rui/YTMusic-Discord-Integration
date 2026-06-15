# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not open a public issue**. Instead,
report it privately via GitHub's
[**Report a vulnerability**](https://github.com/qt-Rui/YouTube-Music-Discord-Integration/security/advisories/new)
button (Security → Advisories), or email the maintainer.

Please include steps to reproduce and the affected version. You'll get an
acknowledgement within a few days, and a fix or mitigation as soon as practical.

## Security posture

This project is designed to stay entirely on your machine:

- **No telemetry, no accounts, no external servers.** All processing is local.
- The WebSocket bridge binds to **`127.0.0.1` only** and rejects non-loopback peers.
- The Electron renderer runs **sandboxed** with `contextIsolation: true`,
  `nodeIntegration: false`, and a restrictive Content-Security-Policy. It talks to
  the main process only through a small, typed `window.api` (contextBridge).
- All inbound data (bridge payloads, settings, artwork URLs) is **validated and
  clamped**; malformed input is dropped, never trusted.
- The browser extension's host access is limited to `music.youtube.com` and
  loopback. The only network connection it makes is the loopback bridge.
- The single runtime dependency is `ws`; everything else is dev/build tooling.
  `npm audit` reports **0 vulnerabilities**. No native modules.

## Scope

The bridge intentionally has no authentication because it only accepts loopback
connections. On a shared machine, any local process could connect to the bridge
port and send fake "now playing" data (cosmetic presence spoofing only — no data
is exposed). This is an accepted trade-off for a single-user local app.
