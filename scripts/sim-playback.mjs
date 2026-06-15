/**
 * Dev tool: simulate a realistic YouTube Music session against the running
 * app's bridge, without a browser. Streams the playback position once per second
 * (like the extension does) and performs user actions — seek, pause, resume,
 * song change, stop — so you can verify the Discord timeline stays in sync.
 *
 *   node scripts/sim-playback.mjs [port]
 *
 * Turn on Debug logging in the app to watch each decision (and the computed
 * `elapsed@push`, which should match the streamed position) in main.log.
 */
const PORT = Number(process.argv[2]) || 9863
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)

const A = {
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  album: 'A Night at the Opera',
  artworkUrl: 'https://lh3.googleusercontent.com/aaa=w512-h512',
  duration: 354,
  trackId: 'songA'
}
const B = {
  title: 'Under Pressure',
  artist: 'Queen & David Bowie',
  album: 'Hot Space',
  artworkUrl: 'https://lh3.googleusercontent.com/bbb=w512-h512',
  duration: 248,
  trackId: 'songB'
}

let state = null // { ...meta, position, isPlaying }
let lastTick = Date.now()

function sendNow() {
  if (!state) {
    ws.send(JSON.stringify({ type: 'clear', v: 1 }))
    return
  }
  const { title, artist, album, artworkUrl, duration, trackId, position, isPlaying } = state
  ws.send(
    JSON.stringify({
      type: 'update',
      v: 1,
      track: { title, artist, album, artworkUrl, duration, trackId, position, isPlaying }
    })
  )
}

const action = (ms, label, fn) =>
  setTimeout(() => {
    console.log(`t+${(ms / 1000).toFixed(0)}s  ${label}`)
    fn()
    sendNow() // reflect the action immediately, like the extension's fast events
  }, ms)

ws.onerror = (e) => {
  console.error('Bridge connection failed — is the app running?', e.message || '')
  process.exit(1)
}

ws.onopen = () => {
  console.log(`connected to bridge on ${PORT}\n`)
  state = { ...A, position: 0, isPlaying: true }
  sendNow()

  // Stream position ~1/s, advancing by real elapsed time (mimics the extension).
  const stream = setInterval(() => {
    const now = Date.now()
    if (state && state.isPlaying) state.position += (now - lastTick) / 1000
    lastTick = now
    sendNow()
  }, 1000)

  // Steady playback for ~4s should produce NO extra pushes (anchor is stable).
  action(4000, 'SEEK  -> 180s', () => (state.position = 180))
  action(7000, 'PAUSE @ ~183s', () => (state.isPlaying = false))
  action(10000, 'RESUME', () => (state.isPlaying = true))
  action(13000, 'SEEK  -> 30s (small-ish jump)', () => (state.position = 30))
  action(16000, 'CHANGE -> song B @0s', () => (state = { ...B, position: 0, isPlaying: true }))
  action(19000, 'STOP (clear)', () => (state = null))
  action(21000, 'done', () => {
    clearInterval(stream)
    ws.close()
    process.exit(0)
  })
}
