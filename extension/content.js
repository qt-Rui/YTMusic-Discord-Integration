/**
 * YTMusic Discord RPC — content script.
 *
 * Runs inside music.youtube.com. It reads the page's own Media Session metadata
 * (title/artist/album/artwork) plus the underlying <video> element (position,
 * duration, play state) and forwards a normalized snapshot to the extension's
 * background worker, which relays it to the local desktop app.
 *
 * It reads only what the page already exposes — nothing is collected or sent
 * anywhere except the loopback bridge on your own machine.
 */
;(() => {
  'use strict'

  const POLL_MS = 1000
  // Re-send unchanged state at least this often so the desktop app keeps the
  // source "fresh" (e.g. while paused) and the MV3 background worker stays warm.
  const HEARTBEAT_MS = 10000
  let lastSerialized = ''
  let lastPostAt = 0
  let hadTrack = false
  // Identity of the last track we actually reported, used to detect the
  // song-change race (see the stale-transition guard in tick()).
  let lastTrackId = null

  /** Pick the largest available artwork and bump it to a Discord-friendly size. */
  function pickArtwork(artwork) {
    if (!artwork || !artwork.length) return null
    let best = artwork[0]
    let bestArea = 0
    for (const a of artwork) {
      const dim = parseInt((a.sizes || '0x0').split('x')[0], 10) || 0
      if (dim >= bestArea) {
        bestArea = dim
        best = a
      }
    }
    return upgradeArtwork(best && best.src ? best.src : null)
  }

  function upgradeArtwork(url) {
    if (!url || typeof url !== 'string') return null
    if (!/^https:\/\//i.test(url)) return null
    // Google/YTM art URLs end with a size token like "=w120-h120-l90-rj".
    return url.replace(/=w\d+-h\d+(-[a-z0-9-]+)?$/i, '=w512-h512-l90-rj')
  }

  function findVideo() {
    // YTM plays audio through an HTML5 <video> element.
    const videos = document.querySelectorAll('video')
    for (const v of videos) {
      if (v.src || v.currentSrc) return v
    }
    return videos[0] || null
  }

  function readSnapshot() {
    const ms = navigator.mediaSession
    const meta = ms && ms.metadata
    const video = findVideo()
    if (!meta || !meta.title || !video) return null

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const isPlaying = !video.paused && !video.ended && video.readyState >= 2

    return {
      title: String(meta.title),
      artist: String(meta.artist || ''),
      album: meta.album ? String(meta.album) : null,
      artworkUrl: pickArtwork(meta.artwork),
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration,
      isPlaying,
      trackId: `${meta.title}::${meta.artist}::${meta.album || ''}`
    }
  }

  function tick() {
    let snapshot
    try {
      snapshot = readSnapshot()
    } catch (err) {
      return
    }

    if (!snapshot) {
      if (hadTrack) {
        hadTrack = false
        lastSerialized = ''
        lastTrackId = null
        lastPostAt = Date.now()
        post({ type: 'clear', v: 1 })
      }
      return
    }

    // Guard against the song-change race. When YouTube Music advances to the
    // next track it swaps the Media Session metadata (title/artist -> our
    // trackId) a beat before the underlying <video> reloads and resets its
    // currentTime/duration. In that window we'd read the NEW song's identity
    // alongside the OLD song's near-end position, making the desktop app (and
    // Discord) show the fresh song already at its end. Skip such a transitional
    // read and wait for the next poll, by which point the <video> has reset.
    const isNewTrack = lastTrackId !== null && snapshot.trackId !== lastTrackId
    const looksFinished =
      snapshot.duration > 0 && snapshot.position >= snapshot.duration - 1
    if (isNewTrack && looksFinished) return

    hadTrack = true
    lastTrackId = snapshot.trackId
    // Round position so tiny sub-second jitter doesn't generate noise.
    const serialized = JSON.stringify({
      ...snapshot,
      position: Math.round(snapshot.position)
    })
    const now = Date.now()
    const changed = serialized !== lastSerialized
    // Skip only when nothing changed AND we sent recently — the heartbeat keeps
    // a held pause alive without spamming during normal playback.
    if (!changed && now - lastPostAt < HEARTBEAT_MS) return
    lastSerialized = serialized
    lastPostAt = now

    post({ type: 'update', v: 1, track: snapshot })
  }

  function post(message) {
    try {
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError)
    } catch (err) {
      /* background may be reloading; next tick retries */
    }
  }

  // React quickly to obvious transport events, in addition to the steady poll.
  const fastEvents = ['play', 'pause', 'ended', 'seeked', 'loadedmetadata']
  for (const evt of fastEvents) {
    document.addEventListener(evt, () => setTimeout(tick, 50), true)
  }

  setInterval(tick, POLL_MS)
  tick()

  // Make sure presence clears if the tab is closed/navigated away.
  window.addEventListener('pagehide', () => post({ type: 'clear', v: 1 }))
})()
