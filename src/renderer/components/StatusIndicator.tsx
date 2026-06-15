import type { JSX } from 'react'
import type { AppState, ConnectionStatus } from '../../types/ipc'

interface Props {
  discord: AppState['discord']
  bridge: AppState['bridge']
  onReconnect(): void
  onOpenExtensionFolder(): void
}

const LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
  error: 'Error'
}

export function StatusIndicator({
  discord,
  bridge,
  onReconnect,
  onOpenExtensionFolder
}: Props): JSX.Element {
  const noSource = bridge.status !== 'connected'

  return (
    <section className="card status">
      <Row
        title="Discord"
        status={discord.status}
        detail={discord.detail ?? LABELS[discord.status]}
        action={
          discord.status !== 'connected' ? (
            <button className="btn btn--sm" onClick={onReconnect}>
              Reconnect
            </button>
          ) : null
        }
      />
      <Row
        title="YouTube Music"
        status={bridge.status}
        detail={
          bridge.status === 'connected'
            ? `${bridge.clients} source${bridge.clients === 1 ? '' : 's'} connected`
            : bridge.detail ?? LABELS[bridge.status]
        }
        action={
          noSource ? (
            <button className="btn btn--sm" onClick={onOpenExtensionFolder}>
              Setup
            </button>
          ) : null
        }
      />
      {noSource && (
        <p className="status__hint">
          No YouTube Music source detected. Install the bundled browser extension and open{' '}
          <strong>music.youtube.com</strong>. Click <em>Setup</em> to reveal the extension folder.
        </p>
      )}
    </section>
  )
}

function Row({
  title,
  status,
  detail,
  action
}: {
  title: string
  status: ConnectionStatus
  detail: string
  action: JSX.Element | null
}): JSX.Element {
  return (
    <div className="status__row">
      <span className={`dot dot--${status}`} aria-hidden />
      <div className="status__text">
        <span className="status__title">{title}</span>
        <span className="status__detail">{detail}</span>
      </div>
      {action}
    </div>
  )
}
