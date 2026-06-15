import type { AppSettings } from './settings'
import type { Track } from './track'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

/** The full snapshot of app state the main process pushes to the renderer. */
export interface AppState {
  discord: {
    status: ConnectionStatus
    /** Human-readable detail, e.g. "Discord not running". */
    detail: string | null
  }
  bridge: {
    status: ConnectionStatus
    /** Number of connected sources (browser tabs/extensions). */
    clients: number
    detail: string | null
  }
  /** The track currently being presented, or null when nothing is playing. */
  track: Track | null
  settings: AppSettings
}

/** IPC channel names — single source of truth shared by main + preload. */
export const IpcChannels = {
  /** main -> renderer: full state push whenever anything changes. */
  StateUpdate: 'state:update',
  /** renderer -> main: request the current state once (on mount). */
  GetState: 'state:get',
  /** renderer -> main: persist a partial settings patch. */
  UpdateSettings: 'settings:update',
  /** renderer -> main: window controls. */
  WindowMinimize: 'window:minimize',
  WindowHide: 'window:hide',
  WindowClose: 'window:close',
  /** renderer -> main: open the bundled extension folder in the file manager. */
  OpenExtensionFolder: 'app:open-extension-folder',
  /** renderer -> main: force a Discord reconnect attempt. */
  ReconnectDiscord: 'discord:reconnect'
} as const

/** Shape of the API exposed on `window.api` by the preload script. */
export interface RendererApi {
  getState(): Promise<AppState>
  updateSettings(patch: Partial<AppSettings>): Promise<AppState>
  onStateUpdate(listener: (state: AppState) => void): () => void
  minimizeWindow(): void
  hideWindow(): void
  closeWindow(): void
  openExtensionFolder(): void
  reconnectDiscord(): void
}
