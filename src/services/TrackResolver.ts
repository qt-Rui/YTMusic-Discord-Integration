import { EventEmitter } from 'node:events'
import type { Logger } from './Logger'
import type { SettingsStore } from './SettingsStore'
import { DiscordPresenceService, type DiscordActivity } from './DiscordPresenceService'
import type { MediaBridgeServer } from './MediaBridgeServer'
import type { BridgePayload, Track } from '../types/track'

/**
 * Minimum gap between presence pushes that aren't track/play-state changes.
 * Kept at/above Discord's activity rate limit (~5 per 20s) so frequent
 * re-syncs can never get us throttled by Discord.
 */
const THROTTLE_MS = 4000
/** A source whose last update is older than this is treated as gone. */
const STALE_MS = 30_000
/**
 * Re-sync the Discord timeline when the anchored start time shifts more than
 * this — i.e. the user seeked, or playback drifted (an ad/buffering). Small
 * because the anchor is now stable during normal 1× playback.
 */
const RESYNC_TOLERANCE_MS = 1000
/** Refresh the UI preview if playback position jumps more than this (a seek). */
const UI_SEEK_TOLERANCE_S = 2
/** Discord activity type 2 = "Listening to". */
const ACTIVITY_TYPE_LISTENING = 2

interface SourceEntry {
  track: Track | null
  updatedAt: number
}

interface PushSignature {
  id: string
  isPlaying: boolean
  startMs: number
  cleared: boolean
}

/**
 * The brain of the app. Aggregates every media source, decides which one is the
 * "now playing" truth (the fallback hierarchy), and reconciles that against
 * Discord with sensible throttling.
 *
 * It owns no transport logic itself — it just listens to the bridge and drives
 * the Discord service, emitting a `track` event so the UI can mirror state.
 */
export class TrackResolver extends EventEmitter {
  private readonly sources = new Map<string, SourceEntry>()
  private tickTimer: NodeJS.Timeout | null = null
  private current: Track | null = null
  private lastPush: PushSignature | null = null
  private lastPushAt = 0
  /** Last snapshot mirrored to the UI + when, used to detect UI-visible seeks. */
  private lastUiEmit: Track | null = null
  private lastUiEmitAt = 0

  constructor(
    private readonly settings: SettingsStore,
    private readonly discord: DiscordPresenceService,
    private readonly bridge: MediaBridgeServer,
    private readonly logger: Logger
  ) {
    super()
  }

  start(): void {
    this.bridge.on('message', this.handleBridgeMessage)
    this.bridge.on('disconnect', this.handleSourceGone)
    this.discord.on('connected', this.handleDiscordConnected)
    this.restartTick()
  }

  stop(): void {
    this.bridge.off('message', this.handleBridgeMessage)
    this.bridge.off('disconnect', this.handleSourceGone)
    this.discord.off('connected', this.handleDiscordConnected)
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
  }

  getCurrentTrack(): Track | null {
    return this.current
  }

