/**
 * Canonical representation of a "now playing" track inside the app.
 *
 * Every media provider (the browser-extension bridge today, an OS-native
 * provider tomorrow) must normalize whatever it observes into this shape so the
 * rest of the app never has to care where the data came from.
 */
export interface Track {
  /** Stable-ish identity used to detect "did the track change?". */
  readonly id: string
  readonly title: string
  readonly artist: string
  /** Album name, when the source exposes it. */
  readonly album: string | null
  /** Absolute https URL to album art, when available. */
  readonly artworkUrl: string | null
  /** Current playback position in seconds. */
  readonly position: number
  /** Track length in seconds (0 if unknown, e.g. live streams). */
  readonly duration: number
  /** Whether audio is actively advancing. */
  readonly isPlaying: boolean
  /** Which provider produced this snapshot (for the fallback hierarchy + UI). */
  readonly source: TrackSource
  /** Wall-clock time (ms) the snapshot was captured by the provider. */
  readonly timestamp: number
}

export type TrackSource = 'extension' | 'os-media-session' | 'manual'

/**
 * A provider may also report "nothing is playing / source went away".
 * `null` from a provider means: this source currently has no track.
 */
export type TrackSnapshot = Track | null

/** Raw payload shape sent by the browser extension over the WebSocket bridge. */
export interface BridgePayload {
  readonly type: 'update' | 'clear' | 'hello'
  readonly track?: {
    title: string
    artist: string
    album?: string | null
    artworkUrl?: string | null
    position?: number
    duration?: number
    isPlaying?: boolean
    /** Optional stable id from the page (e.g. videoId). */
    trackId?: string
  }
  /** Extension/protocol version for forward-compat. */
  readonly v?: number
}
