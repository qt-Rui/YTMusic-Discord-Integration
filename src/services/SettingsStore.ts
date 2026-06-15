import { EventEmitter } from 'node:events'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { AppSettings, DEFAULT_SETTINGS, SETTINGS_BOUNDS } from '../types/settings'
import type { Logger } from './Logger'

/**
 * Persists {@link AppSettings} to a single JSON file and emits `change` events.
 *
 * Validation/clamping happens on every read and write so a hand-edited or
 * corrupt file can never put the app into an invalid state.
 */
export class SettingsStore extends EventEmitter {
  private current: AppSettings

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger
  ) {
    super()
    this.current = this.load()
  }

  get(): AppSettings {
    return this.current
  }

  /** Apply a partial patch, persist it, and notify listeners. */
  update(patch: Partial<AppSettings>): AppSettings {
    const merged = normalize({ ...this.current, ...patch })
    const changed = JSON.stringify(merged) !== JSON.stringify(this.current)
    this.current = merged
    if (changed) {
      this.persist()
      this.emit('change', this.current)
      this.logger.debug('settings', 'updated', patch)
    }
    return this.current
  }

  private load(): AppSettings {
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<AppSettings>
        return normalize({ ...DEFAULT_SETTINGS, ...raw })
      }
    } catch (err) {
      this.logger.warn('settings', 'failed to read, using defaults', String(err))
    }
    const defaults = { ...DEFAULT_SETTINGS }
    return defaults
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.current, null, 2), 'utf-8')
    } catch (err) {
      this.logger.error('settings', 'failed to persist', String(err))
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Coerce arbitrary input into a valid, fully-populated settings object. */
function normalize(input: Partial<AppSettings>): AppSettings {
  return {
    enableRichPresence: Boolean(input.enableRichPresence ?? DEFAULT_SETTINGS.enableRichPresence),
    refreshIntervalMs: clamp(
      Number(input.refreshIntervalMs ?? DEFAULT_SETTINGS.refreshIntervalMs),
      SETTINGS_BOUNDS.refreshIntervalMs.min,
      SETTINGS_BOUNDS.refreshIntervalMs.max
    ),
    launchOnStartup: Boolean(input.launchOnStartup ?? DEFAULT_SETTINGS.launchOnStartup),
    minimizeToTray: Boolean(input.minimizeToTray ?? DEFAULT_SETTINGS.minimizeToTray),
    debugLogging: Boolean(input.debugLogging ?? DEFAULT_SETTINGS.debugLogging),
    showArtwork: Boolean(input.showArtwork ?? DEFAULT_SETTINGS.showArtwork),
    showWhenPaused: Boolean(input.showWhenPaused ?? DEFAULT_SETTINGS.showWhenPaused),
    bridgePort: clamp(
      Number(input.bridgePort ?? DEFAULT_SETTINGS.bridgePort),
      SETTINGS_BOUNDS.bridgePort.min,
      SETTINGS_BOUNDS.bridgePort.max
    ),
    discordClientId:
      String(input.discordClientId ?? DEFAULT_SETTINGS.discordClientId).trim() ||
      DEFAULT_SETTINGS.discordClientId
  }
}