  /** Re-arm the periodic reconcile loop using the current refresh interval. */
  restartTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = setInterval(() => this.reconcile(), this.settings.get().refreshIntervalMs)
  }

  /** Called when settings change so we can immediately re-evaluate. */
  onSettingsChanged(): void {
    this.restartTick()
    this.reconcile(true)
  }

  // ---------------------------------------------------------------------------
  // Event handlers (bound as arrow fns so they can be removed cleanly)
  // ---------------------------------------------------------------------------

  private handleBridgeMessage = (clientId: string, payload: BridgePayload): void => {
    if (payload.type === 'hello') return
    if (payload.type === 'clear') {
      this.sources.set(clientId, { track: null, updatedAt: Date.now() })
    } else if (payload.type === 'update' && payload.track) {
      this.sources.set(clientId, {
        track: toTrack(payload),
        updatedAt: Date.now()
      })
    }
    this.reconcile()
  }

  private handleSourceGone = (clientId: string): void => {
    this.sources.delete(clientId)
    this.reconcile()
  }

  private handleDiscordConnected = (): void => {
    // The Discord service already re-flushes its last activity, but re-running
    // reconcile guarantees the freshest snapshot is what gets restored.
    this.lastPush = null
    this.reconcile(true)
  }

  // ---------------------------------------------------------------------------
  // Core reconcile
  // ---------------------------------------------------------------------------

  /**
   * Evaluate all sources, pick the active track, update the UI, and push to (or
   * clear from) Discord. `force` bypasses the throttle for an immediate sync.
   */
  private reconcile(force = false): void {
    const settings = this.settings.get()
    const active = this.pickActiveTrack()

    // Always keep the freshest snapshot so a newly-mounted UI gets exact state.
    this.current = active
    // Notify the UI on identity / play-state / artwork changes AND on seeks.
    if (this.shouldEmitForUi(active)) {
      this.lastUiEmit = active
      this.lastUiEmitAt = Date.now()
      this.emit('track', active)
    }

    if (!settings.enableRichPresence) {
      this.clearPresence()
      return
    }

    const shouldShow =
      active !== null && (active.isPlaying || settings.showWhenPaused)

    if (!shouldShow) {
      this.clearPresence()
      return
    }

    this.pushPresence(active as Track, force)
  }

  /**
   * Fallback hierarchy among all live sources:
   *   1. Stickiness — if the track we're already showing is still playing, keep
   *      it. This stops the presence thrashing between two simultaneously
   *      playing sources (e.g. two YouTube Music tabs).
   *   2. Otherwise prefer the most recently updated *playing* source.
   *   3. Otherwise fall back to the most recently updated *paused* source, so a
   *      paused track can still be shown.
   */
  private pickActiveTrack(): Track | null {
    const now = Date.now()
    let playing: { track: Track; updatedAt: number } | null = null
    let paused: { track: Track; updatedAt: number } | null = null

    for (const entry of this.sources.values()) {
      if (!entry.track) continue
      if (now - entry.updatedAt > STALE_MS) continue
      // Stickiness: the source currently on screen wins while it keeps playing.
      if (entry.track.isPlaying && this.current && entry.track.id === this.current.id) {
        return entry.track
      }
      if (entry.track.isPlaying) {
        if (!playing || entry.updatedAt > playing.updatedAt) {
          playing = { track: entry.track, updatedAt: entry.updatedAt }
        }
      } else if (!paused || entry.updatedAt > paused.updatedAt) {
        paused = { track: entry.track, updatedAt: entry.updatedAt }
      }
    }
    return (playing ?? paused)?.track ?? null
  }

  /**
   * Decide whether the UI preview needs a refresh. We notify on identity,
   * play/pause and artwork changes, and — crucially — on seeks, detected as the
   * position jumping away from where free-running playback would have put it.
   */
  private shouldEmitForUi(next: Track | null): boolean {
    const prev = this.lastUiEmit
    if (prev === next) return false
    if (!prev || !next) return true
    if (
      prev.id !== next.id ||
      prev.isPlaying !== next.isPlaying ||
      prev.artworkUrl !== next.artworkUrl
    ) {
      return true
    }
    if (next.isPlaying) {
      const expected = prev.position + (Date.now() - this.lastUiEmitAt) / 1000
      return Math.abs(next.position - expected) > UI_SEEK_TOLERANCE_S
    }
    return Math.abs(next.position - prev.position) > UI_SEEK_TOLERANCE_S
  }

  private clearPresence(): void {
    if (this.lastPush?.cleared) return
    this.discord.setActivity(null)
    this.lastPush = { id: '', isPlaying: false, startMs: 0, cleared: true }
    this.logger.debug('resolver', 'presence cleared')
  }

  private pushPresence(track: Track, force: boolean): void {
    // Anchor the timeline to WHEN the position was observed (track.timestamp),
    // not to "now". The position was sampled in the browser slightly before we
    // got here, so using push-time would make Discord lag and would spuriously
    // shift the start whenever a stale snapshot is re-evaluated. This anchor is
    // invariant during normal 1× playback, so Discord's clock stays in lockstep
    // with YouTube Music's.
    const startMs = track.timestamp - Math.round(track.position * 1000)
    const prev = this.lastPush

    const trackChanged = !prev || prev.cleared || prev.id !== track.id
    const playStateChanged = !!prev && prev.isPlaying !== track.isPlaying
    // A shift in the anchor while playing means the user seeked or playback
    // drifted (ad/buffering) — re-sync so the shown time stays correct.
    const resync =
      !!prev &&
      !prev.cleared &&
      track.isPlaying &&
      Math.abs(startMs - prev.startMs) > RESYNC_TOLERANCE_MS

    const meaningful = trackChanged || playStateChanged || resync || force
    if (!meaningful) return

    // Throttle resyncs to respect Discord's rate limit; always let track and
    // play/pause changes through immediately.
    const isEssential = trackChanged || playStateChanged || force
    if (!isEssential && Date.now() - this.lastPushAt < THROTTLE_MS) return

    this.discord.setActivity(buildActivity(track, startMs, this.settings.get().showArtwork))
    this.lastPush = { id: track.id, isPlaying: track.isPlaying, startMs, cleared: false }
    this.lastPushAt = Date.now()
    this.logger.debug(
      'resolver',
      'presence pushed',
      track.title,
      track.isPlaying ? 'playing' : 'paused',
      `pos=${track.position.toFixed(1)}s`,
      `elapsed@push=${((Date.now() - startMs) / 1000).toFixed(1)}s`
    )
  }
}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

