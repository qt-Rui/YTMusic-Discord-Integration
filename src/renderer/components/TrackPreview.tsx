import { useEffect, useState, type JSX } from 'react'
import type { Track } from '../../types/track'

interface Props {
  track: Track | null
  /** Client wall-clock time the current track/play-state began. */
  epoch: number
  enabled: boolean
}

export function TrackPreview({ track, epoch, enabled }: Props): JSX.Element {
  // A 1s tick drives the elapsed counter locally (no extra IPC chatter).
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!track?.isPlaying) return
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [track?.isPlaying, track?.id])

  if (!track) {
    return (
      <section className="card track track--empty">
        <div className="track__art track__art--placeholder">♪</div>
        <div className="track__meta">
          <span className="track__title">Nothing playing</span>
          <span className="track__artist">Start a song in YouTube Music</span>
        </div>
      </section>
    )
  }

  const elapsed = track.isPlaying
    ? Math.min(track.position + (Date.now() - epoch) / 1000, track.duration || Infinity)
    : track.position
  const duration = track.duration
  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0

  return (
    <section className="card track">
      <div className="track__art">
        {track.artworkUrl ? (
          // Album art is loaded directly from YouTube Music's CDN over https.
          <img src={track.artworkUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="track__art--placeholder">♪</div>
        )}
        <span className={`track__badge ${track.isPlaying ? 'is-playing' : 'is-paused'}`}>
          {track.isPlaying ? '▶ Playing' : '⏸ Paused'}
        </span>
      </div>

      <div className="track__meta">
        <span className="track__title" title={track.title}>
          {track.title}
        </span>
        <span className="track__artist" title={track.artist}>
          {track.artist}
        </span>
        {track.album && (
          <span className="track__album" title={track.album}>
            {track.album}
          </span>
        )}

        {duration > 0 && (
          <div className="track__progress">
            <div className="track__bar">
              <div className="track__bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="track__times">
              <span>{formatTime(elapsed)}</span>
              <span>-{formatTime(Math.max(0, duration - elapsed))}</span>
            </div>
          </div>
        )}

        {!enabled && <span className="track__note">Rich Presence is disabled in settings</span>}
      </div>
    </section>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
