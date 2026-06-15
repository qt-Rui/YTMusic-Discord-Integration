import { useEffect, useState, type JSX } from 'react'
import type { AppSettings } from '../../types/settings'
import { SETTINGS_BOUNDS } from '../../types/settings'

interface Props {
  settings: AppSettings
  onChange(patch: Partial<AppSettings>): void
}

export function SettingsPanel({ settings, onChange }: Props): JSX.Element {
  return (
    <section className="card settings">
      <h2 className="settings__title">Settings</h2>

      <Toggle
        label="Enable Rich Presence"
        hint="Master switch for updating Discord"
        checked={settings.enableRichPresence}
        onChange={(v) => onChange({ enableRichPresence: v })}
      />
      <Toggle
        label="Show album artwork"
        checked={settings.showArtwork}
        onChange={(v) => onChange({ showArtwork: v })}
      />
      <Toggle
        label="Keep presence while paused"
        hint="Otherwise the status clears when you pause"
        checked={settings.showWhenPaused}
        onChange={(v) => onChange({ showWhenPaused: v })}
      />

      <div className="settings__row">
        <div className="settings__label">
          <span>Refresh interval</span>
          <span className="settings__hint">{(settings.refreshIntervalMs / 1000).toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={SETTINGS_BOUNDS.refreshIntervalMs.min}
          max={SETTINGS_BOUNDS.refreshIntervalMs.max}
          step={500}
          value={settings.refreshIntervalMs}
          onChange={(e) => onChange({ refreshIntervalMs: Number(e.target.value) })}
        />
      </div>

      <Toggle
        label="Launch on startup"
        checked={settings.launchOnStartup}
        onChange={(v) => onChange({ launchOnStartup: v })}
      />
      <Toggle
        label="Minimize to tray"
        hint="Closing the window hides it instead of quitting"
        checked={settings.minimizeToTray}
        onChange={(v) => onChange({ minimizeToTray: v })}
      />
      <Toggle
        label="Debug logging"
        hint="Verbose logs to main.log"
        checked={settings.debugLogging}
        onChange={(v) => onChange({ debugLogging: v })}
      />

      <details className="settings__advanced">
        <summary>Advanced</summary>

        <NumberField
          label="Bridge port"
          hint="Must match the browser extension"
          value={settings.bridgePort}
          min={SETTINGS_BOUNDS.bridgePort.min}
          max={SETTINGS_BOUNDS.bridgePort.max}
          onCommit={(v) => onChange({ bridgePort: v })}
        />
        <TextField
          label="Discord application ID"
          hint="Override with your own Discord app for custom assets"
          value={settings.discordClientId}
          onCommit={(v) => onChange({ discordClientId: v })}
        />
      </details>
    </section>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange(v: boolean): void
}): JSX.Element {
  return (
    <label className="settings__row settings__row--toggle">
      <div className="settings__label">
        <span>{label}</span>
        {hint && <span className="settings__hint">{hint}</span>}
      </div>
      <span className={`switch ${checked ? 'switch--on' : ''}`}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch__knob" />
      </span>
    </label>
  )
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onCommit
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onCommit(v: number): void
}): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = (): void => {
    const n = Number(draft)
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, Math.round(n))))
    else setDraft(String(value))
  }

  return (
    <div className="settings__row">
      <div className="settings__label">
        <span>{label}</span>
        {hint && <span className="settings__hint">{hint}</span>}
      </div>
      <input
        type="number"
        className="input input--num"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </div>
  )
}

function TextField({
  label,
  hint,
  value,
  onCommit
}: {
  label: string
  hint?: string
  value: string
  onCommit(v: string): void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const commit = (): void => {
    const v = draft.trim()
    if (v) onCommit(v)
    else setDraft(value)
  }

  return (
    <div className="settings__row settings__row--stack">
      <div className="settings__label">
        <span>{label}</span>
        {hint && <span className="settings__hint">{hint}</span>}
      </div>
      <input
        type="text"
        className="input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </div>
  )
}
