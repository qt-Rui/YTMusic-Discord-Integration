/**
 * YTMusic Discord RPC — background relay.
 *
 * Holds a WebSocket to the desktop app's local bridge (ws://127.0.0.1:<port>)
 * and forwards now-playing snapshots received from the content script. The
 * content script cannot reliably open the socket itself (page CSP), so the
 * extension background — which has its own origin and host permissions — owns
 * the connection and its reconnection logic.
 *
 * Works as an MV3 service worker (Chromium) and an MV2 event page (Firefox);
 * `chrome.*` is aliased to `browser.*` in Firefox.
 */
const DEFAULT_PORT = 9863

let socket = null
/** Latest payload, re-sent on (re)connect so nothing is lost during a flap. */
let pending = null

function getPort() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('bridgePort', (res) => {
        const p = res && Number(res.bridgePort)
        resolve(p && p >= 1024 && p <= 65535 ? p : DEFAULT_PORT)
      })
    } catch {
      resolve(DEFAULT_PORT)
    }
  })
}

async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return
  }
  const port = await getPort()
  try {
    socket = new WebSocket(`ws://127.0.0.1:${port}`)
  } catch {
    socket = null
    return
  }

  socket.onopen = () => {
    safeSend({ type: 'hello', v: 1 })
    if (pending) safeSend(pending)
  }
  socket.onclose = () => {
    socket = null
  }
  socket.onerror = () => {
    try {
      socket && socket.close()
    } catch {
      /* ignore */
    }
    socket = null
  }
}

function safeSend(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(obj))
      return true
    } catch {
      return false
    }
  }
  return false
}

function forward(payload) {
  pending = payload
  if (!safeSend(payload)) {
    // Not connected yet — kick off a connection; the next tick (or onopen
    // flush) delivers the latest snapshot.
    void connect()
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || (message.type !== 'update' && message.type !== 'clear')) return
  forward(message)
})

// Establish the connection eagerly on startup/install.
chrome.runtime.onStartup?.addListener(() => void connect())
chrome.runtime.onInstalled?.addListener(() => void connect())
void connect()
