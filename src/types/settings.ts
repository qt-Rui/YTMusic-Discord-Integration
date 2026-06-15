/** User-configurable settings, persisted to disk in `userData/settings.json`. */
export interface AppSettings {
  /** Master switch for pushing presence to Discord. */
  enableRichPresence: boolean
  /** How often (ms) the resolver re-evaluates state and reconciles Discord. */
  refreshIntervalMs: number
  /** Start the app when the OS user logs in. */
  launchOnStartup: boolean
  /** Hide to the system tray instead of quitting on window close. */
  minimizeToTray: boolean
  /** Verbose logging to file + console. */
  debugLogging: boolean
  /** Show artwork in presence (off = text only). */
  showArtwork: boolean
  /** Keep presence visible while paused (shows "Paused"); off = clear it. */
  showWhenPaused: boolean
  /** Local TCP port the WebSocket bridge listens on (must match the extension). */
  bridgePort: number
  /** Discord application (client) id used for the Rich Presence assets. */
  discordClientId: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  enableRichPresence: true,
  refreshIntervalMs: 2000,
  launchOnStartup: false,
  minimizeToTray: true,
  debugLogging: false,
  showArtwork: true,
  showWhenPaused: true,
  bridgePort: 9863,
  // Default public application id created for this project's RPC assets.
  // Override it with your own Discord application id in Settings if you like.
  discordClientId: '1248000000000000000'
}

/** Bounds used to validate/normalize settings coming from the UI or disk. */
export const SETTINGS_BOUNDS = {
  refreshIntervalMs: { min: 1000, max: 15000 },
  bridgePort: { min: 1024, max: 65535 }
} as const