/** Normalize a raw bridge payload into the canonical {@link Track}. */
function toTrack(payload: BridgePayload): Track {
  const t = payload.track!
  const title = t.title.trim()
  const artist = t.artist.trim()
  const duration = clampNum(t.duration, 0)
  // A position can never exceed the track's duration. Clamping it guards the
  // anchored Discord timeline (end = start + duration) against an inconsistent
  // snapshot — e.g. a position carried over from a previous song during a
  // track change — which would otherwise render the track already at its end.
  const rawPosition = clampNum(t.position, 0)
  const position = duration > 0 ? Math.min(rawPosition, duration) : rawPosition
  return {
    id: t.trackId?.trim() || `${title}::${artist}`,
    title,
    artist,
    album: t.album?.trim() || null,
    artworkUrl: normalizeArtwork(t.artworkUrl),
    position,
    duration,
    isPlaying: Boolean(t.isPlaying),
    source: 'extension',
    timestamp: Date.now()
  }
}

function normalizeArtwork(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  if (!/^https:\/\//i.test(url)) return null
  return url.length > 256 ? null : url
}

function clampNum(n: unknown, fallback: number): number {
  const v = Number(n)
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

/** Build the Discord activity object from a track. */
function buildActivity(track: Track, startMs: number, showArtwork: boolean): DiscordActivity {
  const activity: DiscordActivity = {
    type: ACTIVITY_TYPE_LISTENING,
    details: fitText(track.title, 'Unknown title'),
    state: fitText(track.artist, 'Unknown artist'),
    instance: false
  }

  // Timestamps drive Discord's elapsed/remaining bar. We only attach them while
  // playing: Discord always advances them in real time, so attaching them while
  // paused would show a *wrong* moving time. With both start and end Discord
  // renders the elapsed/remaining progress bar that mirrors YouTube Music.
  if (track.isPlaying && track.duration > 0) {
    activity.timestamps = { start: startMs, end: startMs + Math.round(track.duration * 1000) }
  } else if (track.isPlaying) {
    activity.timestamps = { start: startMs }
  }

  if (showArtwork && track.artworkUrl) {
    // While paused there's no moving bar, so surface the frozen position as the
    // image hover text (e.g. "⏸ 1:30 / 3:54") so the YTM time is still visible.
    const largeText = track.isPlaying
      ? (track.album ?? track.title)
      : track.duration > 0
        ? `⏸ ${formatClock(track.position)} / ${formatClock(track.duration)}`
        : '⏸ Paused'
    activity.assets = {
      large_image: track.artworkUrl,
      large_text: fitText(largeText, 'YouTube Music')
    }
  }

  const query = encodeURIComponent(`${track.title} ${track.artist}`.trim())
  activity.buttons = [
    { label: 'Search on YouTube Music', url: `https://music.youtube.com/search?q=${query}` }
  ]

  return activity
}

/** Format seconds as m:ss (matching YouTube Music's readout). */
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Discord requires details/state strings to be 2–128 chars. */
function fitText(value: string, fallback: string): string {
  const v = (value || '').trim() || fallback
  if (v.length < 2) return (v + ' ').padEnd(2, ' ')
  return v.length > 128 ? v.slice(0, 127) + '…' : v
}
