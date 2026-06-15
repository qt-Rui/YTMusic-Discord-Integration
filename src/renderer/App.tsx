import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { AppState } from '../types/ipc'
import { StatusIndicator } from './components/StatusIndicator'
import { TrackPreview } from './components/TrackPreview'
import { SettingsPanel } from './components/Settings'

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  // Wall-clock time when the currently displayed track/play-state began on the
  // client, used to animate the progress bar without extra IPC traffic.
  const [trackEpoch, setTrackEpoch] = useState<number>(Date.now())
  const lastSigRef = useRef<string>('')

  useEffect(() => {
    let mounted = true

    void window.api.getState().then((initial) => {
      if (mounted) setState(initial)
    })

    const unsubscribe = window.api.onStateUpdate((next) => {
      setState(next)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // Reset the progress epoch whenever the track identity or play-state changes.
  useEffect(() => {
    const t = state?.track
    const sig = t ? `${t.id}:${t.isPlaying}:${t.position}` : 'none'
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig
      setTrackEpoch(Date.now())
    }
  }, [state?.track])

  const updateSettings = useMemo(
    () => (patch: Parameters<typeof window.api.updateSettings>[0]) => {
      void window.api.updateSettings(patch).then(setState)
    },
    []
  )

  if (!state) {
    return (
      <div className="app app--loading">
        <div className="spinner" />
        <span>Starting…</span>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden>
            ♪
          </span>
          <div>
            <h1>YTMusic · Discord</h1>
            <p className="app__subtitle">Rich Presence for YouTube Music</p>
          </div>
        </div>
      </header>

      <main className="app__main">
        <StatusIndicator
          discord={state.discord}
          bridge={state.bridge}
          onReconnect={() => window.api.reconnectDiscord()}
          onOpenExtensionFolder={() => window.api.openExtensionFolder()}
        />

        <TrackPreview
          track={state.track}
          epoch={trackEpoch}
          enabled={state.settings.enableRichPresence}
        />

        <SettingsPanel settings={state.settings} onChange={updateSettings} />
      </main>

      <footer className="app__footer">
        <span>100% local · no telemetry</span>
        <button className="link" onClick={() => window.api.hideWindow()}>
          Hide to tray
        </button>
      </footer>
    </div>
  )
}
